import {
  CAMERA_SENSITIVITY,
  MAX_PITCH,
  SCOREBOARD_KEY,
  type InputCommand
} from '@arena/shared';

interface FrameInput {
  moveX: number;
  moveZ: number;
  jumping: boolean;
  sprinting: boolean;
  scoped: boolean;
  scoreboardHeld: boolean;
  wantsFire: boolean;
}

export class InputController {
  private readonly pressed = new Set<string>();
  private lookDelta = { x: 0, y: 0 };
  private fireHeld = false;
  private lookSensitivity = CAMERA_SENSITIVITY;

  constructor(private readonly element: HTMLElement) {
    this.attach();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.element.removeEventListener('click', this.handleClick);
    this.element.removeEventListener('mousedown', this.handleMouseDown);
    this.element.removeEventListener('mousemove', this.handleMouseMove);
  }

  requestPointerLock(): void {
    this.element.focus();
    if (document.pointerLockElement !== this.element) {
      void this.element.requestPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  clearPressed(): void {
    this.pressed.clear();
    this.fireHeld = false;
    this.lookDelta = { x: 0, y: 0 };
  }

  setLookSensitivity(next: number): void {
    this.lookSensitivity = next;
  }

  private attach(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.element.addEventListener('click', this.handleClick);
    this.element.addEventListener('mousedown', this.handleMouseDown);
    this.element.addEventListener('mousemove', this.handleMouseMove);
  }

  private readonly handleClick = (): void => {
    if (document.pointerLockElement !== this.element) {
      void this.element.requestPointerLock();
    }
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.fireHeld = true;
    }
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.fireHeld = false;
    }
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.element) {
      return;
    }

    this.lookDelta.x += event.movementX * this.lookSensitivity;
    this.lookDelta.y += event.movementY * this.lookSensitivity;
  };

  private readonly handlePointerLockChange = (): void => {
    if (document.pointerLockElement !== this.element) {
      this.fireHeld = false;
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    const typingIntoField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    if (typingIntoField && document.pointerLockElement !== this.element) {
      return;
    }

    if (event.code === SCOREBOARD_KEY) {
      event.preventDefault();
    }

    this.pressed.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const target = event.target;
    const typingIntoField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    if (typingIntoField && document.pointerLockElement !== this.element) {
      return;
    }

    this.pressed.delete(event.code);
  };

  consumeLook(): { yawDelta: number; pitchDelta: number } {
    const delta = {
      yawDelta: this.lookDelta.x,
      pitchDelta: this.lookDelta.y
    };
    this.lookDelta = { x: 0, y: 0 };
    return delta;
  }

  getFrameInput(): FrameInput {
    return {
      moveX:
        (this.pressed.has('KeyD') ? 1 : 0) - (this.pressed.has('KeyA') ? 1 : 0),
      moveZ:
        (this.pressed.has('KeyW') ? 1 : 0) - (this.pressed.has('KeyS') ? 1 : 0),
      jumping: this.pressed.has('Space'),
      sprinting: this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'),
      scoped: this.pressed.has('KeyF'),
      scoreboardHeld: this.pressed.has(SCOREBOARD_KEY),
      wantsFire: this.fireHeld && document.pointerLockElement === this.element
    };
  }

  buildInputCommand(
    sequence: number,
    yaw: number,
    pitch: number
  ): InputCommand {
    const frame = this.getFrameInput();
    return {
      sequence,
      moveX: frame.moveX,
      moveZ: frame.moveZ,
      yaw,
      pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch)),
      jumping: frame.jumping,
      sprinting: frame.sprinting
    };
  }
}
