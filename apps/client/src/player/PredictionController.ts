import {
  type InputCommand,
  type LocalPlayerState,
  type PredictionDebugState,
  isUint32Newer,
  simulatePlayerTick
} from '@arena/shared';

const MAX_PENDING_PREDICTION_INPUTS = 96;

const distanceBetween = (left: LocalPlayerState, right: LocalPlayerState): number =>
  Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
    left.position.z - right.position.z
  );

export class PredictionController {
  private predictedState: LocalPlayerState;
  private pendingInputs: InputCommand[] = [];
  private lastAuthoritativeTick: number;
  private lastAckedSequence: number;
  private reconciliationCount = 0;
  private lastCorrectionDistance = 0;

  constructor(initialState: LocalPlayerState) {
    this.predictedState = structuredClone(initialState);
    this.lastAuthoritativeTick = initialState.serverTick;
    this.lastAckedSequence = initialState.lastProcessedInput;
  }

  applyLook(yawDelta: number, pitchDelta: number): void {
    this.predictedState = {
      ...this.predictedState,
      yaw: this.predictedState.yaw - yawDelta,
      pitch: this.predictedState.pitch - pitchDelta
    };
  }

  queueInput(input: InputCommand): LocalPlayerState {
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > MAX_PENDING_PREDICTION_INPUTS) {
      this.pendingInputs.splice(
        0,
        this.pendingInputs.length - MAX_PENDING_PREDICTION_INPUTS
      );
    }
    this.predictedState = simulatePlayerTick(this.predictedState, input);
    return this.predictedState;
  }

  setAmmo(ammo: number): LocalPlayerState {
    this.predictedState = {
      ...this.predictedState,
      ammo
    };
    return this.predictedState;
  }

  reconcile(authoritativeState: LocalPlayerState): LocalPlayerState {
    if (
      authoritativeState.serverTick !== this.lastAuthoritativeTick &&
      !isUint32Newer(authoritativeState.serverTick, this.lastAuthoritativeTick)
    ) {
      return this.predictedState;
    }

    const before = this.predictedState;
    const currentView = {
      yaw: this.predictedState.yaw,
      pitch: this.predictedState.pitch
    };
    this.lastAuthoritativeTick = authoritativeState.serverTick;
    this.lastAckedSequence = authoritativeState.lastProcessedInput;
    this.reconciliationCount += 1;
    this.pendingInputs = this.pendingInputs.filter(
      input => isUint32Newer(input.sequence, authoritativeState.lastProcessedInput)
    );

    let serverReconciled = structuredClone(authoritativeState);
    for (const input of this.pendingInputs) {
      serverReconciled = simulatePlayerTick(serverReconciled, input);
    }

    const correctionDistance = distanceBetween(before, serverReconciled);
    this.lastCorrectionDistance = correctionDistance;
    this.predictedState = serverReconciled;

    // Keep the freshest local look state instead of snapping back to the
    // last server-acknowledged yaw/pitch every reconciliation.
    this.predictedState = {
      ...this.predictedState,
      yaw: currentView.yaw,
      pitch: currentView.pitch
    };

    return this.predictedState;
  }

  hydrate(authoritativeState: LocalPlayerState): LocalPlayerState {
    this.predictedState = structuredClone(authoritativeState);
    this.pendingInputs = [];
    this.lastAuthoritativeTick = authoritativeState.serverTick;
    this.lastAckedSequence = authoritativeState.lastProcessedInput;
    this.reconciliationCount = 0;
    this.lastCorrectionDistance = 0;
    return this.predictedState;
  }

  getState(): LocalPlayerState {
    return this.predictedState;
  }

  getDebugState(): PredictionDebugState {
    return {
      lastAuthoritativeTick: this.lastAuthoritativeTick,
      lastAckedSequence: this.lastAckedSequence,
      pendingInputs: this.pendingInputs.length,
      reconciliationCount: this.reconciliationCount,
      lastCorrectionDistance: this.lastCorrectionDistance
    };
  }
}
