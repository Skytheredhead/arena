export interface RuntimeHudFrame {
  crosshairSpread: number;
  sniperCooldownReady: number;
}

type RuntimeHudFrameListener = (frame: RuntimeHudFrame) => void;

const listeners = new Set<RuntimeHudFrameListener>();

let currentFrame: RuntimeHudFrame = {
  crosshairSpread: 0,
  sniperCooldownReady: 1,
};

const quantize = (value: number, decimals: number): number => {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
};

const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const getRuntimeHudFrame = (): RuntimeHudFrame => currentFrame;

export const publishRuntimeHudFrame = (
  frame: Partial<RuntimeHudFrame>
): void => {
  const nextFrame: RuntimeHudFrame = {
    crosshairSpread: quantize(
      Math.max(
        0,
        finiteOr(frame.crosshairSpread, currentFrame.crosshairSpread)
      ),
      2
    ),
    sniperCooldownReady: quantize(
      Math.max(
        0,
        Math.min(
          1,
          finiteOr(frame.sniperCooldownReady, currentFrame.sniperCooldownReady)
        )
      ),
      3
    ),
  };

  if (
    nextFrame.crosshairSpread === currentFrame.crosshairSpread &&
    nextFrame.sniperCooldownReady === currentFrame.sniperCooldownReady
  ) {
    return;
  }

  currentFrame = nextFrame;
  for (const listener of listeners) {
    listener(currentFrame);
  }
};

export const subscribeRuntimeHudFrame = (
  listener: RuntimeHudFrameListener
): (() => void) => {
  listeners.add(listener);
  listener(currentFrame);
  return () => {
    listeners.delete(listener);
  };
};
