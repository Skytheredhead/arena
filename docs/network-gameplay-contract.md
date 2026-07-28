# Network and gameplay contract

This contract treats every browser value as untrusted. The SpacetimeDB module
accepts intent, advances the world on a fixed schedule, and publishes the
result through minimal anonymous or caller-scoped views.

## Input envelope

`submit_input` contains:

| Field              | Wire type    | Validation and meaning                                               |
| ------------------ | ------------ | -------------------------------------------------------------------- |
| `seq`              | `u32`        | Monotonic input sequence using half-range wrap-safe ordering         |
| `client_tick`      | `u64`        | Shot-time hint only; never grants position or time authority         |
| `move_x`, `move_z` | finite `f32` | Each clamped to `[-1, 1]`; the combined direction is normalized      |
| `yaw`              | finite `f32` | Normalized by the server                                             |
| `pitch`            | finite `f32` | Clamped to the server's view range                                   |
| `buttons`          | `u16`        | Masked vocabulary: movement, jump, sprint, held fire, and held scope |
| `desired_weapon`   | `u8`         | One of slots 1, 2, or 3                                              |
| `fire_counter`     | `u32`        | Cumulative transient fire edges                                      |
| `reload_counter`   | `u32`        | Cumulative transient reload edges                                    |
| `respawn_counter`  | `u32`        | Cumulative transient respawn edges                                   |

The sender identity must own a connected, non-bot player session. Unknown
button bits, non-finite numbers, invalid weapon slots, unauthorized sessions,
and excessive request rates are rejected.

## Sequence and action ordering

All `u32` ordering uses serial-number arithmetic: `candidate` is newer than
`previous` only when their wrapping difference is non-zero and less than
`2^31`. This accepts `0` after `4,294,967,295` and rejects stale or ambiguous
half-range values.

Movement, look, and desired weapon are latest-state data. Fire, reload, and
respawn are cumulative action edges that must survive packet loss:

1. The client increments cumulative wrap-safe counters.
2. The newest packet carries the current counter values.
3. A successful reducer invocation is not itself an acknowledgement.
4. The client retains history until the authoritative player row advances its
   accepted sequence and counters.
5. The server processes only the forward counter delta and caps one accepted
   advance at 8 actions.
6. A claimed advance larger than the resend window is rejected rather than
   replayed.

The browser history is bounded at 256 packets. Retry starts at 34 ms and backs
off to at most 750 ms after transport failures. Compaction first discards
superseded movement/look frames. If an interruption outlives the prediction
window, it may discard the oldest frames because the newest packet still
carries the cumulative counters. The client separately bounds queued action
edges at 32 and records attempted overflow as `droppedActionEdges`; release
instrumentation and fault tests must treat a non-zero value as transport
degradation, never as an authoritative action.

The server limits input reducers to 240 per second per identity. This is a
safety ceiling, not a client send target.

## Published view boundary

The module's dynamic authoritative base tables are private. A browser
subscription is limited to:

| Surface                | Scope                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| `server_config`        | Static public simulation/map contract and account-registration gate     |
| `open_rooms`           | Anonymous room-browser summary with only ID, code, phase, round, counts |
| `my_room_state`        | Caller room only                                                        |
| `my_room_players`      | Caller room players; private acknowledgement counters only on self      |
| `my_weapon_states`     | Caller player weapons only                                              |
| `my_room_pickups`      | Caller room pickups only                                                |
| `my_room_match_events` | Caller room match events only                                           |
| `my_room_chat_events`  | Caller room chat events only                                            |
| `my_account_session`   | Caller account-session result only                                      |
| `my_account_stats`     | Caller authenticated account statistics only                            |
| `my_action_result`     | Caller latest room/input/chat reducer outcome only                      |

`open_rooms` deliberately excludes `server_tick`, `match_tick`, transforms,
health, inventory, player identity, and event bodies, so browsing rooms does
not subscribe every anonymous client to gameplay state. Gameplay views return
no rows until the sender owns an eligible player session. A committed
`my_action_result` failure for a room or chat request is surfaced to the UI;
an input failure remains a transport/gameplay diagnostic and is not displayed
as a stale room or chat error.

`server_config.accounts_enabled` is necessary but not sufficient for browser
account actions. The client also requires the exact trusted production endpoint
and database. A custom/fallback scope remains guest-only even if its server
publishes a true flag.

## Fixed simulation and reconciliation

- Server tick rate: 60 Hz.
- The browser samples intent for prediction at the gameplay tick rate.
- Local prediction uses shared collision geometry and movement constants.
- Every authoritative local snapshot acknowledges an input sequence.
- Reconciliation restores the authoritative state and replays only newer
  retained inputs.
- Large error or teleport/life changes snap immediately; small error is
  visually smoothed.
- Remote players use a buffered snapshot timeline. They are not extrapolated
  indefinitely through a network outage.
- The renderer consumes the latest predicted/interpolated transforms directly.
  React receives only presentation-rate snapshots.

Prediction never changes authoritative health, ammo, match state, pickups,
kills, deaths, or statistics.

## Bounded lag compensation

The server stores a bounded authoritative position history and resolves a shot
against server-observed history:

- Maximum rewind: 12 server ticks, or 200 ms at 60 Hz.
- A future claimed tick is clamped to the current server tick.
- An older claimed tick is clamped to `server_tick - 12`.
- The server chooses the shooter origin from authoritative state, applies the
  server weapon cadence/spread seed, tests authoritative map occlusion, and
  resolves eligible target history.
- The client cannot provide a ray origin, target identity, target position,
  damage, or arbitrary historical transform.
- Spawn protection, alive state, room membership, weapon range, falloff, and
  obstruction are evaluated server-side.

The lag history ring may be longer than the legal rewind window for safe lookup
and rollover, but that does not expand the 12-tick compensation bound.

## Reconnect lifecycle

The browser stores only the SpacetimeDB identity token in `sessionStorage`
under an endpoint-and-database-scoped
`arena.spacetimedb.token.v3:<encoded-endpoint>:<encoded-database>` key. It does
not store account passwords. Persistent `localStorage` copies of legacy Arena
token keys are removed. Migration of a session-scoped v2 token is allowed only
for the exact production endpoint and `arena-fps-slice`, never for a custom
backend.

On transport loss:

1. Input transmission stops and the latest unacknowledged cumulative actions
   remain bounded in memory.
2. Reconnect attempts use exponential backoff beginning near 300 ms, capped at
   8 seconds, with jitter.
3. The server converts the disconnected combatant to a bot so the room remains
   at 12 active combatants and reserves that player row for 1,200 ticks
   (20 seconds).
4. Reconnection with the same identity during the grace window reclaims the
   reserved row and its server state.
5. After the grace window, the slot is an ordinary bot slot; the client must
   join again and must not replay stale inputs into a new life/session.

Reconnect UI must show an explicit state and terminal failure. Pointer lock is
re-requested only after a user gesture.

## Sanitization and rate limits

The Rust module is the final validator:

| Action                 | Current limit                  |
| ---------------------- | ------------------------------ |
| Input                  | 240 per second per identity    |
| Chat                   | 8 per 10 seconds per identity  |
| Room actions           | 12 per 10 seconds per identity |
| Authentication actions | 8 per minute per identity      |

Room creation also has a 12-per-minute global budget. Registration/login has a
30-attempts-per-minute global budget, and five failed logins place that account
under a five-minute server lockout. These controls reduce load and
credential-guessing risk, but they do not verify email ownership or make
client-minted Spacetime identities abuse resistant.

Nicknames are 3–16 server-accepted characters after filtering and whitespace
collapse. Room codes are 3–12 uppercase letters, numbers, or hyphens. Chat
removes control/markup delimiter characters, collapses whitespace, rejects
empty messages, and caps the accepted length. UI escaping remains mandatory
even after server sanitization.

Unrestricted public password registration is a release gate. Use
OIDC/verified email or an abuse-resistant registration gateway with Turnstile
or equivalent bot/risk enforcement; otherwise keep
`server_config.accounts_enabled` false while retaining guest quick play.

## Protocol change checklist

A change to a reducer argument, public table/view, counter, map hash, weapon
slot, or tick rule requires all of:

- Rust module update and tests;
- regenerated TypeScript bindings;
- client adapter and prediction update;
- reconnect/rollover regression coverage;
- `pnpm check`;
- a coordinated module/frontend cutover if the schema breaks deployed
  clients.
