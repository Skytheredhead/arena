import {
  type InputCommand,
  type LocalPlayerState,
  type PredictionDebugState,
  simulatePlayerTick
} from '@arena/shared';

const distanceBetween = (left: LocalPlayerState, right: LocalPlayerState): number =>
  Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
    left.position.z - right.position.z
  );

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;

const mergeAuthoritativeMetadata = (
  current: LocalPlayerState,
  authoritative: LocalPlayerState
): LocalPlayerState => ({
  ...current,
  identity: authoritative.identity,
  serverTick: authoritative.serverTick,
  serverTimeMs: authoritative.serverTimeMs,
  onGround: authoritative.onGround,
  alive: authoritative.alive,
  health: authoritative.health,
  ammo: authoritative.ammo,
  lastProcessedInput: authoritative.lastProcessedInput,
  respawnTick: authoritative.respawnTick
});

export class PredictionController {
  private static readonly TRUST_LOCAL_MOTION_DISTANCE = 0.55;
  private static readonly SOFT_CORRECTION_DISTANCE = 2.2;
  private static readonly SOFT_CORRECTION_BLEND = 0.24;
  private static readonly SOFT_VELOCITY_BLEND = 0.35;

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
    if (authoritativeState.serverTick < this.lastAuthoritativeTick) {
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
      input => input.sequence > authoritativeState.lastProcessedInput
    );

    let serverReconciled = structuredClone(authoritativeState);
    for (const input of this.pendingInputs) {
      serverReconciled = simulatePlayerTick(serverReconciled, input);
    }

    const correctionDistance = distanceBetween(before, serverReconciled);
    this.lastCorrectionDistance = correctionDistance;
    const lifeStateChanged =
      before.alive !== authoritativeState.alive ||
      before.respawnTick !== authoritativeState.respawnTick;

    if (
      !lifeStateChanged &&
      correctionDistance <= PredictionController.TRUST_LOCAL_MOTION_DISTANCE
    ) {
      this.predictedState = mergeAuthoritativeMetadata(before, serverReconciled);
    } else if (
      !lifeStateChanged &&
      correctionDistance <= PredictionController.SOFT_CORRECTION_DISTANCE
    ) {
      this.predictedState = mergeAuthoritativeMetadata(
        {
          ...serverReconciled,
          position: {
            x: lerp(
              before.position.x,
              serverReconciled.position.x,
              PredictionController.SOFT_CORRECTION_BLEND
            ),
            y: lerp(
              before.position.y,
              serverReconciled.position.y,
              PredictionController.SOFT_CORRECTION_BLEND
            ),
            z: lerp(
              before.position.z,
              serverReconciled.position.z,
              PredictionController.SOFT_CORRECTION_BLEND
            )
          },
          velocity: {
            x: lerp(
              before.velocity.x,
              serverReconciled.velocity.x,
              PredictionController.SOFT_VELOCITY_BLEND
            ),
            y: lerp(
              before.velocity.y,
              serverReconciled.velocity.y,
              PredictionController.SOFT_VELOCITY_BLEND
            ),
            z: lerp(
              before.velocity.z,
              serverReconciled.velocity.z,
              PredictionController.SOFT_VELOCITY_BLEND
            )
          }
        },
        serverReconciled
      );
    } else {
      this.predictedState = serverReconciled;
    }

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
