import {
  SERVER_TICK_MS,
  simulatePlayerTick,
  type InputCommand,
  type LocalPlayerState,
  type PredictionDebugState,
} from '@arena/shared';

const distanceBetween = (left: LocalPlayerState, right: LocalPlayerState): number =>
  Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
    left.position.z - right.position.z
  );

const LOCAL_HARD_SNAP_DISTANCE_METERS = 8;

export class LocalPlayerController {
  private state: LocalPlayerState;
  private pendingInputs: InputCommand[] = [];
  private lastAuthoritativeTick: number;
  private lastAckedSequence: number;
  private reconciliationCount = 0;
  private lastCorrectionDistance = 0;

  constructor(initialState: LocalPlayerState) {
    this.state = structuredClone(initialState);
    this.lastAuthoritativeTick = initialState.serverTick;
    this.lastAckedSequence = initialState.lastProcessedInput;
  }

  applyLook(yawDelta: number, pitchDelta: number): void {
    this.state = {
      ...this.state,
      yaw: this.state.yaw - yawDelta,
      pitch: this.state.pitch - pitchDelta,
    };
  }

  step(input: InputCommand): LocalPlayerState {
    this.pendingInputs.push(input);
    const next = simulatePlayerTick(this.state, input);
    this.state = {
      ...next,
      serverTick: Math.max(this.state.serverTick + 1, next.serverTick),
      serverTimeMs: Math.max(
        this.state.serverTimeMs + SERVER_TICK_MS,
        next.serverTimeMs
      ),
      lastProcessedInput: input.sequence,
    };
    return this.state;
  }

  applyAuthoritativeSnapshot(
    authoritativeState: LocalPlayerState
  ): { state: LocalPlayerState; snapped: boolean } {
    if (authoritativeState.serverTick < this.lastAuthoritativeTick) {
      return { state: this.state, snapped: false };
    }

    const before = this.state;
    const currentView = {
      yaw: this.state.yaw,
      pitch: this.state.pitch,
    };
    this.lastAuthoritativeTick = authoritativeState.serverTick;
    this.lastAckedSequence = authoritativeState.lastProcessedInput;
    this.reconciliationCount += 1;
    this.pendingInputs = this.pendingInputs.filter(
      input => input.sequence > authoritativeState.lastProcessedInput
    );

    let replayed = structuredClone(authoritativeState);
    for (const input of this.pendingInputs) {
      replayed = {
        ...simulatePlayerTick(replayed, input),
        serverTick: Math.max(replayed.serverTick + 1, authoritativeState.serverTick),
        serverTimeMs: Math.max(
          replayed.serverTimeMs + SERVER_TICK_MS,
          authoritativeState.serverTimeMs
        ),
        lastProcessedInput: input.sequence,
      };
    }

    this.lastCorrectionDistance = distanceBetween(before, replayed);

    const shouldSnap =
      !before.alive ||
      !authoritativeState.alive ||
      authoritativeState.respawnTick > before.respawnTick ||
      this.lastCorrectionDistance >= LOCAL_HARD_SNAP_DISTANCE_METERS;

    if (shouldSnap) {
      this.state = structuredClone(authoritativeState);
      this.pendingInputs = [];
      return { state: this.state, snapped: true };
    }

    this.state = {
      ...replayed,
      yaw: currentView.yaw,
      pitch: currentView.pitch,
    };

    return { state: this.state, snapped: false };
  }

  hydrate(authoritativeState: LocalPlayerState): LocalPlayerState {
    this.state = structuredClone(authoritativeState);
    this.pendingInputs = [];
    this.lastAuthoritativeTick = authoritativeState.serverTick;
    this.lastAckedSequence = authoritativeState.lastProcessedInput;
    this.reconciliationCount = 0;
    this.lastCorrectionDistance = 0;
    return this.state;
  }

  setAmmo(ammo: number): LocalPlayerState {
    this.state = {
      ...this.state,
      ammo,
    };
    return this.state;
  }

  getState(): LocalPlayerState {
    return this.state;
  }

  getDebugState(): PredictionDebugState {
    return {
      lastAuthoritativeTick: this.lastAuthoritativeTick,
      lastAckedSequence: this.lastAckedSequence,
      pendingInputs: this.pendingInputs.length,
      reconciliationCount: this.reconciliationCount,
      lastCorrectionDistance: this.lastCorrectionDistance,
    };
  }
}
