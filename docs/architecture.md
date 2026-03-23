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
- Local movement is predicted immediately using the same movement envelope as the server.
- Server acks the latest processed sequence in `player_state.last_processed_input`.
- Client reconciles by rewinding to the authoritative player state and replaying pending inputs.
- Remote players are rendered from a server-timestamped interpolation buffer with a small render delay.

## Authoritative tick

- The server runs simulation at `60Hz` (`16.67ms` per tick).
- A single `sim_tick_schedule` row is inserted at init with `ScheduleAt::Interval(...)`, so SpacetimeDB drives `sim_tick` on a recurring cadence rather than relying on client traffic.
- `sim_tick` increments the authoritative world tick, advances matches, applies the latest accepted input for each player, and writes `player_state.server_tick`.
- The browser converts `player_state.server_tick` into `serverTimeMs` and uses that for reconciliation timing and remote interpolation.

## Authority compromises kept explicit

- The checked-in client bindings are a generated-compatible hand-authored file because the local environment does not have the `spacetime` CLI installed. The repo scripts are set up so `pnpm generate:bindings` can overwrite them with official codegen later.
- Static arena collision data is duplicated in Rust for now. That is intentional for the slice; a later content pipeline should generate both client and server map definitions from the same source asset.
- Hitscan is authoritative, but lag compensation is not implemented yet. The server resolves shots against the latest authoritative player states plus arena blockers. The next upgrade is per-shot rewind using buffered historical hitboxes keyed by server tick.
