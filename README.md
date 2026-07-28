# Arena

Arena is a clean-room, desktop-first browser FPS for 12-combatant
free-for-all matches. The repository combines the retained React/Vite
cyber-themed interface with a Three.js gameplay renderer, shared generated map
data, client prediction/reconciliation, and a Rust SpacetimeDB 2.1
authoritative module. Production runtime state comes from the backend rather
than preview players, scores, rooms, health, ammo, or feed entries.

## Architecture

- The browser submits sequenced movement and action intent. It never submits
  authoritative transforms, hits, damage, score, health, ammo, or inventory.
- The Rust module runs the authoritative 60 Hz room simulation, collision,
  weapons, combat, bots, respawns, match lifecycle, chat, and optional account
  statistics.
- Dynamic base tables remain private. `open_rooms` is the anonymous,
  low-frequency room-browser projection and contains only room identity, phase,
  round, and occupancy. Gameplay and account data use caller-scoped `my_*`
  views.
- The local player is predicted and reconciled from acknowledgements. Remote
  players are interpolated from buffered authoritative snapshots.
- Three.js updates outside React's render cycle. React receives throttled
  presentation snapshots for the menu, HUD, chat, scoreboard, connection,
  pause, elimination, and results screens.
- Client and server collision artifacts are generated from the same map
  definition.

See [the engineering guide](docs/README.md),
[the architecture](docs/architecture.md), and
[the network/gameplay contract](docs/network-gameplay-contract.md) for the
full trust boundary.

## Build and run

The supported toolchain is Node.js 24, pnpm 10.10.0, Rust stable with the
`wasm32-unknown-unknown` target, and SpacetimeDB CLI 2.1.0.

```bash
pnpm install --frozen-lockfile
pnpm generate
pnpm check
```

`pnpm check` verifies generated map parity, linting, shared/client/Rust tests,
shared and client builds, and a SpacetimeDB module build. A historical pass or
a pass from another commit does not verify the current release candidate.

For a playable local session, publish the module to the isolated loopback
database and create `.env.local` as described in
[local development](docs/local-development.md), then run:

```bash
pnpm dev
```

## Browser configuration

All `VITE_*` values are public browser configuration and must never contain
credentials.

| Variable                      | Purpose                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `VITE_SPACETIME_URI`          | Primary SpacetimeDB HTTP(S) endpoint                      |
| `VITE_SPACETIME_DATABASE`     | Module/database name                                      |
| `VITE_SPACETIME_FALLBACK_URI` | Optional secondary endpoint shown by the backend selector |

An identity token is stored in `sessionStorage`, scoped to the normalized
endpoint and database. It supports reconnect within the browser session and is
not an account password. Legacy Arena tokens are removed from persistent
`localStorage`. A fallback or custom production endpoint also requires the
matching `https://` and `wss://` origins in the deployed CSP and edge policy.
SpacetimeDB 2.1's browser SDK generates BSATN serializers with `Function`, so
the production `script-src` includes the otherwise avoided `'unsafe-eval'`
compatibility token. Do not broaden it to third-party script hosts or inline
scripts.
Account controls and credential reducers remain disabled unless both the
endpoint/database are the exact production scope and
`server_config.accounts_enabled` is true. A custom or fallback backend is
guest-only even if it advertises the flag.

## Controls

| Input              | Action                         |
| ------------------ | ------------------------------ |
| Mouse              | Look                           |
| Left / right mouse | Fire / hold sniper scope       |
| `W`, `A`, `S`, `D` | Move                           |
| Left `Shift`       | Sprint                         |
| `Space`            | Jump                           |
| `R`                | Reload                         |
| `1`, `2`, `3`      | Rifle, sniper, shotgun         |
| Mouse wheel        | Cycle weapons                  |
| Hold `Tab`         | Scoreboard                     |
| `/`                | Open chat                      |
| `F`                | Toggle fullscreen              |
| `Esc`              | Release pointer lock and pause |

Sensitivity, 55-110 degree FOV, graphics preset, effects volume, music volume,
and fullscreen are available in the menu and pause settings. See
[controls](docs/controls.md) for pointer-lock recovery behavior.

## Authentication and public-launch limitation

Guest quick play does not require registration. Optional password accounts use
server-side password hashing, rate limits, and account lockout guards, but the
current registration flow does not verify email ownership or identity and
does not use Turnstile or equivalent bot attestation. Spacetime identities can
be created by untrusted clients, so per-identity reducer limits alone are not
an abuse-resistant public registration boundary.

Before unrestricted public account registration, add OIDC or verified-email
identity, or place registration behind an abuse-resistant gateway that
enforces Turnstile/risk checks and global rate limits. Guest play may remain
the primary flow while registration is disabled. Keep
`server_config.accounts_enabled` false until that gate is met. This is a
release gate, not a claim that public account hardening has already been
completed.

Production deployment and end-to-end gameplay are not established by a
successful build or HTTP response. Use the guarded
[production cutover](docs/production-cutover.md) and leave every item in the
[verification checklist](docs/verification-checklist.md) unchecked until it
has actually been observed on the exact deployed commit.
