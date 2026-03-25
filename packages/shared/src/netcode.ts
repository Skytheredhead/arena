import { MAX_HEALTH, RIFLE_MAGAZINE } from './gameplay';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface InputCommand {
  sequence: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jumping: boolean;
  sprinting: boolean;
}

export interface LocalPlayerState {
  identity: string;
  position: Vec3;
  velocity: Vec3;
  serverTick: number;
  serverTimeMs: number;
  inputPipelineMs: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  alive: boolean;
  health: number;
  ammo: number;
  lastProcessedInput: number;
  respawnTick: number;
}

export interface RemotePlayerState {
  identity: string;
  nickname: string;
  position: Vec3;
  velocity: Vec3;
  serverTick: number;
  serverTimeMs: number;
  yaw: number;
  pitch: number;
  alive: boolean;
  health: number;
  kills: number;
  deaths: number;
  roomCode: string | null;
}

export interface AmmoPackView {
  id: number;
  roomCode: string;
  position: Vec3;
  active: boolean;
  respawnTick: number;
}

export interface HealthPackView {
  id: number;
  roomCode: string;
  position: Vec3;
  active: boolean;
  respawnTick: number;
}

export interface ImpactMarkView {
  id: number;
  roomCode: string;
  position: Vec3;
  normal: Vec3;
  tick: number;
}

export interface ScoreRow {
  identity: string;
  nickname: string;
  kills: number;
  deaths: number;
  connected: boolean;
}

export interface RoomView {
  code: string;
  playerCount: number;
  active: boolean;
}

export interface KillFeedEntry {
  id: number;
  kind: 'kill' | 'chat';
  senderNickname: string;
  message: string;
  tick: number;
}

export interface DamageEvent {
  id: number;
  attackerIdentity: string;
  victimIdentity: string;
  amount: number;
  tick: number;
  causedDeath: boolean;
}

export interface MatchView {
  roomCode: string;
  active: boolean;
  tick: number;
  remainingMs: number;
  round: number;
}

export interface PredictionDebugState {
  lastAuthoritativeTick: number;
  lastAckedSequence: number;
  pendingInputs: number;
  reconciliationCount: number;
  lastCorrectionDistance: number;
}

export const makeDefaultLocalPlayer = (): LocalPlayerState => ({
  identity: '',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  serverTick: 0,
  serverTimeMs: 0,
  inputPipelineMs: 0,
  yaw: 0,
  pitch: 0,
  onGround: true,
  alive: true,
  health: MAX_HEALTH,
  ammo: RIFLE_MAGAZINE,
  lastProcessedInput: 0,
  respawnTick: 0
});
