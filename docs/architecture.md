# Arena FPS Vertical Slice Architecture

## Goals

This slice proves four things without overbuilding:

1. browser FPS movement feels sharp
2. authoritative multiplayer is the source of truth
3. rifle combat feels responsive enough for demo playtests
4. the codebase stays modular as we add more game rules

## Monorepo shape

- `apps/client`
  React/Vite shell, HUD/menu, Three.js runtime, input, prediction, interpolation, and SpacetimeDB client integration.
- `apps/server`
  Rust SpacetimeDB module with authoritative tables, reducers, a fixed server tick, room flow, health, deaths, respawns, and hitscan validation.
- `packages/shared`
  Shared TypeScript constants and local simulation helpers used by the browser client.
- `docs`
  Architecture notes and prioritized next tasks.

## Runtime boundaries

- `input/`
  Keyboard, mouse look, pointer lock, and score-tab state.
- `player/`
  Local prediction/reconciliation data and movement helpers.
- `netcode/`
  Connection bootstrapping, subscriptions, reducer calls, remote interpolation, and world hydration into the Zustand store.
- `rendering/`
  Raw Three.js scene lifecycle and render loop.
- `scene/`
  Arena mesh construction and low-poly visual layout.
- `weapons/`
  Rifle feel helpers: recoil, muzzle flash timer, hitmarker timer.
- `state/`
  UI/game session state in Zustand.
- `ui/`
  React menu and HUD components.

## Multiplayer model

- Server owns match state, health, deaths, respawns, cooldowns, and kill attribution.
- Clients submit input commands with sequence numbers instead of transform authority.
- The client retains unacknowledged input in a bounded retry buffer. Movement/look
  snapshots may be compacted, but action transitions keep their original order.
- Local movement is predicted immediately using the same movement envelope as the server.
- Server acks the latest processed sequence in `player_state.last_processed_input`.
- Client reconciles by rewinding to the authoritative player state and replaying pending inputs.
- Transient fire/reload intent is latched by the server until the authoritative
  weapon loop consumes it, so a newer movement snapshot cannot overwrite an action.
- Remote players are rendered from a server-timestamped interpolation buffer with a small render delay.

## Authoritative tick

- The server runs simulation at `60Hz` (`16.67ms` per tick).
- A single `sim_tick_schedule` row is inserted at init with `ScheduleAt::Interval(...)`, so SpacetimeDB drives `sim_tick` on a recurring cadence rather than relying on client traffic.
- `sim_tick` increments the authoritative world tick, advances matches, and applies
  the latest accepted input for each player. Changed player state is published
  immediately; idle players receive a lower-rate heartbeat to reduce table fanout.
- The browser converts `player_state.server_tick` into `serverTimeMs` and uses that for reconciliation timing and remote interpolation.
- Pickup contact is tested against the exact authoritative movement segment for
  the current tick, with deterministic nearest-player arbitration.

## Authority compromises kept explicit

- Checked-in client bindings are generated from the Rust module with
  `pnpm generate:bindings` and include private schema used by the input pipeline.
- Static arena collision data is duplicated in Rust for now. That is intentional for the slice; a later content pipeline should generate both client and server map definitions from the same source asset.
- Hitscan is authoritative and applies a bounded velocity-based rewind estimate.
  A future upgrade can replace that estimate with buffered historical hitboxes
  keyed by server tick for exact per-shot rewind.
