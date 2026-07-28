// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  INPUT_BUTTON_FIRE,
  INPUT_BUTTON_FORWARD,
  INPUT_BUTTON_SPRINT,
} from '../netcode/contracts';
import {
  InputController,
  clampPitch,
  cycleWeapon,
  normalizeYaw,
} from '../input/InputController';

describe('input helpers', () => {
  it('cycles all weapons in both directions', () => {
    expect(cycleWeapon(1, 1)).toBe(2);
    expect(cycleWeapon(3, 1)).toBe(1);
    expect(cycleWeapon(1, -1)).toBe(3);
  });

  it('bounds pitch and normalizes yaw', () => {
    expect(clampPitch(99)).toBeLessThan(Math.PI / 2);
    expect(clampPitch(-99)).toBeGreaterThan(-Math.PI / 2);
    expect(normalizeYaw(Math.PI * 4)).toBeCloseTo(0, 8);
  });
});

describe('InputController', () => {
  it('samples keyboard, pointer-lock fire edges, and wheel switching', async () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    let pointerLockElement: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => pointerLockElement,
    });
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: () => {
        pointerLockElement = canvas;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        pointerLockElement = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
    const onWeaponChange = vi.fn();
    let now = 100;
    const controller = new InputController(canvas, {
      onWeaponChange,
      now: () => now,
      wheelDebounceMs: 50,
    });
    controller.attach();
    await expect(controller.requestPointerLock()).resolves.toBe(true);

    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true })
    );
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, bubbles: true })
    );
    const sampled = controller.sample(1n);
    expect(sampled.moveZ).toBe(1);
    expect(sampled.buttons & INPUT_BUTTON_FORWARD).not.toBe(0);
    expect(sampled.buttons & INPUT_BUTTON_SPRINT).not.toBe(0);
    expect(sampled.buttons & INPUT_BUTTON_FIRE).not.toBe(0);
    expect(controller.consumeActionEdges().fire).toBe(1);
    expect(controller.consumeActionEdges().fire).toBe(0);

    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true })
    );
    expect(controller.desiredWeapon).toBe(2);
    now += 10;
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true })
    );
    expect(controller.desiredWeapon).toBe(2);
    now += 50;
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true })
    );
    expect(controller.desiredWeapon).toBe(1);
    expect(onWeaponChange).toHaveBeenCalledTimes(2);

    controller.detach();
    canvas.remove();
  });

  it('supports bounded mobile input and clears held state when disabled', () => {
    const canvas = document.createElement('canvas');
    const controller = new InputController(canvas);
    controller.setMobileMove(5, -5);
    controller.setMobileFire(true);
    const sample = controller.sample(1n);
    expect(sample.moveX).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sample.moveZ).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(controller.consumeActionEdges().fire).toBe(1);

    controller.setEnabled(false);
    const disabled = controller.sample(2n);
    expect(disabled.moveX).toBe(0);
    expect(disabled.moveZ).toBe(0);
    expect(disabled.buttons).toBe(0);
  });
});
