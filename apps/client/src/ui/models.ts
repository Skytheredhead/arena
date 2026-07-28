export type GraphicsQuality = 'low' | 'medium' | 'high';
export type BackendTarget = 'current' | 'arenaapi2' | 'custom';
export type WeaponSlot = 1 | 2 | 3;

export const CAMERA_SENSITIVITY = 0.0021;
export const MIN_LOOK_SENSITIVITY = 0.0008;
export const MAX_LOOK_SENSITIVITY = 0.0042;
export const MIN_FOV = 55;
export const MAX_FOV = 110;
export const ROOM_CAPACITY = 12;
export const RIFLE_CLIP_SIZE = 30;
export const SNIPER_CLIP_SIZE = 5;
export const SHOTGUN_CLIP_SIZE = 8;
export const WEAPON_SLOT_RIFLE: WeaponSlot = 1;
export const WEAPON_SLOT_SNIPER: WeaponSlot = 2;
export const WEAPON_SLOT_SHOTGUN: WeaponSlot = 3;
export const SERVER_TICK_RATE = 60;

export interface RoomView {
  code: string;
  playerCount: number;
  botCount: number;
  capacity: number;
  active: boolean;
  phase: 'waiting' | 'playing' | 'intermission';
}

export interface ScoreRow {
  identity: string;
  nickname: string;
  kills: number;
  deaths: number;
  connected: boolean;
  isBot: boolean;
}

export interface KillFeedEntry {
  id: number;
  kind: 'kill' | 'chat';
  senderNickname: string;
  message: string;
  tick: number;
}

export interface MatchView {
  roomCode: string;
  active: boolean;
  tick: number;
  remainingMs: number;
  round: number;
  phase: 'waiting' | 'playing' | 'intermission';
  winnerNickname: string | null;
}

export interface AccountStatsView {
  accountId: number;
  username: string;
  timesPlayed: number;
  totalPlayTimeTicks: number;
  totalLobbyTimeTicks: number;
  kills: number;
  deaths: number;
  kdr: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  ammoCollected: number;
  healthCollected: number;
  chatMessages: number;
  roomsCreated: number;
  roomsJoined: number;
  matchesStarted: number;
  respawns: number;
  lastSeenTick: number;
}

export const normalizeRoomCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12);
