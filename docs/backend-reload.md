# Backend Reload (Linux)

Use this to ensure your server is running the **new** backend code instead of an older publish.

## Local publish command

Run this from the repo root to build the whole backend, start SpacetimeDB if
needed, and publish the module:

```bash
pnpm backend:local
```

That command is equivalent to:

```bash
cd /path/to/arena
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @arena/shared build
pnpm server:build
pnpm server:publish:local
```

`pnpm server:publish:local` automatically checks `http://127.0.0.1:4789`.
If SpacetimeDB is not already running, it starts it in the background before
publishing the backend module.

Background server logs default to:

```bash
/tmp/arena-spacetimedb.log
```

Use a different local database name if your client points somewhere else:

```bash
SPACETIMEDB_DB_NAME=your-db-name pnpm server:publish:local
```

If your old backend is under a different DB name, publish to the **same** DB your client uses.

## Manual fallback

If you need to start SpacetimeDB yourself:

```bash
pnpm server:start
```

Then publish:

```bash
pnpm server:publish:local
```
