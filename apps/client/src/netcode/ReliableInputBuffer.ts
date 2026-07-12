import {
  coalesceInputCommands,
  isUint32AtOrAfter,
  isUint32Newer,
  sanitizeInputCommand,
  type InputCommand,
} from '@arena/shared';

interface PendingInput {
  command: InputCommand;
  queuedAtMs: number;
  firstSentAtMs: number | null;
  lastSentAtMs: number | null;
  attempts: number;
}

export interface ReliableInputBufferOptions {
  capacity?: number;
  maxSendBurst?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface InputSendBatch {
  commands: InputCommand[];
  retry: boolean;
}

const DEFAULT_CAPACITY = 96;
const DEFAULT_MAX_SEND_BURST = 4;
const DEFAULT_RETRY_BASE_MS = 90;
const DEFAULT_RETRY_MAX_MS = 600;

/**
 * Retains input snapshots until the authoritative player state acknowledges
 * their sequence. Fresh snapshots are sent immediately; an overdue backlog is
 * compacted into its newest sequence while preserving transient actions.
 */
export class ReliableInputBuffer {
  private readonly capacity: number;
  private readonly maxSendBurst: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private pending: PendingInput[] = [];
  private forceRetry = false;

  constructor(options: ReliableInputBufferOptions = {}) {
    this.capacity = Math.max(2, Math.trunc(options.capacity ?? DEFAULT_CAPACITY));
    this.maxSendBurst = Math.max(
      1,
      Math.trunc(options.maxSendBurst ?? DEFAULT_MAX_SEND_BURST)
    );
    this.retryBaseMs = Math.max(1, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS);
    this.retryMaxMs = Math.max(
      this.retryBaseMs,
      options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS
    );
  }

  enqueue(command: InputCommand, nowMs: number): void {
    const previous = this.pending.at(-1)?.command;
    const sanitized = sanitizeInputCommand(command, previous ?? command);
    if (previous && !isUint32Newer(sanitized.sequence, previous.sequence)) {
      return;
    }

    this.pending.push({
      command: sanitized,
      queuedAtMs: nowMs,
      firstSentAtMs: null,
      lastSentAtMs: null,
      attempts: 0,
    });

    if (this.pending.length > this.capacity) {
      this.compactToNewest(nowMs);
    }
  }

  takeDue(nowMs: number): InputSendBatch | null {
    if (this.pending.length === 0) {
      return null;
    }

    const unsent = this.pending.filter((entry) => entry.lastSentAtMs == null);
    if (unsent.length > 0) {
      if (unsent.length <= this.maxSendBurst && !this.forceRetry) {
        for (const entry of unsent) {
          this.markSent(entry, nowMs);
        }
        return {
          commands: unsent.map((entry) => entry.command),
          retry: false,
        };
      }

      const compacted = this.compactCommands();
      this.markAllSent(nowMs);
      this.forceRetry = false;
      return { commands: compacted, retry: false };
    }

    const latest = this.pending.at(-1);
    if (!latest) {
      return null;
    }
    const retryDelay = Math.min(
      this.retryMaxMs,
      this.retryBaseMs * 2 ** Math.min(3, Math.max(0, latest.attempts - 1))
    );
    if (
      !this.forceRetry &&
      nowMs - (latest.lastSentAtMs ?? nowMs) < retryDelay
    ) {
      return null;
    }

    const compacted = this.compactCommands();
    this.markAllSent(nowMs);
    this.forceRetry = false;
    return { commands: compacted, retry: true };
  }

  markSendFailed(): void {
    if (this.pending.length > 0) {
      this.forceRetry = true;
    }
  }

  acknowledge(sequence: number): number | null {
    let lastAcknowledgedIndex = -1;
    let measuredSentAtMs: number | null = null;
    for (let index = 0; index < this.pending.length; index += 1) {
      const entry = this.pending[index];
      if (!entry || !isUint32AtOrAfter(sequence, entry.command.sequence)) {
        break;
      }
      lastAcknowledgedIndex = index;
      if (entry.command.sequence === (sequence >>> 0)) {
        measuredSentAtMs = entry.firstSentAtMs;
      }
    }
    if (lastAcknowledgedIndex >= 0) {
      this.pending.splice(0, lastAcknowledgedIndex + 1);
    }
    if (this.pending.length === 0) {
      this.forceRetry = false;
    }
    return measuredSentAtMs;
  }

  clear(): void {
    this.pending = [];
    this.forceRetry = false;
  }

  size(): number {
    return this.pending.length;
  }

  private compactToNewest(nowMs: number): void {
    const commands = this.compactCommands();
    const firstSentAtMs = this.pending.find(
      (entry) => entry.firstSentAtMs != null
    )?.firstSentAtMs ?? null;
    this.pending = commands.map((command, index) => ({
      command,
      queuedAtMs: nowMs,
      firstSentAtMs: index === commands.length - 1 ? firstSentAtMs : null,
      lastSentAtMs: null,
      attempts: 0,
    }));
    this.forceRetry = true;
  }

  private compactCommands(): InputCommand[] {
    let compacted: InputCommand | null = null;
    for (const entry of this.pending) {
      compacted = coalesceInputCommands(compacted, entry.command);
    }
    const latest = this.pending[this.pending.length - 1]!.command;
    const latestWithTransientReload = {
      ...(compacted ?? latest),
      // Fire is a held level, not an idempotent edge. Keep the latest physical
      // level so a released click cannot become sustained autofire.
      fireHeld: latest.fireHeld,
    };
    if (latest.fireHeld) {
      return [latestWithTransientReload];
    }

    // If an unacknowledged click preceded the release, retry that original
    // sequence first. Same-sequence retries dedupe on the server, while a lost
    // true -> false pair still arrives in the correct order and fires once.
    let fireBearing: InputCommand | null = null;
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const candidate = this.pending[index]?.command;
      if (candidate?.fireHeld) {
        fireBearing = candidate;
        break;
      }
    }
    return fireBearing
      ? [fireBearing, latestWithTransientReload]
      : [latestWithTransientReload];
  }

  private markAllSent(nowMs: number): void {
    for (const entry of this.pending) {
      this.markSent(entry, nowMs);
    }
  }

  private markSent(entry: PendingInput, nowMs: number): void {
    entry.firstSentAtMs ??= nowMs;
    entry.lastSentAtMs = nowMs;
    entry.attempts += 1;
  }
}
