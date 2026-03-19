import { create } from 'zustand';
import {
  CAMERA_SENSITIVITY,
  DEFAULT_ROOM_CODE,
  KILL_FEED_LIFETIME_MS,
  MAX_HEALTH,
  RIFLE_MAGAZINE,
  type KillFeedEntry,
  type LocalPlayerState,
  type MatchView,
  type PredictionDebugState,
  type AmmoPackView,
  type HealthPackView,
  type RemotePlayerState,
  type ScoreRow,
  makeDefaultLocalPlayer
} from '@arena/shared';
import {
  MAX_LOOK_SENSITIVITY,
  MAX_FOV,
  MIN_FOV,
  MIN_LOOK_SENSITIVITY,
  DEFAULT_FOV,
  type GraphicsQuality
} from '../types/settings';
import { generateDefaultCallsign } from '../utils/callsign';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RuntimePlayerMeta extends ScoreRow {
  roomCode: string | null;
}

export interface RoomView {
  code: string;
  playerCount: number;
  active: boolean;
}

interface SessionState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  nickname: string;
  roomCode: string;
  connectedRoomCode: string | null;
  localIdentity: string | null;
  localPlayer: LocalPlayerState;
  remotePlayers: Record<string, RemotePlayerState>;
  ammoPacks: Record<number, AmmoPackView>;
  healthPacks: Record<number, HealthPackView>;
  rooms: Record<string, RoomView>;
  players: Record<string, RuntimePlayerMeta>;
  match: MatchView | null;
  killFeed: KillFeedEntry[];
  predictionDebug: PredictionDebugState;
  rejectedShots: number;
  graphicsQuality: GraphicsQuality;
  lookSensitivity: number;
  fov: number;
  scoreboardOpen: boolean;
  crosshairSpread: number;
  scoped: boolean;
  hitmarkerUntil: number;
  muzzleFlashUntil: number;
  damageFlashToken: number;
  setConnection: (status: ConnectionStatus, error?: string | null) => void;
  setNickname: (nickname: string) => void;
  setRoomCode: (roomCode: string) => void;
  setConnectedRoomCode: (roomCode: string | null) => void;
  setLocalIdentity: (identity: string | null) => void;
  setLocalPlayer: (player: Partial<LocalPlayerState>) => void;
  resetRuntime: () => void;
  upsertPlayerMeta: (player: RuntimePlayerMeta) => void;
  upsertRemotePlayer: (player: RemotePlayerState) => void;
  removeRemotePlayer: (identity: string) => void;
  upsertRoom: (room: RoomView) => void;
  removeRoom: (code: string) => void;
  upsertAmmoPack: (pack: AmmoPackView) => void;
  removeAmmoPack: (id: number) => void;
  upsertHealthPack: (pack: HealthPackView) => void;
  removeHealthPack: (id: number) => void;
  clearAmmoPacksForRoom: (roomCode: string) => void;
  clearHealthPacksForRoom: (roomCode: string) => void;
  setMatch: (match: MatchView | null) => void;
  pushKillFeed: (entry: KillFeedEntry) => void;
  pruneKillFeed: (nowMs: number) => void;
  setPredictionDebug: (value: PredictionDebugState) => void;
  incrementRejectedShots: () => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setLookSensitivity: (value: number) => void;
  setFov: (value: number) => void;
  setScoreboardOpen: (open: boolean) => void;
  setCrosshairSpread: (spread: number) => void;
  setScoped: (scoped: boolean) => void;
  triggerHitmarker: (until: number) => void;
  triggerMuzzleFlash: (until: number) => void;
  triggerDamageFlash: () => void;
}

const initialLocal = makeDefaultLocalPlayer();
const initialPredictionDebug: PredictionDebugState = {
  lastAuthoritativeTick: 0,
  lastAckedSequence: 0,
  pendingInputs: 0,
  reconciliationCount: 0,
  lastCorrectionDistance: 0
};
const initialNickname = generateDefaultCallsign();

export const useGameStore = create<SessionState>(set => ({
  connectionStatus: 'disconnected',
  connectionError: null,
  nickname: initialNickname,
  roomCode: DEFAULT_ROOM_CODE,
  connectedRoomCode: null,
  localIdentity: null,
  localPlayer: initialLocal,
  remotePlayers: {},
  ammoPacks: {},
  healthPacks: {},
  rooms: {},
  players: {},
  match: null,
  killFeed: [],
  predictionDebug: initialPredictionDebug,
  rejectedShots: 0,
  graphicsQuality: 'medium',
  lookSensitivity: CAMERA_SENSITIVITY,
  fov: DEFAULT_FOV,
  scoreboardOpen: false,
  crosshairSpread: 0,
  scoped: false,
  hitmarkerUntil: 0,
  muzzleFlashUntil: 0,
  damageFlashToken: 0,
  setConnection: (connectionStatus, connectionError = null) =>
    set({ connectionStatus, connectionError }),
  setNickname: nickname => set({ nickname }),
  setRoomCode: roomCode => set({ roomCode }),
  setConnectedRoomCode: connectedRoomCode => set({ connectedRoomCode }),
  setLocalIdentity: localIdentity => set({ localIdentity }),
  setLocalPlayer: player =>
    set(state => ({
      localPlayer: {
        ...state.localPlayer,
        ...player,
        position: player.position ?? state.localPlayer.position,
        velocity: player.velocity ?? state.localPlayer.velocity
      }
    })),
  resetRuntime: () =>
    set({
      connectedRoomCode: null,
      localIdentity: null,
      localPlayer: {
        ...makeDefaultLocalPlayer(),
        health: MAX_HEALTH,
        ammo: RIFLE_MAGAZINE
      },
      remotePlayers: {},
      ammoPacks: {},
      healthPacks: {},
      players: {},
      match: null,
      killFeed: [],
      predictionDebug: initialPredictionDebug,
      rejectedShots: 0,
      scoreboardOpen: false,
      crosshairSpread: 0,
      scoped: false,
      hitmarkerUntil: 0,
      muzzleFlashUntil: 0,
      damageFlashToken: 0
    }),
  upsertPlayerMeta: player =>
    set(state => ({
      players: {
        ...state.players,
        [player.identity]: player
      }
    })),
  upsertRemotePlayer: player =>
    set(state => ({
      remotePlayers: {
        ...state.remotePlayers,
        [player.identity]: player
      }
    })),
  removeRemotePlayer: identity =>
    set(state => {
      const remotePlayers = { ...state.remotePlayers };
      delete remotePlayers[identity];
      return { remotePlayers };
    }),
  upsertRoom: room =>
    set(state => ({
      rooms: {
        ...state.rooms,
        [room.code]: room
      }
    })),
  removeRoom: code =>
    set(state => {
      const rooms = { ...state.rooms };
      delete rooms[code];
      return { rooms };
    }),
  upsertAmmoPack: pack =>
    set(state => ({
      ammoPacks: {
        ...state.ammoPacks,
        [pack.id]: pack
      }
    })),
  removeAmmoPack: id =>
    set(state => {
      if (!(id in state.ammoPacks)) {
        return state;
      }
      const ammoPacks = { ...state.ammoPacks };
      delete ammoPacks[id];
      return { ammoPacks };
    }),
  upsertHealthPack: pack =>
    set(state => ({
      healthPacks: {
        ...state.healthPacks,
        [pack.id]: pack
      }
    })),
  removeHealthPack: id =>
    set(state => {
      if (!(id in state.healthPacks)) {
        return state;
      }
      const healthPacks = { ...state.healthPacks };
      delete healthPacks[id];
      return { healthPacks };
    }),
  clearAmmoPacksForRoom: roomCode =>
    set(state => {
      const ammoPacks = { ...state.ammoPacks };
      for (const [id, pack] of Object.entries(ammoPacks)) {
        if (pack.roomCode === roomCode) {
          delete ammoPacks[Number(id)];
        }
      }
      return { ammoPacks };
    }),
  clearHealthPacksForRoom: roomCode =>
    set(state => {
      const healthPacks = { ...state.healthPacks };
      for (const [id, pack] of Object.entries(healthPacks)) {
        if (pack.roomCode === roomCode) {
          delete healthPacks[Number(id)];
        }
      }
      return { healthPacks };
    }),
  setMatch: match => set({ match }),
  pushKillFeed: entry =>
    set(state => {
      if (state.killFeed.some(existing => existing.id === entry.id)) {
        return state;
      }

      return {
        killFeed: [entry, ...state.killFeed].slice(0, 8)
      };
    }),
  pruneKillFeed: nowMs =>
    set(state => {
      if (state.killFeed.length === 0) {
        return state;
      }

      const killFeed = state.killFeed.filter(
        entry => nowMs - entry.tick < KILL_FEED_LIFETIME_MS
      );

      return killFeed.length === state.killFeed.length ? state : { killFeed };
    }),
  setPredictionDebug: predictionDebug => set({ predictionDebug }),
  incrementRejectedShots: () =>
    set(state => ({ rejectedShots: state.rejectedShots + 1 })),
  setGraphicsQuality: graphicsQuality =>
    set(state => (state.graphicsQuality === graphicsQuality ? state : { graphicsQuality })),
  setLookSensitivity: lookSensitivity =>
    set(state => {
      const clamped = Math.min(MAX_LOOK_SENSITIVITY, Math.max(MIN_LOOK_SENSITIVITY, lookSensitivity));
      return state.lookSensitivity === clamped ? state : { lookSensitivity: clamped };
    }),
  setFov: fov =>
    set(state => {
      const clamped = Math.min(MAX_FOV, Math.max(MIN_FOV, fov));
      return state.fov === clamped ? state : { fov: clamped };
    }),
  setScoreboardOpen: scoreboardOpen =>
    set(state => (state.scoreboardOpen === scoreboardOpen ? state : { scoreboardOpen })),
  setCrosshairSpread: crosshairSpread =>
    set(state =>
      state.crosshairSpread === crosshairSpread ? state : { crosshairSpread }
    ),
  setScoped: scoped => set(state => (state.scoped === scoped ? state : { scoped })),
  triggerHitmarker: hitmarkerUntil => set({ hitmarkerUntil }),
  triggerMuzzleFlash: muzzleFlashUntil => set({ muzzleFlashUntil }),
  triggerDamageFlash: () =>
    set(state => ({ damageFlashToken: state.damageFlashToken + 1 }))
}));
