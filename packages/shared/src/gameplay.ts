export const SERVER_TICK_RATE = 60;
export const SERVER_TICK_SECONDS = 1 / SERVER_TICK_RATE;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;
export const SERVER_TICK_INTERVAL_US = SERVER_TICK_MS * 1000;
export type GraphicsQuality = 'low' | 'medium' | 'high';

export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_EYE_HEIGHT = 1.58;
export const PLAYER_STEP_HEIGHT = 0.65;
export const CROUCH_HEIGHT = 1.35;
export const CROUCH_EYE_HEIGHT = 1.2;
export const CROUCH_HITBOX_HALF = 0.36;

export const WALK_SPEED = 6.4;
export const SPRINT_SPEED = 8.4;
export const CROUCH_SPEED = 3.4;
export const SCOPED_MOVE_SCALE = 0.48;
export const GROUND_ACCELERATION = 30;
export const AIR_ACCELERATION = 5;
export const GROUND_FRICTION = 22;
export const GRAVITY = 24;
export const JUMP_SPEED = 8.4;
export const MAX_PITCH = Math.PI * 0.49;

export const MAX_HEALTH = 100;
export type WeaponSlot = 1 | 2 | 3;
export const WEAPON_SLOT_RIFLE: WeaponSlot = 1;
export const WEAPON_SLOT_SNIPER: WeaponSlot = 2;
export const WEAPON_SLOT_SHOTGUN: WeaponSlot = 3;
export const RIFLE_DAMAGE = 10;
export const RIFLE_FIRE_INTERVAL_TICKS = 7;
export const RIFLE_RANGE = 80;
export const RIFLE_CLIP_SIZE = 10;
export const RIFLE_CARRY_CAPACITY = 40;
export const RIFLE_MAGAZINE = RIFLE_CARRY_CAPACITY;
export const SNIPER_DAMAGE = 75;
export const SNIPER_FIRE_INTERVAL_TICKS = SERVER_TICK_RATE * 2;
export const SHOTGUN_DAMAGE = 5;
export const SHOTGUN_PELLETS = 10;
export const SHOTGUN_FIRE_INTERVAL_TICKS = 24;
export const RESPAWN_DELAY_TICKS = 30;
export const MATCH_DURATION_TICKS = SERVER_TICK_RATE * 180;
export const HEALTH_REGEN_DELAY_TICKS = SERVER_TICK_RATE * 5;
export const HEALTH_REGEN_PER_SECOND = 3;

export const REMOTE_INTERPOLATION_DELAY_MS = 60;
export const MAX_REMOTE_BUFFER_MS = 400;
export const MAX_REMOTE_EXTRAPOLATION_MS = 100;
export const INPUT_STALE_TICKS = 4;
export const KILL_FEED_LIFETIME_MS = 10000;
export const HITMARKER_LIFETIME_MS = 180;
export const MUZZLE_FLASH_LIFETIME_MS = 50;
export const RECOIL_RECOVER_RATE = 16;

export const DEFAULT_ROOM_CODE = 'ARENA';

export const CAMERA_SENSITIVITY = 0.0021;

export const SCOREBOARD_KEY = 'Tab';
