export type ConnectionStage =
  | 'idle'
  | 'preparing'
  | 'opening_socket'
  | 'authenticating'
  | 'subscribing'
  | 'joining_room'
  | 'waiting_for_player'
  | 'ready';

export const CONNECTION_STAGE_SEQUENCE: ConnectionStage[] = [
  'preparing',
  'opening_socket',
  'authenticating',
  'subscribing',
  'joining_room',
  'waiting_for_player',
  'ready'
];

export const CONNECTION_STAGE_LABEL: Record<ConnectionStage, string> = {
  idle: 'IDLE',
  preparing: 'PREPARING SESSION',
  opening_socket: 'OPENING SOCKET',
  authenticating: 'AUTHENTICATING OPERATOR',
  subscribing: 'SUBSCRIBING TO WORLD STATE',
  joining_room: 'JOINING ARENA',
  waiting_for_player: 'WAITING FOR PLAYER SYNC',
  ready: 'ENTERING MATCH'
};

export const CONNECTION_STAGE_DETAIL: Record<ConnectionStage, string> = {
  idle: 'Standing by.',
  preparing: 'Validating room details and warming the runtime.',
  opening_socket: 'Contacting the backend and negotiating a live connection.',
  authenticating: 'Restoring your account session with the backend.',
  subscribing: 'Subscribing to room, player, match, and world state tables.',
  joining_room: 'Creating or joining the requested room on the backend.',
  waiting_for_player: 'Waiting for the first authoritative local player snapshot.',
  ready: 'Authoritative state is in. Handing off to the match.'
};

export const getConnectionStageIndex = (stage: ConnectionStage): number => {
  if (stage === 'idle') {
    return 0;
  }
  const index = CONNECTION_STAGE_SEQUENCE.indexOf(stage);
  return index >= 0 ? index : 0;
};
