# Local development with SpacetimeDB 2.1.0

Use an isolated local data directory and explicit server URLs. Never point a
local reset command at `192.168.1.174:4789`.

## Toolchain

- Node.js `24`
- pnpm `10.10.0`
- Rust stable with `wasm32-unknown-unknown`
- SpacetimeDB CLI exactly `2.1.0`

Install the JavaScript and Rust prerequisites:

```bash
corepack enable
corepack prepare pnpm@10.10.0 --activate
rustup target add wasm32-unknown-unknown
pnpm install --frozen-lockfile
```

The official SpacetimeDB installer can bootstrap the version manager, after
which the project pins 2.1.0:

```bash
curl -sSf https://install.spacetimedb.com | sh -s -- --yes
"$HOME/.local/bin/spacetime" version install 2.1.0 --use --yes
./scripts/spacetime-2.1.sh --version
```

`scripts/spacetime-2.1.sh` refuses to run a CLI whose output does not contain
tool version `2.1.0`.

## Start an isolated server

From `/Users/skylarenns/Desktop/arena`, start a local server in terminal one:

```bash
mkdir -p .local-spacetime
./scripts/spacetime-2.1.sh start \
  --listen-addr 127.0.0.1:4789 \
  --data-dir /Users/skylarenns/Desktop/arena/.local-spacetime \
  --non-interactive
```

This binds only loopback and does not touch the shared production service.

In terminal two, build and publish a local-only database:

```bash
cd /Users/skylarenns/Desktop/arena
./scripts/spacetime-2.1.sh build \
  --module-path /Users/skylarenns/Desktop/arena/apps/server
./scripts/spacetime-2.1.sh publish \
  --server http://127.0.0.1:4789 \
  --no-config \
  --module-path /Users/skylarenns/Desktop/arena/apps/server \
  --delete-data=always \
  --yes \
  arena-fps-local
```

Create an ignored `.env.local` for the client:

```dotenv
VITE_SPACETIME_URI=http://127.0.0.1:4789
VITE_SPACETIME_DATABASE=arena-fps-local
VITE_SPACETIME_FALLBACK_URI=
```

Leave the fallback blank unless a second local endpoint is intentionally under
test. All `VITE_*` values are shipped to the browser and must not contain a
token or other credential.

Generate the shared map artifacts and TypeScript bindings from source, then
start Vite:

```bash
pnpm generate
pnpm dev
```

The binding generator builds from `apps/server`; it does not need a database
publish and does not mutate the production host.

The browser stores each SpacetimeDB identity token in `sessionStorage`, keyed
by normalized endpoint plus database. The local token is therefore not reused
for production or for a different test database. Use independent browser
contexts when testing multiple humans so they do not share a session identity.

## Required checks

```bash
pnpm check
```

The root check verifies generated map parity, ESLint, shared/client/Rust tests,
shared and client TypeScript/builds, and a SpacetimeDB module build through the
exact-version wrapper.

Useful focused checks:

```bash
pnpm generate:map:check
pnpm --filter @arena/shared check
pnpm --filter @arena/client test
pnpm test:server
./scripts/spacetime-2.1.sh build --module-path apps/server
```

## Local reset safety

The local database above is named `arena-fps-local`; production is
`arena-fps-slice`. Before any local destructive command, confirm all three:

- URL is exactly `http://127.0.0.1:4789`;
- database name is exactly `arena-fps-local`;
- the process uses
  `/Users/skylarenns/Desktop/arena/.local-spacetime`.

If any value differs, stop. Never use a saved CLI default server for a delete,
clear, or `--delete-data` operation.

## References

- [Official SpacetimeDB installation](https://spacetimedb.com/install)
- [SpacetimeDB 2.x CLI reference](https://spacetimedb.com/docs/cli-reference/)
- [Self-hosting guide](https://spacetimedb.com/docs/how-to/deploy/self-hosting/)
