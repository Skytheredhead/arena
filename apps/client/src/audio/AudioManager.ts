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
  private readonly pickers: Record<SfxKey, RotationPicker>;
  private readonly lobbyMusic = new Audio('/music/lobby_theme.wav');
  private sfxVolume = 0.85;
  private musicVolume = 0.35;
  private lobbyActive = false;
  private audioContext: AudioContext | null = null;

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

    this.lobbyMusic.loop = true;
    this.lobbyMusic.preload = 'auto';
    this.applyMusicVolume();
  }

  dispose(): void {
    this.lobbyMusic.pause();
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value);
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value);
    this.applyMusicVolume();
  }

  setLobbyActive(active: boolean): void {
    if (this.lobbyActive === active) {
      return;
    }
    this.lobbyActive = active;
    if (this.lobbyActive) {
      void this.lobbyMusic.play().catch(() => undefined);
      return;
    }
    this.lobbyMusic.pause();
    this.lobbyMusic.currentTime = 0;
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
      void this.lobbyMusic.play().catch(() => undefined);
    }
  }

  play(key: SfxKey, options?: PlayOptions): void {
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

  private applyMusicVolume(): void {
    this.lobbyMusic.volume = clamp01(this.musicVolume);
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
