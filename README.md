# Arena

A browser FPS with a React/Three.js client and an authoritative Rust
SpacetimeDB simulation.

## Gameplay architecture

- The client predicts fixed-step local movement and reconciles from
  server-acknowledged input sequences.
- A bounded reliable input buffer retries unacknowledged snapshots, compacts
  movement safely, and preserves transient fire/reload intent.
- The server owns movement, health, inventory, weapon timing, hit resolution,
  respawns, and pickup activation.
- Remote players render from an adaptive interpolation buffer; local
  corrections are presentation-smoothed without weakening server authority.
- Sequence numbers and server ticks use wrap-safe unsigned serial arithmetic.
- Pickups are resolved against exact authoritative movement segments to prevent
  tunnelling under jitter or delayed correction.
- Account statistics track damage, accuracy, eliminations, deaths, and match
  outcomes without double-counting trigger pulls or overkill damage.

## Rendering

- The existing HUD is preserved over a rebuilt storm-soaked industrial arena
  with authored concrete, gunmetal, and sky textures; physical wet materials;
  shader rain and puddles; tone mapping; and quality-scaled shadows.
- Rifle, shotgun, sniper, and remote operator silhouettes use detailed rounded
  geometry with separated metal, polymer, glass, rubber, and fabric materials.
- The local weapon rests low and canted on the right, swings with locomotion,
  and smoothly settles onto the calibrated centerline while aiming down sights.

See [docs/network-gameplay-contract.md](docs/network-gameplay-contract.md) for
the reliability invariants.

## Development

```sh
pnpm install
pnpm dev
```

Run the complete non-visual verification suite with:

```sh
pnpm check
```

Build or publish the SpacetimeDB module with the scripts in `package.json`.
