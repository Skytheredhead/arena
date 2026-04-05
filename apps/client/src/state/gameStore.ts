import { create } from 'zustand';
import {
  CAMERA_SENSITIVITY,
  DEFAULT_ROOM_CODE,
  KILL_FEED_LIFETIME_MS,
  MAX_HEALTH,
  RIFLE_CLIP_SIZE,
  RIFLE_CARRY_CAPACITY,
  RIFLE_MAGAZINE,
  WEAPON_SLOT_RIFLE,
  type WeaponSlot,
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
import { sanitizeLocalPlayerPatch } from './sanitizeLocalPlayerPatch';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RuntimePlayerMeta extends ScoreRow {
  roomCode: string | null;
}

export interface ServerPingSample {
  atMs: number;
  source: 'lobby' | 'ingame';
  pingMs: number;
  pipelineMs: number;
}

export interface RoomView {
  code: string;
  playerCount: number;
  active: boolean;
}

interface SessionState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  networkReconnecting: boolean;
  networkReconnectAttempt: number;
  networkReconnectStartedAtMs: number | null;
  nickname: string;
  roomCode: string;
  connectedRoomCode: string | null;
  localIdentity: string | null;
  localPlayer: LocalPlayerState;
  magAmmo: number;
  reserveAmmo: number;
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
  sfxVolume: number;
  musicVolume: number;
  localPingMs: number | null;
  localPingLowMs: number | null;
  localPingJitterMs: number | null;
  serverPipelineMs: number | null;
  serverPipelineLowMs: number | null;
  serverPingHistory: ServerPingSample[];
  nerdPingsEnabled: boolean;
  playerPings: Record<string, number | null>;
  scoreboardOpen: boolean;
  crosshairSpread: number;
  scoped: boolean;
  hitmarkerUntil: number;
  muzzleFlashUntil: number;
  damageFlashToken: number;
  selectedWeaponSlot: WeaponSlot;
  sniperCooldownRemainingMs: number;
  setConnection: (status: ConnectionStatus, error?: string | null) => void;
  setNetworkReconnectState: (
    reconnecting: boolean,
    attempt: number,
    startedAtMs: number | null
  ) => void;
  setNickname: (nickname: string) => void;
  setRoomCode: (roomCode: string) => void;
  setConnectedRoomCode: (roomCode: string | null) => void;
  setLocalIdentity: (identity: string | null) => void;
  setLocalPlayer: (player: Partial<LocalPlayerState>) => void;
  setDisplayedAmmo: (magAmmo: number, reserveAmmo: number) => void;
  resetRuntime: () => void;
  upsertPlayerMeta: (player: RuntimePlayerMeta) => void;
  upsertRemotePlayer: (player: RemotePlayerState) => void;
  removeRemotePlayer: (identity: string) => void;
  upsertRoom: (room: RoomView) => void;
  setRoomDirectory: (rooms: RoomView[]) => void;
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
  setSfxVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setLocalPing: (pingMs: number | null) => void;
  setLocalPingLow: (pingMs: number | null) => void;
  setLocalPingJitter: (jitterMs: number | null) => void;
  setServerPipeline: (pipelineMs: number | null) => void;
  setServerPipelineLow: (pipelineMs: number | null) => void;
  pushServerPingSample: (sample: ServerPingSample) => void;
  setNerdPingsEnabled: (enabled: boolean) => void;
  setPlayerPing: (identity: string, pingMs: number | null) => void;
  consumeNearestAmmoPack: (
    roomCode: string | null,
    position: { x: number; y: number; z: number },
    radius: number
  ) => void;
  setScoreboardOpen: (open: boolean) => void;
  setCrosshairSpread: (spread: number) => void;
  setScoped: (scoped: boolean) => void;
  triggerHitmarker: (until: number) => void;
  triggerMuzzleFlash: (until: number) => void;
  triggerDamageFlash: () => void;
  setSelectedWeaponSlot: (slot: WeaponSlot) => void;
  setSniperCooldownRemainingMs: (value: number) => void;
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
  networkReconnecting: false,
  networkReconnectAttempt: 0,
  networkReconnectStartedAtMs: null,
  nickname: initialNickname,
  roomCode: DEFAULT_ROOM_CODE,
  connectedRoomCode: null,
  localIdentity: null,
  localPlayer: initialLocal,
  magAmmo: RIFLE_CLIP_SIZE,
  reserveAmmo: RIFLE_CARRY_CAPACITY - RIFLE_CLIP_SIZE,
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
  sfxVolume: 0.85,
  musicVolume: 0.35,
  localPingMs: null,
  localPingLowMs: null,
  localPingJitterMs: null,
  serverPipelineMs: null,
  serverPipelineLowMs: null,
  serverPingHistory: [],
  nerdPingsEnabled: false,
  playerPings: {},
  scoreboardOpen: false,
  crosshairSpread: 0,
  scoped: false,
  hitmarkerUntil: 0,
  muzzleFlashUntil: 0,
  damageFlashToken: 0,
  selectedWeaponSlot: WEAPON_SLOT_RIFLE,
  sniperCooldownRemainingMs: 0,
  setConnection: (connectionStatus, connectionError = null) =>
    set({ connectionStatus, connectionError }),
  setNetworkReconnectState: (networkReconnecting, networkReconnectAttempt, networkReconnectStartedAtMs) =>
    set(state => {
      if (
        state.networkReconnecting === networkReconnecting &&
        state.networkReconnectAttempt === networkReconnectAttempt &&
        state.networkReconnectStartedAtMs === networkReconnectStartedAtMs
      ) {
        return state;
      }
      return { networkReconnecting, networkReconnectAttempt, networkReconnectStartedAtMs };
    }),
  setNickname: nickname => set({ nickname }),
  setRoomCode: roomCode => set({ roomCode }),
  setConnectedRoomCode: connectedRoomCode => set({ connectedRoomCode }),
  setLocalIdentity: localIdentity => set({ localIdentity }),
  setLocalPlayer: player =>
    set(state => {
      const sanitized = sanitizeLocalPlayerPatch(player, state.localPlayer);
      const nextAmmo =
        sanitized.ammo === undefined
          ? state.localPlayer.ammo
          : Math.max(0, Math.min(RIFLE_MAGAZINE, Math.round(sanitized.ammo)));
      return {
        localPlayer: {
          ...state.localPlayer,
          ...sanitized,
          ammo: nextAmmo,
          position: sanitized.position ?? { ...state.localPlayer.position },
          velocity: sanitized.velocity ?? { ...state.localPlayer.velocity }
        }
      };
    }),
  setDisplayedAmmo: (magAmmo, reserveAmmo) =>
    set(state => {
      const safeMag = Math.max(0, Math.min(RIFLE_CLIP_SIZE, Math.round(magAmmo)));
      const safeReserve = Math.max(
        0,
        Math.min(RIFLE_CARRY_CAPACITY - safeMag, Math.round(reserveAmmo))
      );
      if (state.magAmmo === safeMag && state.reserveAmmo === safeReserve) {
        return state;
      }
      return {
        magAmmo: safeMag,
        reserveAmmo: safeReserve
      };
    }),
  resetRuntime: () =>
    set({
      connectedRoomCode: null,
      localIdentity: null,
      localPlayer: {
        ...makeDefaultLocalPlayer(),
        health: MAX_HEALTH,
        ammo: RIFLE_MAGAZINE
      },
      magAmmo: RIFLE_CLIP_SIZE,
      reserveAmmo: RIFLE_CARRY_CAPACITY - RIFLE_CLIP_SIZE,
      remotePlayers: {},
      ammoPacks: {},
      healthPacks: {},
      players: {},
      rooms: {},
      match: null,
      killFeed: [],
      predictionDebug: initialPredictionDebug,
      rejectedShots: 0,
      networkReconnecting: false,
      networkReconnectAttempt: 0,
      networkReconnectStartedAtMs: null,
      localPingMs: null,
      localPingLowMs: null,
      localPingJitterMs: null,
      serverPipelineMs: null,
      serverPipelineLowMs: null,
      serverPingHistory: [],
      playerPings: {},
      scoreboardOpen: false,
      crosshairSpread: 0,
      scoped: false,
      hitmarkerUntil: 0,
      muzzleFlashUntil: 0,
      damageFlashToken: 0,
      selectedWeaponSlot: WEAPON_SLOT_RIFLE,
      sniperCooldownRemainingMs: 0
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
      const playerPings = { ...state.playerPings };
      delete playerPings[identity];
      return { remotePlayers, playerPings };
    }),
  upsertRoom: room =>
    set(state => ({
      rooms: {
        ...state.rooms,
        [room.code]: room
      }
    })),
  setRoomDirectory: rooms =>
    set(() => {
      const nextRooms: Record<string, RoomView> = {};
      for (const room of rooms) {
        nextRooms[room.code] = room;
      }
      return { rooms: nextRooms };
    }),
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
  setMatch: match =>
    set(state => {
      const previous = state.match;
      if (previous === match) {
        return state;
      }
      if (!previous || !match) {
        return { match };
      }
      if (
        previous.roomCode === match.roomCode &&
        previous.active === match.active &&
        previous.tick === match.tick &&
        previous.remainingMs === match.remainingMs &&
        previous.round === match.round
      ) {
        return state;
      }
      return { match };
    }),
  pushKillFeed: entry =>
    set(state => {
      if (state.killFeed.some(existing => existing.id === entry.id)) {
        return state;
      }

      return {
        killFeed: [...state.killFeed, entry].slice(-8)
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
  setSfxVolume: sfxVolume =>
    set(state => {
      const clamped = Math.max(0, Math.min(1, sfxVolume));
      return state.sfxVolume === clamped ? state : { sfxVolume: clamped };
    }),
  setMusicVolume: musicVolume =>
    set(state => {
      const clamped = Math.max(0, Math.min(1, musicVolume));
      return state.musicVolume === clamped ? state : { musicVolume: clamped };
    }),
  setLocalPing: localPingMs =>
    set(state => {
      if (state.localPingMs === localPingMs) {
        return state;
      }
      return { localPingMs };
    }),
  setLocalPingLow: localPingLowMs =>
    set(state => {
      if (state.localPingLowMs === localPingLowMs) {
        return state;
      }
      return { localPingLowMs };
    }),
  setLocalPingJitter: localPingJitterMs =>
    set(state => {
      if (state.localPingJitterMs === localPingJitterMs) {
        return state;
      }
      return { localPingJitterMs };
    }),
  setServerPipeline: serverPipelineMs =>
    set(state => {
      if (state.serverPipelineMs === serverPipelineMs) {
        return state;
      }
      return { serverPipelineMs };
    }),
  setServerPipelineLow: serverPipelineLowMs =>
    set(state => {
      if (state.serverPipelineLowMs === serverPipelineLowMs) {
        return state;
      }
      return { serverPipelineLowMs };
    }),
  pushServerPingSample: sample =>
    set(state => ({
      serverPingHistory: [...state.serverPingHistory, sample].slice(-100)
    })),
  setNerdPingsEnabled: nerdPingsEnabled =>
    set(state => (state.nerdPingsEnabled === nerdPingsEnabled ? state : { nerdPingsEnabled })),
  setPlayerPing: (identity, pingMs) =>
    set(state => {
      if (state.playerPings[identity] === pingMs) {
        return state;
      }
      return {
        playerPings: {
          ...state.playerPings,
          [identity]: pingMs
        }
      };
    }),
  consumeNearestAmmoPack: (roomCode, position, radius) =>
    set(state => {
      if (!roomCode) {
        return state;
      }
      let nearestId: number | null = null;
      let nearestDistanceSq = Number.POSITIVE_INFINITY;
      const radiusSq = radius * radius;
      for (const pack of Object.values(state.ammoPacks)) {
        if (!pack.active || pack.roomCode !== roomCode) {
          continue;
        }
        const dx = pack.position.x - position.x;
        const dy = pack.position.y - position.y;
        const dz = pack.position.z - position.z;
        const distanceSq = dx * dx + dz * dz + dy * dy * 0.35;
        if (distanceSq > radiusSq || distanceSq >= nearestDistanceSq) {
          continue;
        }
        nearestDistanceSq = distanceSq;
        nearestId = pack.id;
      }
      if (nearestId == null) {
        return state;
      }

      const ammoPacks = { ...state.ammoPacks };
      const targetPack = ammoPacks[nearestId];
      if (!targetPack) {
        return state;
      }
      ammoPacks[nearestId] = {
        ...targetPack,
        active: false
      };
      return { ammoPacks };
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
    set(state => ({ damageFlashToken: state.damageFlashToken + 1 })),
  setSelectedWeaponSlot: selectedWeaponSlot =>
    set(state =>
      state.selectedWeaponSlot === selectedWeaponSlot
        ? state
        : { selectedWeaponSlot }
    ),
  setSniperCooldownRemainingMs: sniperCooldownRemainingMs =>
    set(state => {
      const clamped = Math.max(0, sniperCooldownRemainingMs);
      if (Math.abs(state.sniperCooldownRemainingMs - clamped) < 1) {
        return state;
      }
      return { sniperCooldownRemainingMs: clamped };
    })
}));
