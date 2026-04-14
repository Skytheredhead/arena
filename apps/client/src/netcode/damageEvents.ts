import type { DamageEvent } from '@arena/shared';

interface DamageEventRoomGate {
  roomCode: string;
  tick: number;
  trackedRoomCode: string | null;
  baselineTick: number | undefined;
}

export const shouldAcceptDamageEventForRoom = ({
  roomCode,
  tick,
  trackedRoomCode,
  baselineTick
}: DamageEventRoomGate): boolean => {
  if (!trackedRoomCode || roomCode !== trackedRoomCode) {
    return false;
  }
  if (baselineTick == null) {
    return false;
  }
  return tick > baselineTick;
};

export const isDamageEventCurrentForLocalPlayer = (
  event: DamageEvent,
  connectedRoomCode: string | null,
  localRespawnTick: number
): boolean => {
  if (connectedRoomCode && event.roomCode !== connectedRoomCode) {
    return false;
  }
  return event.tick >= localRespawnTick;
};
