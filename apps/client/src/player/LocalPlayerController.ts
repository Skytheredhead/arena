import {
  SERVER_TICK_MS,
  isUint32Newer,
  nextUint32,
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
const MAX_PENDING_PREDICTION_INPUTS = 96;

export interface ReconciliationOptions {
  hardSnapDistanceMeters?: number;
}

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
    if (this.pendingInputs.length > MAX_PENDING_PREDICTION_INPUTS) {
      this.pendingInputs.splice(
        0,
        this.pendingInputs.length - MAX_PENDING_PREDICTION_INPUTS
      );
    }
    const next = simulatePlayerTick(this.state, input);
    this.state = {
      ...next,
      serverTick: nextUint32(this.state.serverTick),
      serverTimeMs: Math.max(
        this.state.serverTimeMs + SERVER_TICK_MS,
        next.serverTimeMs
      ),
      lastProcessedInput: input.sequence,
    };
    return this.state;
  }

  applyAuthoritativeSnapshot(
    authoritativeState: LocalPlayerState,
    options: ReconciliationOptions = {}
  ): { state: LocalPlayerState; snapped: boolean } {
    if (
      authoritativeState.serverTick !== this.lastAuthoritativeTick &&
      !isUint32Newer(authoritativeState.serverTick, this.lastAuthoritativeTick)
    ) {
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
      input => isUint32Newer(input.sequence, authoritativeState.lastProcessedInput)
    );

    let replayed = structuredClone(authoritativeState);
    for (const input of this.pendingInputs) {
      replayed = {
        ...simulatePlayerTick(replayed, input),
        serverTick: nextUint32(replayed.serverTick),
        serverTimeMs: Math.max(
          replayed.serverTimeMs + SERVER_TICK_MS,
          authoritativeState.serverTimeMs
        ),
        lastProcessedInput: input.sequence,
      };
    }

    this.lastCorrectionDistance = distanceBetween(before, replayed);

    const lifecycleSnap =
      !before.alive ||
      !authoritativeState.alive ||
      isUint32Newer(authoritativeState.respawnTick, before.respawnTick);
    const positionSnap =
      this.lastCorrectionDistance >=
      (options.hardSnapDistanceMeters ?? LOCAL_HARD_SNAP_DISTANCE_METERS);

    if (lifecycleSnap) {
      this.state = structuredClone(authoritativeState);
      this.pendingInputs = [];
      return { state: this.state, snapped: true };
    }

    this.state = {
      ...replayed,
      yaw: currentView.yaw,
      pitch: currentView.pitch,
    };

    return { state: this.state, snapped: positionSnap };
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
