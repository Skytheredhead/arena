# Backend Reload (Linux)

Use this to ensure your server is running the **new** backend code instead of an older publish.

## Manual commands on the Linux server

Run from your repo checkout on the server:

```bash
cd /path/to/arena
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @arena/shared build
pnpm server:build
```

Start SpacetimeDB (if not already running):

```bash
spacetime start --listen-addr 0.0.0.0:4789
```

Publish this backend module to your DB:

```bash
cd /path/to/arena/apps/server
spacetime publish --server http://127.0.0.1:4789 arena-fps-slice
```

If your old backend is under a different DB name, publish to the **same** DB your client uses.
