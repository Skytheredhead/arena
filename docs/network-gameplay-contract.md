# Network gameplay contract

The authoritative server owns position, health, inventory, cooldowns, pickup
activation, and damage. The client predicts only reversible presentation state
and reconciles from acknowledged input sequences.

## Required invariants

- Input sequences and server ticks are unsigned 32-bit serial numbers. Compare
  them with half-range serial arithmetic, never plain `>`/`<` comparisons.
- Sanitize every command before local prediction and again at the server trust
  boundary. Movement axes are `[-1, 1]`; pitch is bounded; non-finite numbers
  never enter simulation.
- Coalescing may replace continuous movement/look with the newest sample, but it
  must preserve edge intent. Idempotent actions such as reload are carried by
  multiple consecutive snapshots so one dropped reducer call cannot erase them.
- Prediction discards only inputs acknowledged by the authoritative sequence.
  Snapshots older than the last accepted server tick cannot rewind state.
- Pickup contact uses the segment between the previous and current
  authoritative player positions. Final-position-only overlap permits
  tunnelling; reconstructing the prior point from current velocity fails on
  corrections, collision stops, and delayed input.
- Inventory updates are saturating and atomic. A pickup deactivates only after a
  qualifying player receives ammo or health.
- Weapon reload and cooldown completion use wrap-safe tick comparisons.

## Deterministic verification

`pnpm --filter @arena/shared test` builds the shared package and runs the
deterministic Vitest harness. It covers counter wrap, malformed commands, input
coalescing, burst loss of a reload edge, swept pickup contact, saturating
inventory updates, and reload/cooldown completion across tick wrap.
