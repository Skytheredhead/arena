import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeStore,
  createInitialRuntimeSnapshot,
} from '../state/RuntimeStore';

describe('RuntimeStore', () => {
  it('throttles ordinary React-facing publications and coalesces patches', () => {
    let now = 0;
    const scheduler: { callback: (() => void) | null } = { callback: null };
    const listener = vi.fn();
    const store = new RuntimeStore(createInitialRuntimeSnapshot(), {
      publishHz: 10,
      now: () => now,
      schedule: (callback) => {
        scheduler.callback = callback;
        return 7;
      },
      cancel: () => undefined,
    });
    store.subscribe(listener);

    store.patch({ health: 75 });
    store.patch((current) => ({ kills: current.kills + 1 }));
    expect(store.getSnapshot().health).toBe(100);
    expect(listener).not.toHaveBeenCalled();

    now = 100;
    scheduler.callback?.();
    expect(store.getSnapshot()).toMatchObject({ health: 75, kills: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('publishes urgent state immediately and stops after disposal', () => {
    let now = 0;
    const listener = vi.fn();
    const store = new RuntimeStore(createInitialRuntimeSnapshot(), {
      now: () => now,
      schedule: () => 1,
      cancel: () => undefined,
    });
    store.subscribe(listener);
    store.patch({ alive: true }, { urgent: true });
    expect(store.getSnapshot().alive).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    store.dispose();
    now = 1_000;
    store.patch({ alive: false }, { urgent: true });
    expect(store.getSnapshot().alive).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
