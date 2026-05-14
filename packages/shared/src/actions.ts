import type { WeaponSlot } from './gameplay';

export interface InputCommand {
  sequence: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jumpHeld: boolean;
  sprintHeld: boolean;
  crouchHeld: boolean;
  scoped: boolean;
  fireHeld: boolean;
  reloadPressed: boolean;
  weaponSlot: WeaponSlot;
}

export interface FrameInput {
  moveX: number;
  moveZ: number;
  jumping: boolean;
  sprinting: boolean;
  crouching: boolean;
  scoped: boolean;
  scoreboardHeld: boolean;
  wantsFire: boolean;
  wantsReload: boolean;
  weaponSlot: WeaponSlot;
}
