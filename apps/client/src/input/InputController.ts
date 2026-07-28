import {
  INPUT_BUTTON_BACK,
  INPUT_BUTTON_FIRE,
  INPUT_BUTTON_FORWARD,
  INPUT_BUTTON_JUMP,
  INPUT_BUTTON_LEFT,
  INPUT_BUTTON_RIGHT,
  INPUT_BUTTON_SCOPE,
  INPUT_BUTTON_SPRINT,
  type ActionEdges,
  type InputIntent,
  type WeaponSlot,
} from '../netcode/contracts';

export interface KeyBindings {
  forward: string;
  back: string;
  left: string;
  right: string;
  jump: string;
  sprint: string;
  reload: string;
  weapon1: string;
  weapon2: string;
  weapon3: string;
  scoreboard: string;
  chat: string;
  fullscreen: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  reload: 'KeyR',
  weapon1: 'Digit1',
  weapon2: 'Digit2',
  weapon3: 'Digit3',
  scoreboard: 'Tab',
  chat: 'Slash',
  fullscreen: 'KeyF',
};

export interface InputControllerCallbacks {
  onPointerLockChange?: (locked: boolean) => void;
  onPauseRequested?: () => void;
  onScoreboardChange?: (open: boolean) => void;
  onChatRequested?: () => void;
  onWeaponChange?: (slot: WeaponSlot) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

export interface InputControllerOptions extends InputControllerCallbacks {
  document?: Document;
  window?: Window;
  sensitivity?: number;
  bindings?: Partial<KeyBindings>;
  initialWeapon?: WeaponSlot;
  initialYaw?: number;
  initialPitch?: number;
  wheelDebounceMs?: number;
  now?: () => number;
}

const MAX_PITCH = Math.PI * 0.488;

export const clampPitch = (pitch: number): number =>
  Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));

export const normalizeYaw = (yaw: number): number =>
  Math.atan2(Math.sin(yaw), Math.cos(yaw));

export const cycleWeapon = (
  current: WeaponSlot,
  direction: 1 | -1
): WeaponSlot => {
  const zeroBased = current - 1;
  return ((((zeroBased + direction) % 3) + 3) % 3 + 1) as WeaponSlot;
};

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export class InputController {
  readonly #target: HTMLElement;
  readonly #document: Document;
  readonly #window: Window;
  readonly #callbacks: InputControllerCallbacks;
  readonly #pressed = new Set<string>();
  readonly #now: () => number;
  readonly #wheelDebounceMs: number;

  #bindings: KeyBindings;
  #sensitivity: number;
  #desiredWeapon: WeaponSlot;
  #yaw: number;
  #pitch: number;
  #enabled = true;
  #attached = false;
  #fireHeld = false;
  #scopeHeld = false;
  #lastWheelAt = -Infinity;
  #pendingFireEdges = 0;
  #pendingReloadEdges = 0;
  #pendingRespawnEdges = 0;
  #weaponChanged = false;
  #mobileMoveX = 0;
  #mobileMoveZ = 0;
  #mobileFireHeld = false;

  constructor(target: HTMLElement, options: InputControllerOptions = {}) {
    this.#target = target;
    this.#document = options.document ?? document;
    this.#window = options.window ?? window;
    this.#callbacks = options;
    this.#bindings = { ...DEFAULT_KEY_BINDINGS, ...options.bindings };
    this.#sensitivity = Math.max(0.0001, options.sensitivity ?? 0.0021);
    this.#desiredWeapon = options.initialWeapon ?? 1;
    this.#yaw = normalizeYaw(options.initialYaw ?? 0);
    this.#pitch = clampPitch(options.initialPitch ?? 0);
    this.#wheelDebounceMs = Math.max(0, options.wheelDebounceMs ?? 90);
    this.#now = options.now ?? (() => performance.now());
  }

  attach(): void {
    if (this.#attached) return;
    this.#attached = true;
    this.#target.addEventListener('click', this.#onTargetClick);
    this.#target.addEventListener('mousedown', this.#onMouseDown);
    this.#target.addEventListener('mouseup', this.#onMouseUp);
    this.#target.addEventListener('contextmenu', this.#onContextMenu);
    this.#target.addEventListener('wheel', this.#onWheel, { passive: false });
    this.#document.addEventListener('mousemove', this.#onMouseMove);
    this.#document.addEventListener(
      'pointerlockchange',
      this.#onPointerLockChange
    );
    this.#document.addEventListener(
      'fullscreenchange',
      this.#onFullscreenChange
    );
    this.#window.addEventListener('keydown', this.#onKeyDown);
    this.#window.addEventListener('keyup', this.#onKeyUp);
    this.#window.addEventListener('blur', this.#onBlur);
  }

  detach(): void {
    if (!this.#attached) return;
    this.#attached = false;
    this.#target.removeEventListener('click', this.#onTargetClick);
    this.#target.removeEventListener('mousedown', this.#onMouseDown);
    this.#target.removeEventListener('mouseup', this.#onMouseUp);
    this.#target.removeEventListener('contextmenu', this.#onContextMenu);
    this.#target.removeEventListener('wheel', this.#onWheel);
    this.#document.removeEventListener('mousemove', this.#onMouseMove);
    this.#document.removeEventListener(
      'pointerlockchange',
      this.#onPointerLockChange
    );
    this.#document.removeEventListener(
      'fullscreenchange',
      this.#onFullscreenChange
    );
    this.#window.removeEventListener('keydown', this.#onKeyDown);
    this.#window.removeEventListener('keyup', this.#onKeyUp);
    this.#window.removeEventListener('blur', this.#onBlur);
    this.#clearHeldState();
  }

  async requestPointerLock(): Promise<boolean> {
    if (!this.#enabled) return false;
    try {
      await this.#target.requestPointerLock();
      return this.pointerLocked;
    } catch {
      return false;
    }
  }

  releasePointerLock(): void {
    if (this.pointerLocked) this.#document.exitPointerLock();
  }

  async requestFullscreen(): Promise<boolean> {
    try {
      if (this.#document.fullscreenElement) {
        await this.#document.exitFullscreen();
      } else {
        await this.#target.requestFullscreen();
      }
      return this.#document.fullscreenElement != null;
    } catch {
      return false;
    }
  }

  sample(clientTick: bigint): InputIntent {
    const forward =
      (this.#pressed.has(this.#bindings.forward) ? 1 : 0) -
      (this.#pressed.has(this.#bindings.back) ? 1 : 0);
    const strafe =
      (this.#pressed.has(this.#bindings.right) ? 1 : 0) -
      (this.#pressed.has(this.#bindings.left) ? 1 : 0);
    const combinedX = strafe || this.#mobileMoveX;
    const combinedZ = forward || this.#mobileMoveZ;
    const length = Math.hypot(combinedX, combinedZ);
    const moveX = length > 1 ? combinedX / length : combinedX;
    const moveZ = length > 1 ? combinedZ / length : combinedZ;

    let buttons = 0;
    if (this.#pressed.has(this.#bindings.forward)) {
      buttons |= INPUT_BUTTON_FORWARD;
    }
    if (this.#pressed.has(this.#bindings.back)) buttons |= INPUT_BUTTON_BACK;
    if (this.#pressed.has(this.#bindings.left)) buttons |= INPUT_BUTTON_LEFT;
    if (this.#pressed.has(this.#bindings.right)) buttons |= INPUT_BUTTON_RIGHT;
    if (this.#pressed.has(this.#bindings.jump)) buttons |= INPUT_BUTTON_JUMP;
    if (this.#pressed.has(this.#bindings.sprint)) buttons |= INPUT_BUTTON_SPRINT;
    if (this.#fireHeld || this.#mobileFireHeld) buttons |= INPUT_BUTTON_FIRE;
    if (this.#scopeHeld) buttons |= INPUT_BUTTON_SCOPE;

    return {
      clientTick,
      moveX: this.#enabled ? moveX : 0,
      moveZ: this.#enabled ? moveZ : 0,
      yaw: this.#yaw,
      pitch: this.#pitch,
      buttons: this.#enabled ? buttons : 0,
      desiredWeapon: this.#desiredWeapon,
    };
  }

  consumeActionEdges(): ActionEdges {
    const result: ActionEdges = {
      fire: this.#pendingFireEdges,
      reload: this.#pendingReloadEdges,
      respawn: this.#pendingRespawnEdges,
      weaponChanged: this.#weaponChanged,
    };
    this.#pendingFireEdges = 0;
    this.#pendingReloadEdges = 0;
    this.#pendingRespawnEdges = 0;
    this.#weaponChanged = false;
    return result;
  }

  requestRespawn(): void {
    this.#pendingRespawnEdges = Math.min(8, this.#pendingRespawnEdges + 1);
  }

  setMobileMove(x: number, z: number): void {
    this.#mobileMoveX = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
    this.#mobileMoveZ = Math.max(-1, Math.min(1, Number.isFinite(z) ? z : 0));
  }

  addMobileLookDelta(x: number, y: number): void {
    if (!this.#enabled) return;
    const safeX = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
    const safeY = Math.max(-1, Math.min(1, Number.isFinite(y) ? y : 0));
    this.#yaw = normalizeYaw(this.#yaw - safeX * 0.036);
    this.#pitch = clampPitch(this.#pitch - safeY * 0.03);
  }

  setMobileFire(firing: boolean): void {
    const next = this.#enabled && firing;
    if (next && !this.#mobileFireHeld) {
      this.#pendingFireEdges = Math.min(8, this.#pendingFireEdges + 1);
    }
    this.#mobileFireHeld = next;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) {
      this.releasePointerLock();
      this.#clearHeldState();
    }
  }

  setSensitivity(sensitivity: number): void {
    if (Number.isFinite(sensitivity)) {
      this.#sensitivity = Math.max(0.0001, Math.min(0.02, sensitivity));
    }
  }

  setBindings(bindings: Partial<KeyBindings>): void {
    this.#bindings = { ...this.#bindings, ...bindings };
    this.#clearHeldState();
  }

  setView(yaw: number, pitch: number): void {
    this.#yaw = normalizeYaw(yaw);
    this.#pitch = clampPitch(pitch);
  }

  setWeapon(slot: WeaponSlot): void {
    if (slot === this.#desiredWeapon) return;
    this.#desiredWeapon = slot;
    this.#weaponChanged = true;
    this.#callbacks.onWeaponChange?.(slot);
  }

  synchronizeWeapon(slot: WeaponSlot): void {
    this.#desiredWeapon = slot;
    this.#weaponChanged = false;
  }

  get pointerLocked(): boolean {
    return this.#document.pointerLockElement === this.#target;
  }

  get desiredWeapon(): WeaponSlot {
    return this.#desiredWeapon;
  }

  get view(): { yaw: number; pitch: number } {
    return { yaw: this.#yaw, pitch: this.#pitch };
  }

  readonly #onTargetClick = (): void => {
    if (this.#enabled && !this.pointerLocked) {
      void this.requestPointerLock();
    }
  };

  readonly #onMouseMove = (event: MouseEvent): void => {
    if (!this.#enabled || !this.pointerLocked) return;
    this.#yaw = normalizeYaw(this.#yaw - event.movementX * this.#sensitivity);
    this.#pitch = clampPitch(
      this.#pitch - event.movementY * this.#sensitivity
    );
  };

  readonly #onMouseDown = (event: MouseEvent): void => {
    if (!this.#enabled || !this.pointerLocked) return;
    if (event.button === 0) {
      if (!this.#fireHeld) {
        this.#pendingFireEdges = Math.min(8, this.#pendingFireEdges + 1);
      }
      this.#fireHeld = true;
    }
    if (event.button === 2) this.#scopeHeld = true;
  };

  readonly #onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.#fireHeld = false;
    if (event.button === 2) this.#scopeHeld = false;
  };

  readonly #onContextMenu = (event: MouseEvent): void => {
    if (this.pointerLocked) event.preventDefault();
  };

  readonly #onWheel = (event: WheelEvent): void => {
    if (!this.#enabled || !this.pointerLocked || event.deltaY === 0) return;
    event.preventDefault();
    const now = this.#now();
    if (now - this.#lastWheelAt < this.#wheelDebounceMs) return;
    this.#lastWheelAt = now;
    this.setWeapon(cycleWeapon(this.#desiredWeapon, event.deltaY > 0 ? 1 : -1));
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;

    if (event.code === this.#bindings.scoreboard) {
      event.preventDefault();
      this.#callbacks.onScoreboardChange?.(true);
      return;
    }
    if (event.code === this.#bindings.chat && !event.repeat) {
      event.preventDefault();
      this.#callbacks.onChatRequested?.();
      return;
    }
    if (event.code === 'Escape' && !event.repeat) {
      this.#callbacks.onPauseRequested?.();
      return;
    }
    if (event.code === this.#bindings.fullscreen && !event.repeat) {
      event.preventDefault();
      void this.requestFullscreen();
      return;
    }
    if (!this.#enabled) return;

    if (!event.repeat && event.code === this.#bindings.reload) {
      this.#pendingReloadEdges = Math.min(8, this.#pendingReloadEdges + 1);
    } else if (!event.repeat && event.code === this.#bindings.weapon1) {
      this.setWeapon(1);
    } else if (!event.repeat && event.code === this.#bindings.weapon2) {
      this.setWeapon(2);
    } else if (!event.repeat && event.code === this.#bindings.weapon3) {
      this.setWeapon(3);
    }

    this.#pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    this.#pressed.delete(event.code);
    if (event.code === this.#bindings.scoreboard) {
      event.preventDefault();
      this.#callbacks.onScoreboardChange?.(false);
    }
  };

  readonly #onBlur = (): void => {
    this.#clearHeldState();
    this.#callbacks.onScoreboardChange?.(false);
  };

  readonly #onPointerLockChange = (): void => {
    const locked = this.pointerLocked;
    if (!locked) this.#clearHeldState();
    this.#callbacks.onPointerLockChange?.(locked);
  };

  readonly #onFullscreenChange = (): void => {
    this.#callbacks.onFullscreenChange?.(
      this.#document.fullscreenElement != null
    );
  };

  #clearHeldState(): void {
    this.#pressed.clear();
    this.#fireHeld = false;
    this.#scopeHeld = false;
    this.#mobileMoveX = 0;
    this.#mobileMoveZ = 0;
    this.#mobileFireHeld = false;
  }
}
