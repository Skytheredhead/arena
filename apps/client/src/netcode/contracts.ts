export type WeaponSlot = 1 | 2 | 3;
export type QualityPreset = 'low' | 'medium' | 'high';

export const WEAPON_SLOT_RIFLE: WeaponSlot = 1;
export const WEAPON_SLOT_SNIPER: WeaponSlot = 2;
export const WEAPON_SLOT_SHOTGUN: WeaponSlot = 3;

export const INPUT_BUTTON_FORWARD = 1 << 0;
export const INPUT_BUTTON_BACK = 1 << 1;
export const INPUT_BUTTON_LEFT = 1 << 2;
export const INPUT_BUTTON_RIGHT = 1 << 3;
export const INPUT_BUTTON_JUMP = 1 << 4;
export const INPUT_BUTTON_SPRINT = 1 << 5;
export const INPUT_BUTTON_FIRE = 1 << 6;
export const INPUT_BUTTON_SCOPE = 1 << 7;
export const INPUT_BUTTON_MASK =
  INPUT_BUTTON_FORWARD |
  INPUT_BUTTON_BACK |
  INPUT_BUTTON_LEFT |
  INPUT_BUTTON_RIGHT |
  INPUT_BUTTON_JUMP |
  INPUT_BUTTON_SPRINT |
  INPUT_BUTTON_FIRE |
  INPUT_BUTTON_SCOPE;

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Structural equivalent of the authoritative submit_input reducer arguments.
 * Generated bindings can consume this without being imported into the runtime.
 */
export interface SubmitInputPacket {
  seq: number;
  clientTick: bigint;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  buttons: number;
  desiredWeapon: WeaponSlot;
  fireCounter: number;
  reloadCounter: number;
  respawnCounter: number;
}

export interface AuthoritativePlayerSnapshot {
  id: string;
  roomId: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  position: Vector3Like;
  velocity: Vector3Like;
  yaw: number;
  pitch: number;
  health: number;
  alive: boolean;
  protectedUntilTick: number;
  respawnAtTick: number;
  kills: number;
  deaths: number;
  selectedWeapon: WeaponSlot;
  serverTick: number;
  ackInputSeq: number;
  ackFireCounter: number;
  ackReloadCounter: number;
  ackRespawnCounter: number;
  lifeId: number;
}

export interface WeaponSnapshot {
  playerId: string;
  slot: WeaponSlot;
  loadedAmmo: number;
  reserveAmmo: number;
  clipCapacity: number;
  reloadStartedTick: number | null;
  reloadEndsTick: number | null;
  nextFireTick: number;
  shotCounter: number;
}

export interface PickupSnapshot {
  id: string;
  kind: 'health' | 'ammo';
  position: Vector3Like;
  active: boolean;
  respawnAtTick: number | null;
}

export interface RoomRuntimeSnapshot {
  id: string;
  code: string;
  phase: 'warmup' | 'active' | 'results' | 'intermission';
  round: number;
  serverTick: number;
  matchTick: number;
  intermissionEndsTick: number;
  killLimit: number;
  winnerPlayerId: string | null;
}

export interface ScoreboardEntry {
  playerId: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  kills: number;
  deaths: number;
  pingMs: number | null;
}

export interface CombatRuntimeEvent {
  id: string;
  roomId: string;
  serverTick: number;
  kind:
    | 'shot'
    | 'impact'
    | 'damage'
    | 'kill'
    | 'respawn'
    | 'pickup'
    | 'chat'
    | 'match-ended'
    | 'match-reset';
  actorId?: string;
  targetId?: string;
  weapon?: WeaponSlot;
  position?: Vector3Like;
  normal?: Vector3Like;
  amount?: number;
  nickname?: string;
  message?: string;
  headshot?: boolean;
}

export type ArenaTransportEvent =
  | {
      type: 'connection';
      status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
      attempt: number;
      error: string | null;
    }
  | { type: 'local-player'; snapshot: AuthoritativePlayerSnapshot }
  | { type: 'local-player-cleared' }
  | { type: 'remote-player'; snapshot: AuthoritativePlayerSnapshot }
  | { type: 'player-removed'; playerId: string }
  | { type: 'weapon'; snapshot: WeaponSnapshot }
  | { type: 'pickup'; snapshot: PickupSnapshot }
  | { type: 'room'; snapshot: RoomRuntimeSnapshot }
  | { type: 'scoreboard'; entries: ScoreboardEntry[] }
  | { type: 'combat'; event: CombatRuntimeEvent }
  | {
      type: 'latency';
      pingMs: number;
      jitterMs: number;
      lowMs: number;
      serverPipelineMs: number | null;
    };

export interface ArenaTransport {
  readonly connected: boolean;
  sendInput(packet: SubmitInputPacket): Promise<void>;
  subscribe(listener: (event: ArenaTransportEvent) => void): () => void;
}

export interface InputIntent {
  clientTick: bigint;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  buttons: number;
  desiredWeapon: WeaponSlot;
}

export interface ActionEdges {
  fire: number;
  reload: number;
  respawn: number;
  weaponChanged: boolean;
}

export interface RuntimeSettings {
  quality: QualityPreset;
  sensitivity: number;
  fov: number;
  sfxVolume: number;
  musicVolume: number;
}
