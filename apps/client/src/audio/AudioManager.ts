type SfxKey =
  | 'shot'
  | 'footstep'
  | 'bulletPickup'
  | 'bulletBodyHit'
  | 'bulletWallHit'
  | 'flyby'
  | 'death'
  | 'reload'
  | 'magEmpty';

interface PlayOptions {
  volume?: number;
  playbackRateMin?: number;
  playbackRateMax?: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface SpatialFootstepOptions extends PlayOptions {
  sourcePosition: Vec3;
  listenerPosition: Vec3;
  listenerYaw: number;
}

class RotationPicker {
  private readonly queue: string[] = [];
  private previous = '';

  constructor(private readonly values: string[]) {}

  next(): string | null {
    if (this.values.length === 0) {
      return null;
    }
    if (this.values.length === 1) {
      return this.values[0] ?? null;
    }

    if (this.queue.length === 0) {
      const shuffled = [...this.values];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapWith = Math.floor(Math.random() * (index + 1));
        const tmp = shuffled[index]!;
        shuffled[index] = shuffled[swapWith]!;
        shuffled[swapWith] = tmp;
      }
      if (shuffled[0] === this.previous) {
        const tail = shuffled[shuffled.length - 1]!;
        shuffled[shuffled.length - 1] = shuffled[0]!;
        shuffled[0] = tail;
      }
      this.queue.push(...shuffled);
    }

    const value = this.queue.shift() ?? null;
    if (value) {
      this.previous = value;
    }
    return value;
  }
}

const range = (count: number, prefix: string, ext: string): string[] =>
  Array.from({ length: count }, (_, index) => `/sfx/${prefix}_${index + 1}.${ext}`);

const SFX_PATHS: Record<SfxKey, string[]> = {
  shot: range(6, 'shot', 'mp3'),
  footstep: range(9, 'footstep', 'mp3'),
  bulletPickup: range(4, 'bullet_pickup', 'mp3'),
  bulletBodyHit: range(4, 'bullet_body_hit', 'mp3'),
  bulletWallHit: range(5, 'bullet_wall_hit', 'mp3'),
  flyby: range(11, 'flyby', 'mp3'),
  death: range(4, 'death', 'mp3'),
  reload: [],
  magEmpty: []
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class AudioManager {
  private static readonly LOBBY_START_OFFSET_SECONDS = 15;
  private static readonly LOBBY_FADE_IN_MS = 1600;
  private static readonly LOBBY_FADE_OUT_MS = 5000;
  private static readonly LOBBY_FADE_OUT_TRIGGER_SECONDS = 15;
  private readonly pickers: Record<SfxKey, RotationPicker>;
  private readonly minReplayGapMs: Partial<Record<SfxKey, number>> = {};
  private readonly lastPlayedAt: Partial<Record<SfxKey, number>> = {};
  private readonly lobbyMusic = new Audio('/music/lobby_theme.mp3');
  private sfxVolume = 0.85;
  private musicVolume = 0.35;
  private lobbyActive = false;
  private audioContext: AudioContext | null = null;
  private readonly decodedBufferByPath = new Map<string, AudioBuffer>();
  private readonly pendingDecodeByPath = new Map<string, Promise<AudioBuffer | null>>();
  private lobbyMonitorId: number | null = null;
  private lobbyFadeInEndsAt = 0;
  private lobbyFadeOutEndsAt = 0;
  private lobbyRestartAt = 0;
  private backgroundPauseAt = 0;
  private pageSuppressed = false;

  constructor() {
    this.pickers = {
      shot: new RotationPicker(SFX_PATHS.shot),
      footstep: new RotationPicker(SFX_PATHS.footstep),
      bulletPickup: new RotationPicker(SFX_PATHS.bulletPickup),
      bulletBodyHit: new RotationPicker(SFX_PATHS.bulletBodyHit),
      bulletWallHit: new RotationPicker(SFX_PATHS.bulletWallHit),
      flyby: new RotationPicker(SFX_PATHS.flyby),
      death: new RotationPicker(SFX_PATHS.death),
      reload: new RotationPicker(SFX_PATHS.reload),
      magEmpty: new RotationPicker(SFX_PATHS.magEmpty)
    };

    this.lobbyMusic.loop = false;
    this.lobbyMusic.preload = 'auto';
    this.pageSuppressed = this.computePageSuppressed();
    this.attachPageLifecycleListeners();
    this.applyMusicVolume(performance.now());
  }

  dispose(): void {
    this.clearLobbyMonitor();
    this.detachPageLifecycleListeners();
    this.lobbyMusic.pause();
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value);
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value);
    this.applyMusicVolume(performance.now());
  }

  setLobbyActive(active: boolean): void {
    if (this.lobbyActive === active) {
      return;
    }
    this.lobbyActive = active;
    if (this.lobbyActive) {
      if (this.pageSuppressed) {
        this.ensureLobbyMonitor();
        this.applyMusicVolume(performance.now());
        return;
      }
      this.startLobbyCycle();
      return;
    }
    this.clearLobbyMonitor();
    this.lobbyMusic.pause();
    this.lobbyMusic.currentTime = 0;
    this.lobbyFadeInEndsAt = 0;
    this.lobbyFadeOutEndsAt = 0;
    this.lobbyRestartAt = 0;
    this.backgroundPauseAt = 0;
    this.applyMusicVolume(performance.now());
  }

  unlock(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (!this.audioContext) {
      this.audioContext = new window.AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => undefined);
    }
    if (this.lobbyActive && !this.pageSuppressed) {
      this.startLobbyCycle();
    }
  }

  play(key: SfxKey, options?: PlayOptions): void {
    const now = performance.now();
    const minGap = this.minReplayGapMs[key] ?? 0;
    const previousPlayAt = this.lastPlayedAt[key] ?? Number.NEGATIVE_INFINITY;
    if (now - previousPlayAt < minGap) {
      return;
    }
    this.lastPlayedAt[key] = now;

    const path = this.pickers[key].next();
    if (!path) {
      if (key === 'death') {
        this.play('flyby', { volume: 0.58, playbackRateMin: 0.88, playbackRateMax: 0.98 });
        return;
      }
      if (key === 'magEmpty') {
        this.playSyntheticClick(980, 0.04, 0.08);
        return;
      }
      if (key === 'reload') {
        this.playSyntheticClick(440, 0.08, 0.06);
        this.playSyntheticClick(560, 0.05, 0.06);
      }
      return;
    }

    if (key === 'footstep') {
      this.playFootstepLocal(path, options);
      return;
    }

    const audio = new Audio(path);
    const playbackRateMin = options?.playbackRateMin ?? 0.96;
    const playbackRateMax = options?.playbackRateMax ?? 1.04;
    const randomizedRate =
      playbackRateMin + Math.random() * Math.max(0.0001, playbackRateMax - playbackRateMin);
    audio.playbackRate = randomizedRate;
    audio.volume = clamp01(this.sfxVolume * (options?.volume ?? 1));
    void audio.play().catch(() => {
      if (key === 'death') {
        this.play('flyby', { volume: 0.58, playbackRateMin: 0.88, playbackRateMax: 0.98 });
      }
    });
  }

  playFootstepSpatial(options: SpatialFootstepOptions): void {
    const now = performance.now();
    const path = this.pickers.footstep.next();
    if (!path) {
      return;
    }
    this.lastPlayedAt.footstep = now;
    const playbackRateMin = options.playbackRateMin ?? 0.93;
    const playbackRateMax = options.playbackRateMax ?? 1.09;
    const playbackRate =
      playbackRateMin + Math.random() * Math.max(0.0001, playbackRateMax - playbackRateMin);
    const gain = clamp01(this.sfxVolume * (options.volume ?? 1));
    void this.playDecodedSpatial(path, gain, playbackRate, options);
  }

  private applyMusicVolume(now: number): void {
    let envelope = 1;
    if (this.lobbyFadeOutEndsAt > now) {
      envelope = Math.max(0, (this.lobbyFadeOutEndsAt - now) / AudioManager.LOBBY_FADE_OUT_MS);
    } else if (this.lobbyRestartAt > 0 && now < this.lobbyRestartAt) {
      envelope = 0;
    }

    if (this.lobbyFadeInEndsAt > now) {
      const fadeInProgress = 1 - (this.lobbyFadeInEndsAt - now) / AudioManager.LOBBY_FADE_IN_MS;
      envelope = Math.min(envelope, clamp01(fadeInProgress));
    }
    this.lobbyMusic.volume = clamp01(this.musicVolume * envelope);
  }

  private getLobbyStartTime(): number {
    const duration = this.lobbyMusic.duration;
    if (!Number.isFinite(duration) || duration <= AudioManager.LOBBY_START_OFFSET_SECONDS + 2) {
      return 0;
    }
    return AudioManager.LOBBY_START_OFFSET_SECONDS;
  }

  private restartLobbyFromCue(now: number): void {
    this.lobbyFadeOutEndsAt = 0;
    this.lobbyRestartAt = 0;
    this.lobbyFadeInEndsAt = now + AudioManager.LOBBY_FADE_IN_MS;
    const startTime = this.getLobbyStartTime();
    if (this.lobbyMusic.currentTime !== startTime) {
      this.lobbyMusic.currentTime = startTime;
    }
    this.applyMusicVolume(now);
    void this.lobbyMusic.play().catch(() => undefined);
  }

  private startLobbyCycle(): void {
    if (!this.lobbyActive || this.pageSuppressed) {
      return;
    }
    const now = performance.now();
    this.ensureLobbyMonitor();
    if (this.lobbyMusic.paused) {
      this.restartLobbyFromCue(now);
      return;
    }
    this.applyMusicVolume(now);
  }

  private ensureLobbyMonitor(): void {
    if (this.lobbyMonitorId !== null) {
      return;
    }
    this.lobbyMusic.loop = false;
    this.lobbyMonitorId = window.setInterval(() => {
      if (!this.lobbyActive) {
        return;
      }
      const now = performance.now();
      if (this.pageSuppressed) {
        if (!this.lobbyMusic.paused && this.backgroundPauseAt === 0) {
          this.lobbyFadeOutEndsAt = now + AudioManager.LOBBY_FADE_OUT_MS;
          this.lobbyFadeInEndsAt = 0;
          this.lobbyRestartAt = 0;
          this.backgroundPauseAt = this.lobbyFadeOutEndsAt;
        }
        if (this.backgroundPauseAt > 0 && now >= this.backgroundPauseAt) {
          this.lobbyMusic.pause();
          this.backgroundPauseAt = 0;
        }
        this.applyMusicVolume(now);
        return;
      }

      this.backgroundPauseAt = 0;
      const duration = this.lobbyMusic.duration;
      if (
        Number.isFinite(duration) &&
        duration > AudioManager.LOBBY_FADE_OUT_TRIGGER_SECONDS + 2
      ) {
        const remaining = duration - this.lobbyMusic.currentTime;
        if (this.lobbyFadeOutEndsAt === 0 && this.lobbyRestartAt === 0 && remaining <= AudioManager.LOBBY_FADE_OUT_TRIGGER_SECONDS) {
          this.lobbyFadeOutEndsAt = now + AudioManager.LOBBY_FADE_OUT_MS;
          this.lobbyFadeInEndsAt = 0;
          this.lobbyRestartAt = now + AudioManager.LOBBY_FADE_OUT_MS;
        }
      }

      if (this.lobbyRestartAt > 0 && now >= this.lobbyRestartAt) {
        this.restartLobbyFromCue(now);
        return;
      }
      if (this.lobbyMusic.ended) {
        this.restartLobbyFromCue(now);
        return;
      }
      if (this.lobbyMusic.paused) {
        void this.lobbyMusic.play().catch(() => undefined);
      }
      this.applyMusicVolume(now);
    }, 120);
  }

  private clearLobbyMonitor(): void {
    if (this.lobbyMonitorId === null) {
      return;
    }
    window.clearInterval(this.lobbyMonitorId);
    this.lobbyMonitorId = null;
  }

  private readonly handlePageLifecycleChange = (): void => {
    const nextSuppressed = this.computePageSuppressed();
    if (nextSuppressed === this.pageSuppressed) {
      return;
    }
    this.pageSuppressed = nextSuppressed;

    if (this.pageSuppressed) {
      if (!this.lobbyActive || this.lobbyMusic.paused) {
        return;
      }
      const now = performance.now();
      this.lobbyFadeOutEndsAt = now + AudioManager.LOBBY_FADE_OUT_MS;
      this.lobbyFadeInEndsAt = 0;
      this.lobbyRestartAt = 0;
      this.backgroundPauseAt = this.lobbyFadeOutEndsAt;
      this.ensureLobbyMonitor();
      this.applyMusicVolume(now);
      return;
    }

    if (!this.lobbyActive) {
      return;
    }
    this.backgroundPauseAt = 0;
    this.restartLobbyFromCue(performance.now());
    this.ensureLobbyMonitor();
  };

  private attachPageLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    window.addEventListener('focus', this.handlePageLifecycleChange);
    window.addEventListener('blur', this.handlePageLifecycleChange);
    document.addEventListener('visibilitychange', this.handlePageLifecycleChange);
  }

  private detachPageLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    window.removeEventListener('focus', this.handlePageLifecycleChange);
    window.removeEventListener('blur', this.handlePageLifecycleChange);
    document.removeEventListener('visibilitychange', this.handlePageLifecycleChange);
  }

  private computePageSuppressed(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    return document.visibilityState !== 'visible' || !document.hasFocus();
  }

  private playFootstepLocal(path: string, options?: PlayOptions): void {
    const playbackRateMin = options?.playbackRateMin ?? 0.93;
    const playbackRateMax = options?.playbackRateMax ?? 1.09;
    const playbackRate =
      playbackRateMin + Math.random() * Math.max(0.0001, playbackRateMax - playbackRateMin);
    const gain = clamp01(this.sfxVolume * (options?.volume ?? 1));
    void this.playDecodedCentered(path, gain, playbackRate);
  }

  private async playDecodedCentered(
    path: string,
    gain: number,
    playbackRate: number
  ): Promise<void> {
    const context = this.audioContext;
    if (!context || context.state === 'suspended') {
      this.playFallback(path, gain, playbackRate);
      return;
    }
    const buffer = await this.getDecodedBuffer(path);
    if (!buffer) {
      this.playFallback(path, gain, playbackRate);
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const gainNode = context.createGain();
    gainNode.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = 0;
    source.connect(gainNode).connect(panner).connect(context.destination);
    source.start();
  }

  private async playDecodedSpatial(
    path: string,
    gain: number,
    playbackRate: number,
    options: SpatialFootstepOptions
  ): Promise<void> {
    const context = this.audioContext;
    if (!context || context.state === 'suspended') {
      this.playFallback(path, gain, playbackRate);
      return;
    }
    const buffer = await this.getDecodedBuffer(path);
    if (!buffer) {
      this.playFallback(path, gain, playbackRate);
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = context.createGain();
    gainNode.gain.value = gain;

    context.listener.positionX.value = options.listenerPosition.x;
    context.listener.positionY.value = options.listenerPosition.y;
    context.listener.positionZ.value = options.listenerPosition.z;
    const forwardX = Math.sin(options.listenerYaw);
    const forwardZ = Math.cos(options.listenerYaw);
    context.listener.forwardX.value = forwardX;
    context.listener.forwardY.value = 0;
    context.listener.forwardZ.value = forwardZ;
    context.listener.upX.value = 0;
    context.listener.upY.value = 1;
    context.listener.upZ.value = 0;

    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.maxDistance = 28;
    panner.rolloffFactor = 1.3;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.positionX.value = options.sourcePosition.x;
    panner.positionY.value = options.sourcePosition.y;
    panner.positionZ.value = options.sourcePosition.z;

    source.connect(gainNode).connect(panner).connect(context.destination);
    source.start();
  }

  private playFallback(path: string, gain: number, playbackRate: number): void {
    const audio = new Audio(path);
    audio.volume = gain;
    audio.playbackRate = playbackRate;
    void audio.play().catch(() => undefined);
  }

  private async getDecodedBuffer(path: string): Promise<AudioBuffer | null> {
    const cached = this.decodedBufferByPath.get(path);
    if (cached) {
      return cached;
    }
    const pending = this.pendingDecodeByPath.get(path);
    if (pending) {
      return pending;
    }

    const loadPromise = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        if (!this.audioContext) {
          return null;
        }
        const decoded = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
        const mono = this.mixToMono(decoded);
        this.decodedBufferByPath.set(path, mono);
        return mono;
      } catch {
        return null;
      } finally {
        this.pendingDecodeByPath.delete(path);
      }
    })();

    this.pendingDecodeByPath.set(path, loadPromise);
    return loadPromise;
  }

  private mixToMono(buffer: AudioBuffer): AudioBuffer {
    if (!this.audioContext || buffer.numberOfChannels <= 1) {
      return buffer;
    }
    const mono = this.audioContext.createBuffer(1, buffer.length, buffer.sampleRate);
    const output = mono.getChannelData(0);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const input = buffer.getChannelData(channel);
      for (let index = 0; index < input.length; index += 1) {
        const mixed = (output[index] ?? 0) + (input[index] ?? 0) / buffer.numberOfChannels;
        output[index] = mixed;
      }
    }
    return mono;
  }

  private playSyntheticClick(frequency: number, durationSeconds: number, gain: number): void {
    if (!this.audioContext) {
      return;
    }
    if (this.audioContext.state === 'suspended') {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    gainNode.gain.value = gain * this.sfxVolume;
    gainNode.gain.setValueAtTime(gain * this.sfxVolume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      this.audioContext.currentTime + durationSeconds
    );
    oscillator.connect(gainNode).connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + durationSeconds);
  }
}
