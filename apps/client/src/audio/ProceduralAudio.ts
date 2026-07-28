import type { Vector3Like, WeaponSlot } from '../netcode/contracts';

export interface ProceduralAudioOptions {
  sfxVolume?: number;
  ambienceVolume?: number;
  seed?: number;
}

type ImpactKind = 'metal' | 'concrete' | 'body';

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const makeSeededRandom = (initialSeed: number): (() => number) => {
  let seed = initialSeed >>> 0 || 0x51f15e;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
};

/**
 * All Arena audio is synthesized at runtime. No samples, impulse responses, or
 * third-party media are fetched.
 */
export class ProceduralAudio {
  readonly #random: () => number;
  #context: AudioContext | null = null;
  #sfx: GainNode | null = null;
  #ambience: GainNode | null = null;
  #rainSource: AudioBufferSourceNode | null = null;
  #rainFilter: BiquadFilterNode | null = null;
  #sfxVolume: number;
  #ambienceVolume: number;
  #disposed = false;

  constructor(options: ProceduralAudioOptions = {}) {
    this.#sfxVolume = clamp01(options.sfxVolume ?? 0.8);
    this.#ambienceVolume = clamp01(options.ambienceVolume ?? 0.5);
    this.#random = makeSeededRandom(options.seed ?? 0xa8e4_2026);
  }

  async unlock(): Promise<boolean> {
    if (this.#disposed) return false;
    if (!this.#context) this.#createGraph();
    if (!this.#context) return false;
    try {
      if (this.#context.state !== 'running') await this.#context.resume();
      return this.#context.state === 'running';
    } catch {
      return false;
    }
  }

  setVolumes(sfx: number, ambience: number): void {
    this.#sfxVolume = clamp01(sfx);
    this.#ambienceVolume = clamp01(ambience);
    const now = this.#context?.currentTime ?? 0;
    this.#sfx?.gain.setTargetAtTime(this.#sfxVolume, now, 0.025);
    this.#ambience?.gain.setTargetAtTime(
      this.#ambienceVolume * 0.56,
      now,
      0.05
    );
  }

  startRain(): void {
    const context = this.#context;
    const ambience = this.#ambience;
    if (!context || !ambience || this.#rainSource) return;

    const source = context.createBufferSource();
    source.buffer = this.#makeNoiseBuffer(3.4, 0.72);
    source.loop = true;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 900;
    highpass.Q.value = 0.35;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 7_600;
    const gain = context.createGain();
    gain.gain.value = 0.19;

    source.connect(highpass).connect(lowpass).connect(gain).connect(ambience);
    source.start();
    this.#rainSource = source;
    this.#rainFilter = lowpass;
  }

  stopRain(): void {
    try {
      this.#rainSource?.stop();
    } catch {
      // The source may already have ended during context teardown.
    }
    this.#rainSource?.disconnect();
    this.#rainSource = null;
    this.#rainFilter = null;
  }

  updateRain(intensity: number, indoorMix: number): void {
    const context = this.#context;
    if (!context || !this.#rainFilter || !this.#ambience) return;
    const rain = clamp01(intensity);
    const indoor = clamp01(indoorMix);
    this.#rainFilter.frequency.setTargetAtTime(
      7_600 - indoor * 5_200,
      context.currentTime,
      0.08
    );
    this.#ambience.gain.setTargetAtTime(
      this.#ambienceVolume * (0.18 + rain * 0.42) * (1 - indoor * 0.45),
      context.currentTime,
      0.1
    );
  }

  playWeapon(slot: WeaponSlot): void {
    if (!this.#context || !this.#sfx) return;
    if (slot === 2) {
      this.#playSniper();
    } else if (slot === 3) {
      this.#playShotgun();
    } else {
      this.#playRifle();
    }
  }

  playReload(slot: WeaponSlot): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    const first = slot === 3 ? 0.08 : 0;
    const spacing = slot === 3 ? 0.23 : 0.18;
    const clicks = slot === 3 ? 3 : 2;
    for (let index = 0; index < clicks; index += 1) {
      const at = now + first + spacing * index;
      this.#tone({
        at,
        duration: 0.045,
        frequency: 1_100 - index * 240,
        endFrequency: 420,
        gain: 0.075,
        type: 'square',
        output,
      });
      this.#noiseBurst(at, 0.035, 0.035, 1_600, output);
    }
  }

  playImpact(
    kind: ImpactKind,
    position?: Vector3Like,
    listenerPosition?: Vector3Like
  ): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    const pan =
      position && listenerPosition
        ? Math.max(-1, Math.min(1, (position.x - listenerPosition.x) / 18))
        : 0;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(output);

    if (kind === 'metal') {
      this.#tone({
        at: now,
        duration: 0.18,
        frequency: 1_900 + this.#random() * 650,
        endFrequency: 1_000,
        gain: 0.065,
        type: 'triangle',
        output: panner,
      });
      this.#noiseBurst(now, 0.04, 0.04, 4_800, panner);
    } else if (kind === 'body') {
      this.#tone({
        at: now,
        duration: 0.11,
        frequency: 170,
        endFrequency: 74,
        gain: 0.09,
        type: 'sine',
        output: panner,
      });
      this.#noiseBurst(now, 0.06, 0.04, 680, panner);
    } else {
      this.#noiseBurst(now, 0.085, 0.075, 1_800, panner);
      this.#tone({
        at: now,
        duration: 0.07,
        frequency: 260,
        endFrequency: 110,
        gain: 0.045,
        type: 'triangle',
        output: panner,
      });
    }
    window.setTimeout(() => panner.disconnect(), 300);
  }

  playHitmarker(headshot = false): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    this.#tone({
      at: now,
      duration: 0.05,
      frequency: headshot ? 1_700 : 1_180,
      endFrequency: headshot ? 2_250 : 920,
      gain: 0.055,
      type: 'square',
      output,
    });
  }

  playHurt(): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    this.#tone({
      at: context.currentTime,
      duration: 0.16,
      frequency: 92,
      endFrequency: 48,
      gain: 0.11,
      type: 'sawtooth',
      output,
    });
    this.#noiseBurst(context.currentTime, 0.1, 0.05, 430, output);
  }

  playDeath(): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    this.#tone({
      at: now,
      duration: 0.8,
      frequency: 120,
      endFrequency: 28,
      gain: 0.13,
      type: 'sawtooth',
      output,
    });
    this.#noiseBurst(now, 0.5, 0.1, 850, output);
  }

  playFootstep(wet = true): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    this.#noiseBurst(now, wet ? 0.095 : 0.065, 0.045, wet ? 1_100 : 720, output);
    this.#tone({
      at: now,
      duration: 0.075,
      frequency: wet ? 105 : 82,
      endFrequency: 46,
      gain: 0.045,
      type: 'sine',
      output,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.stopRain();
    const context = this.#context;
    this.#context = null;
    this.#sfx = null;
    this.#ambience = null;
    if (context) void context.close();
  }

  #createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor({ latencyHint: 'interactive' });
    const master = context.createGain();
    const sfx = context.createGain();
    const ambience = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;
    master.gain.value = 0.9;
    sfx.gain.value = this.#sfxVolume;
    ambience.gain.value = this.#ambienceVolume * 0.56;
    sfx.connect(compressor);
    ambience.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);
    this.#context = context;
    this.#sfx = sfx;
    this.#ambience = ambience;
    this.startRain();
  }

  #playRifle(): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    this.#noiseBurst(now, 0.075, 0.11, 5_800, output);
    this.#tone({
      at: now,
      duration: 0.09,
      frequency: 260,
      endFrequency: 92,
      gain: 0.12,
      type: 'sawtooth',
      output,
    });
    this.#tone({
      at: now + 0.006,
      duration: 0.055,
      frequency: 1_550,
      endFrequency: 430,
      gain: 0.045,
      type: 'square',
      output,
    });
  }

  #playShotgun(): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    this.#noiseBurst(now, 0.19, 0.2, 3_200, output);
    this.#tone({
      at: now,
      duration: 0.24,
      frequency: 118,
      endFrequency: 36,
      gain: 0.19,
      type: 'sawtooth',
      output,
    });
    this.#tone({
      at: now + 0.012,
      duration: 0.13,
      frequency: 54,
      endFrequency: 31,
      gain: 0.16,
      type: 'sine',
      output,
    });
  }

  #playSniper(): void {
    const context = this.#context;
    const output = this.#sfx;
    if (!context || !output) return;
    const now = context.currentTime;
    this.#noiseBurst(now, 0.055, 0.18, 10_000, output);
    this.#tone({
      at: now,
      duration: 0.16,
      frequency: 420,
      endFrequency: 58,
      gain: 0.16,
      type: 'square',
      output,
    });
    this.#tone({
      at: now + 0.025,
      duration: 0.42,
      frequency: 88,
      endFrequency: 34,
      gain: 0.1,
      type: 'sine',
      output,
    });
  }

  #tone(options: {
    at: number;
    duration: number;
    frequency: number;
    endFrequency: number;
    gain: number;
    type: OscillatorType;
    output: AudioNode;
  }): void {
    const context = this.#context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, options.at);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.endFrequency),
      options.at + options.duration
    );
    gain.gain.setValueAtTime(Math.max(0.0001, options.gain), options.at);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      options.at + options.duration
    );
    oscillator.connect(gain).connect(options.output);
    oscillator.start(options.at);
    oscillator.stop(options.at + options.duration + 0.01);
  }

  #noiseBurst(
    at: number,
    duration: number,
    gainValue: number,
    lowpassFrequency: number,
    output: AudioNode
  ): void {
    const context = this.#context;
    if (!context) return;
    const source = context.createBufferSource();
    source.buffer = this.#makeNoiseBuffer(Math.max(0.02, duration), 1);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpassFrequency, at);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(120, lowpassFrequency * 0.35),
      at + duration
    );
    const gain = context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(at);
    source.stop(at + duration + 0.01);
  }

  #makeNoiseBuffer(durationSeconds: number, amplitude: number): AudioBuffer {
    const context = this.#context;
    if (!context) throw new Error('Audio context is not initialized');
    const length = Math.max(1, Math.ceil(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = this.#random() * 2 - 1;
      previous = previous * 0.18 + white * 0.82;
      channel[index] = previous * amplitude;
    }
    return buffer;
  }
}
