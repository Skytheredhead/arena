# Map generation and collision parity

`Neon Foundry` is authored once and deterministically emitted for both sides of
the game. Client visuals and server collision must not be maintained as
separate hand-edited maps.

## Single source and artifacts

| Role                                | Path                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| Authored map source                 | `packages/shared/map/arena-map.source.mjs`            |
| Generator                           | `scripts/generate-map.mjs`                            |
| Browser/runtime JSON                | `packages/shared/generated/arena-map.json`            |
| Typed client constant               | `packages/shared/src/generated/arenaMap.generated.ts` |
| Rust collision/navigation constants | `packages/shared/generated/arena_map.rs`              |

The Rust module includes the generated Rust artifact at compile time. The
client renderer and shared collision helpers consume the generated TypeScript
or JSON representation.

## Hash contract

The generator serializes the authored map without a `contentHash`, hashes that
canonical JSON with SHA-256, and inserts the digest into every generated
representation. This is a semantic map hash; it is intentionally different
from the SHA-256 of the pretty-printed output files.

Current generated contract:

| Property             | Value                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Schema version       | `1`                                                                |
| Map ID               | `neon-foundry-01`                                                  |
| Content hash         | `99d61d90e6a52315f6b605d8973cc53481a4f4f2c3d2c1d252f1215b8cc1d772` |
| Tick rate            | `60`                                                               |
| Maximum combatants   | `12`                                                               |
| Collision boxes      | `45`                                                               |
| Ramps                | `8`                                                                |
| Spawn points         | `12`                                                               |
| Pickups              | `8`                                                                |
| Navigation waypoints | `74`                                                               |

The module publishes this hash in `server_config.map_version`. A client must
fail clearly or reload when the server map hash does not match its bundled map;
continuing would permit visual/collision drift.

## Editing workflow

1. Edit only `packages/shared/map/arena-map.source.mjs`.
2. Generate all targets:

   ```bash
   pnpm generate:map
   ```

3. Inspect the generated diff. A geometry change should be visible in all
   relevant generated targets.
4. Run the invariant suite:

   ```bash
   pnpm --filter @arena/shared check
   ```

5. Build the exact server module:

   ```bash
   ./scripts/spacetime-2.1.sh build --module-path apps/server
   ```

6. Visually inspect the running client and test the same surfaces with
   authoritative movement before accepting the change.

CI runs `pnpm generate:map:check`; it fails if generated files are missing or
stale. Do not hand-edit a generated map artifact to make that check pass.

## Required map invariants

- Exactly 12 spawn points with the configured minimum separation.
- Every spawn references an existing navigation waypoint and begins outside
  collision.
- Collision boxes and ramps are finite, positive, inside playable bounds, and
  uniquely identified.
- Navigation neighbors exist, are reciprocal where required by the route, and
  remain reachable through exterior, interior, vertical, flank, and spawn
  route groups.
- Pickups are inside the playable volume and use bounded respawn ticks.
- Client material/lighting detail may vary by quality preset; collision,
  pickup coordinates, spawn coordinates, and navigation never do.

## Production evidence

Record all three values together for a release:

- Git commit;
- module program hash returned by the explicit production publish;
- `server_config.map_version`.

An HTTP response or successful frontend build is not evidence that the
production module uses the matching collision artifact.
