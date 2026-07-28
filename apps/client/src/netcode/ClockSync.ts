import { unwrapUint32Near } from './serial';

export interface ClockSample {
  sentAtMs: number;
  receivedAtMs: number;
  serverUnixMicros: bigint;
  serverTick: number;
}

export interface ClockEstimate {
  pingMs: number | null;
  lowMs: number | null;
  jitterMs: number | null;
  unixOffsetMs: number | null;
  serverTick: number | null;
}

const EWMA_ALPHA = 0.18;

/**
 * Lightweight NTP-style estimator. The midpoint of a request is used as the
 * local time corresponding to the server timestamp; low-RTT samples naturally
 * constrain offset error.
 */
export class ClockSync {
  readonly #tickRate: number;
  #pingMs: number | null = null;
  #lowMs: number | null = null;
  #jitterMs: number | null = null;
  #offsetMs: number | null = null;
  #lastServerTick: number | null = null;
  #lastUnwrappedTick: number | null = null;
  #lastSampleLocalMs: number | null = null;

  constructor(tickRate = 60) {
    this.#tickRate = Math.max(1, tickRate);
  }

  addSample(sample: ClockSample): void {
    const rtt = Math.max(0, sample.receivedAtMs - sample.sentAtMs);
    const midpoint = sample.sentAtMs + rtt / 2;
    const serverMs = Number(sample.serverUnixMicros / 1000n);
    const offset = serverMs - midpoint;

    this.#lowMs = this.#lowMs == null ? rtt : Math.min(this.#lowMs, rtt);
    if (this.#pingMs == null) {
      this.#pingMs = rtt;
      this.#jitterMs = 0;
      this.#offsetMs = offset;
    } else {
      const deviation = Math.abs(rtt - this.#pingMs);
      this.#pingMs += (rtt - this.#pingMs) * EWMA_ALPHA;
      this.#jitterMs =
        (this.#jitterMs ?? 0) +
        (deviation - (this.#jitterMs ?? 0)) * EWMA_ALPHA;

      const lowBias =
        this.#lowMs != null && rtt <= this.#lowMs + 4 ? 0.42 : EWMA_ALPHA;
      this.#offsetMs =
        (this.#offsetMs ?? offset) +
        (offset - (this.#offsetMs ?? offset)) * lowBias;
    }

    const wrapped = sample.serverTick >>> 0;
    if (this.#lastServerTick == null || this.#lastUnwrappedTick == null) {
      this.#lastServerTick = wrapped;
      this.#lastUnwrappedTick = wrapped;
    } else {
      this.#lastUnwrappedTick = unwrapUint32Near(
        wrapped,
        this.#lastServerTick,
        this.#lastUnwrappedTick
      );
      this.#lastServerTick = wrapped;
    }
    this.#lastSampleLocalMs = sample.receivedAtMs;
  }

  estimateServerTick(nowMs: number): number | null {
    if (this.#lastUnwrappedTick == null || this.#lastSampleLocalMs == null) {
      return null;
    }
    return (
      this.#lastUnwrappedTick +
      ((nowMs - this.#lastSampleLocalMs) * this.#tickRate) / 1000
    );
  }

  estimateServerUnixMs(nowMs: number): number | null {
    return this.#offsetMs == null ? null : nowMs + this.#offsetMs;
  }

  getEstimate(nowMs: number): ClockEstimate {
    return {
      pingMs: this.#pingMs,
      lowMs: this.#lowMs,
      jitterMs: this.#jitterMs,
      unixOffsetMs: this.#offsetMs,
      serverTick: this.estimateServerTick(nowMs),
    };
  }

  reset(): void {
    this.#pingMs = null;
    this.#lowMs = null;
    this.#jitterMs = null;
    this.#offsetMs = null;
    this.#lastServerTick = null;
    this.#lastUnwrappedTick = null;
    this.#lastSampleLocalMs = null;
  }
}
