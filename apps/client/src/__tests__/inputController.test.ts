import { describe, expect, it, vi } from 'vitest';

import { InputController } from '../input/InputController';

describe('InputController pointer lock', () => {
  it('does not throw when requestPointerLock returns undefined', () => {
    const element = document.createElement('canvas');
    const requestPointerLock = vi.fn(() => undefined);
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: requestPointerLock,
    });

    const controller = new InputController(element);
    controller.setPointerLockEnabled(true);

    expect(() => controller.requestPointerLock()).not.toThrow();
    expect(requestPointerLock).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('does not throw from click-triggered pointer lock requests', () => {
    const element = document.createElement('canvas');
    const requestPointerLock = vi.fn(() => undefined);
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: requestPointerLock,
    });

    const controller = new InputController(element);
    controller.setPointerLockEnabled(true);

    expect(() => element.dispatchEvent(new MouseEvent('click'))).not.toThrow();
    expect(requestPointerLock).toHaveBeenCalledTimes(1);

    controller.dispose();
  });
});
