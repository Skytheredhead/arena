type SfxKey =
  | 'shot'
  | 'footstep'
  | 'bulletPickup'
  | 'bulletBodyHit'
  | 'bulletWallHit'
  | 'flyby'
  | 'reload'
  | 'magEmpty';

interface PlayOptions {
  volume?: number;
  playbackRateMin?: number;
  playbackRateMax?: number;
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
  private readonly minReplayGapMs: Partial<Record<SfxKey, number>> = {
    footstep: 380
  };
  private readonly lastPlayedAt: Partial<Record<SfxKey, number>> = {};
  private readonly lobbyMusic = new Audio('/music/lobby_theme.mp3');
  private sfxVolume = 0.85;
  private musicVolume = 0.35;
  private lobbyActive = false;
  private audioContext: AudioContext | null = null;
  private lobbyMonitorId: number | null = null;
  private lobbyFadeInEndsAt = 0;
  private lobbyFadeOutEndsAt = 0;
  private lobbyRestartAt = 0;

  constructor() {
    this.pickers = {
      shot: new RotationPicker(SFX_PATHS.shot),
      footstep: new RotationPicker(SFX_PATHS.footstep),
      bulletPickup: new RotationPicker(SFX_PATHS.bulletPickup),
      bulletBodyHit: new RotationPicker(SFX_PATHS.bulletBodyHit),
      bulletWallHit: new RotationPicker(SFX_PATHS.bulletWallHit),
      flyby: new RotationPicker(SFX_PATHS.flyby),
      reload: new RotationPicker(SFX_PATHS.reload),
      magEmpty: new RotationPicker(SFX_PATHS.magEmpty)
    };

    this.lobbyMusic.loop = false;
    this.lobbyMusic.preload = 'auto';
    this.applyMusicVolume(performance.now());
  }

  dispose(): void {
    this.clearLobbyMonitor();
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
      this.startLobbyCycle();
      return;
    }
    this.clearLobbyMonitor();
    this.lobbyMusic.pause();
    this.lobbyMusic.currentTime = 0;
    this.lobbyFadeInEndsAt = 0;
    this.lobbyFadeOutEndsAt = 0;
    this.lobbyRestartAt = 0;
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
    if (this.lobbyActive) {
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

    const audio = new Audio(path);
    const playbackRateMin = options?.playbackRateMin ?? 0.96;
    const playbackRateMax = options?.playbackRateMax ?? 1.04;
    const randomizedRate =
      playbackRateMin + Math.random() * Math.max(0.0001, playbackRateMax - playbackRateMin);
    audio.playbackRate = randomizedRate;
    audio.volume = clamp01(this.sfxVolume * (options?.volume ?? 1));
    void audio.play().catch(() => undefined);
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
    if (!this.lobbyActive) {
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
