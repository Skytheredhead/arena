import type {
  ActionEdges,
  InputIntent,
  SubmitInputPacket,
  WeaponSlot,
} from './contracts';
import { INPUT_BUTTON_MASK } from './contracts';
import {
  isAcknowledgedUint32,
  isNewerUint32,
  nextUint32,
  toUint32,
  uint32Distance,
} from './serial';

const DEFAULT_MAX_HISTORY = 256;
const DEFAULT_RETRY_MS = 34;
const DEFAULT_MAX_RETRY_MS = 750;
const DEFAULT_MAX_PENDING_ACTIONS = 32;
const SERVER_ACTION_WINDOW = 8;
const MAX_PITCH = Math.PI * 0.488;

export interface InputAcknowledgement {
  inputSeq: number;
  fireCounter: number;
  reloadCounter: number;
  respawnCounter: number;
}

export interface ReliableInputQueueOptions {
  maxHistory?: number;
  retryMs?: number;
  maxRetryMs?: number;
  initialInputSeq?: number;
  initialFireCounter?: number;
  initialReloadCounter?: number;
  initialRespawnCounter?: number;
  maxPendingActions?: number;
}

export interface ReliableQueueStats {
  pendingInputs: number;
  oldestInputSeq: number | null;
  newestInputSeq: number | null;
  fireCounter: number;
  reloadCounter: number;
  respawnCounter: number;
  pendingFireEdges: number;
  pendingReloadEdges: number;
  pendingRespawnEdges: number;
  droppedActionEdges: number;
  nextAttemptAtMs: number;
  consecutiveFailures: number;
}

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeAngle = (angle: number): number => {
  const finite = finiteOr(angle, 0);
  return Math.atan2(Math.sin(finite), Math.cos(finite));
};

const sanitizeWeapon = (slot: WeaponSlot): WeaponSlot =>
  slot === 2 || slot === 3 ? slot : 1;

/**
 * Keeps enough local input history for prediction/reconciliation while sending
 * a cumulative action state. A successful reducer invocation is not treated as
 * an acknowledgement; rows are retained until the authoritative player row
 * advances its acknowledgement counters.
 */
export class ReliableInputQueue {
  readonly #maxHistory: number;
  readonly #retryMs: number;
  readonly #maxRetryMs: number;
  readonly #maxPendingActions: number;
  readonly #history: SubmitInputPacket[] = [];

  #lastInputSeq: number;
  #fireCounter: number;
  #reloadCounter: number;
  #respawnCounter: number;
  #lastAck: InputAcknowledgement;
  #pendingFireEdges = 0;
  #pendingReloadEdges = 0;
  #pendingRespawnEdges = 0;
  #droppedActionEdges = 0;
  #nextAttemptAtMs = 0;
  #currentRetryMs: number;
  #consecutiveFailures = 0;
  #sending = false;

  constructor(options: ReliableInputQueueOptions = {}) {
    this.#maxHistory = Math.max(8, options.maxHistory ?? DEFAULT_MAX_HISTORY);
    this.#retryMs = Math.max(8, options.retryMs ?? DEFAULT_RETRY_MS);
    this.#maxRetryMs = Math.max(
      this.#retryMs,
      options.maxRetryMs ?? DEFAULT_MAX_RETRY_MS
    );
    this.#currentRetryMs = this.#retryMs;
    this.#maxPendingActions = Math.max(
      SERVER_ACTION_WINDOW,
      options.maxPendingActions ?? DEFAULT_MAX_PENDING_ACTIONS
    );
    this.#lastInputSeq = toUint32(options.initialInputSeq ?? 0);
    this.#fireCounter = toUint32(options.initialFireCounter ?? 0);
    this.#reloadCounter = toUint32(options.initialReloadCounter ?? 0);
    this.#respawnCounter = toUint32(options.initialRespawnCounter ?? 0);
    this.#lastAck = {
      inputSeq: this.#lastInputSeq,
      fireCounter: this.#fireCounter,
      reloadCounter: this.#reloadCounter,
      respawnCounter: this.#respawnCounter,
    };
  }

  record(intent: InputIntent, edges: ActionEdges): SubmitInputPacket {
    this.#pendingFireEdges = this.#queueEdges(
      this.#pendingFireEdges,
      edges.fire
    );
    this.#pendingReloadEdges = this.#queueEdges(
      this.#pendingReloadEdges,
      edges.reload
    );
    this.#pendingRespawnEdges = this.#queueEdges(
      this.#pendingRespawnEdges,
      edges.respawn
    );
    [this.#fireCounter, this.#pendingFireEdges] =
      this.#advanceCounterWithinWindow(
        this.#fireCounter,
        this.#lastAck.fireCounter,
        this.#pendingFireEdges
      );
    [this.#reloadCounter, this.#pendingReloadEdges] =
      this.#advanceCounterWithinWindow(
        this.#reloadCounter,
        this.#lastAck.reloadCounter,
        this.#pendingReloadEdges
      );
    [this.#respawnCounter, this.#pendingRespawnEdges] =
      this.#advanceCounterWithinWindow(
        this.#respawnCounter,
        this.#lastAck.respawnCounter,
        this.#pendingRespawnEdges
      );

    this.#lastInputSeq = nextUint32(this.#lastInputSeq);
    const packet: SubmitInputPacket = {
      seq: this.#lastInputSeq,
      clientTick:
        typeof intent.clientTick === 'bigint' && intent.clientTick >= 0n
          ? intent.clientTick
          : 0n,
      moveX: clamp(finiteOr(intent.moveX, 0), -1, 1),
      moveZ: clamp(finiteOr(intent.moveZ, 0), -1, 1),
      yaw: normalizeAngle(intent.yaw),
      pitch: clamp(finiteOr(intent.pitch, 0), -MAX_PITCH, MAX_PITCH),
      buttons: toUint32(intent.buttons) & INPUT_BUTTON_MASK,
      desiredWeapon: sanitizeWeapon(intent.desiredWeapon),
      fireCounter: this.#fireCounter,
      reloadCounter: this.#reloadCounter,
      respawnCounter: this.#respawnCounter,
    };

    this.#history.push(packet);
    this.#compactHistory();
    return packet;
  }

  acknowledge(acknowledgement: InputAcknowledgement): void {
    const normalized: InputAcknowledgement = {
      inputSeq: toUint32(acknowledgement.inputSeq),
      fireCounter: toUint32(acknowledgement.fireCounter),
      reloadCounter: toUint32(acknowledgement.reloadCounter),
      respawnCounter: toUint32(acknowledgement.respawnCounter),
    };

    if (
      !isNewerUint32(normalized.inputSeq, this.#lastAck.inputSeq) &&
      normalized.inputSeq !== this.#lastAck.inputSeq
    ) {
      return;
    }

    this.#lastAck = normalized;
    if (isNewerUint32(normalized.fireCounter, this.#fireCounter)) {
      this.#fireCounter = normalized.fireCounter;
    }
    if (isNewerUint32(normalized.reloadCounter, this.#reloadCounter)) {
      this.#reloadCounter = normalized.reloadCounter;
    }
    if (isNewerUint32(normalized.respawnCounter, this.#respawnCounter)) {
      this.#respawnCounter = normalized.respawnCounter;
    }
    while (
      this.#history[0] &&
      isAcknowledgedUint32(this.#history[0].seq, normalized.inputSeq)
    ) {
      this.#history.shift();
    }
    this.#currentRetryMs = this.#retryMs;
    this.#consecutiveFailures = 0;
  }

  getLatestPacket(): SubmitInputPacket | null {
    return this.#history.at(-1) ?? null;
  }

  getUnacknowledgedInputs(): readonly SubmitInputPacket[] {
    return this.#history;
  }

  isDue(nowMs: number): boolean {
    return (
      !this.#sending &&
      this.#history.length > 0 &&
      nowMs >= this.#nextAttemptAtMs
    );
  }

  async flush(
    send: (packet: SubmitInputPacket) => Promise<void>,
    nowMs: number
  ): Promise<boolean> {
    if (!this.isDue(nowMs)) return false;
    const packet = this.getLatestPacket();
    if (!packet) return false;

    this.#sending = true;
    try {
      await send(packet);
      // Keep cumulative actions until the server row acknowledges them.
      this.#nextAttemptAtMs = nowMs + this.#retryMs;
      this.#currentRetryMs = this.#retryMs;
      this.#consecutiveFailures = 0;
      return true;
    } catch (error) {
      this.#consecutiveFailures += 1;
      this.#nextAttemptAtMs = nowMs + this.#currentRetryMs;
      this.#currentRetryMs = Math.min(
        this.#maxRetryMs,
        this.#currentRetryMs * 2
      );
      throw error;
    } finally {
      this.#sending = false;
    }
  }

  markDisconnected(nowMs: number): void {
    this.#sending = false;
    this.#nextAttemptAtMs = nowMs;
    this.#currentRetryMs = this.#retryMs;
  }

  resetForRespawn(acknowledgement?: InputAcknowledgement): void {
    this.#history.length = 0;
    if (acknowledgement) {
      this.#lastInputSeq = toUint32(acknowledgement.inputSeq);
      this.#fireCounter = toUint32(acknowledgement.fireCounter);
      this.#reloadCounter = toUint32(acknowledgement.reloadCounter);
      this.#respawnCounter = toUint32(acknowledgement.respawnCounter);
      this.#lastAck = {
        inputSeq: this.#lastInputSeq,
        fireCounter: this.#fireCounter,
        reloadCounter: this.#reloadCounter,
        respawnCounter: this.#respawnCounter,
      };
    }
    this.#pendingFireEdges = 0;
    this.#pendingReloadEdges = 0;
    this.#pendingRespawnEdges = 0;
    this.#droppedActionEdges = 0;
    this.#nextAttemptAtMs = 0;
    this.#currentRetryMs = this.#retryMs;
    this.#consecutiveFailures = 0;
  }

  getStats(): ReliableQueueStats {
    return {
      pendingInputs: this.#history.length,
      oldestInputSeq: this.#history[0]?.seq ?? null,
      newestInputSeq: this.#history.at(-1)?.seq ?? null,
      fireCounter: this.#fireCounter,
      reloadCounter: this.#reloadCounter,
      respawnCounter: this.#respawnCounter,
      pendingFireEdges: this.#pendingFireEdges,
      pendingReloadEdges: this.#pendingReloadEdges,
      pendingRespawnEdges: this.#pendingRespawnEdges,
      droppedActionEdges: this.#droppedActionEdges,
      nextAttemptAtMs: this.#nextAttemptAtMs,
      consecutiveFailures: this.#consecutiveFailures,
    };
  }

  #queueEdges(current: number, requested: number): number {
    const safeRequested = Number.isFinite(requested)
      ? Math.max(0, Math.floor(requested))
      : 0;
    const accepted = Math.min(
      safeRequested,
      Math.max(0, this.#maxPendingActions - current)
    );
    this.#droppedActionEdges += safeRequested - accepted;
    return current + accepted;
  }

  #advanceCounterWithinWindow(
    counter: number,
    acknowledged: number,
    pending: number
  ): [counter: number, pending: number] {
    const inFlight = uint32Distance(counter, acknowledged);
    const capacity =
      inFlight < 0x8000_0000
        ? Math.max(0, SERVER_ACTION_WINDOW - inFlight)
        : SERVER_ACTION_WINDOW;
    const advance = Math.min(pending, capacity);
    let next = counter;
    for (let index = 0; index < advance; index += 1) {
      next = nextUint32(next);
    }
    return [next, pending - advance];
  }

  #compactHistory(): void {
    if (this.#history.length <= this.#maxHistory) return;

    const overflow = this.#history.length - this.#maxHistory;
    // Movement/look are latest-state data. Preserve action transitions and the
    // newest frame; coalesce only frames whose cumulative counters are equal to
    // their successor.
    let remaining = overflow;
    for (let index = 0; index < this.#history.length - 1 && remaining > 0; ) {
      const current = this.#history[index];
      const next = this.#history[index + 1];
      if (!current || !next) break;
      const carriesAction =
        current.fireCounter !== next.fireCounter ||
        current.reloadCounter !== next.reloadCounter ||
        current.respawnCounter !== next.respawnCounter;
      if (carriesAction) {
        index += 1;
        continue;
      }
      this.#history.splice(index, 1);
      remaining -= 1;
    }

    if (remaining > 0) {
      // Action counters are cumulative, so retaining the newest bounded window
      // still preserves every unacknowledged server action even when very old
      // prediction frames must be discarded during a long interruption.
      this.#history.splice(0, remaining);
    }
  }
}
