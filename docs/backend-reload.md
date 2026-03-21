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

## One-click reload from GitHub (Actions button)

This repo includes a manual workflow:

- **Actions → Reload Backend → Run workflow**

Before first use, set these repository secrets:

- `SERVER_HOST` (example: `203.0.113.10`)
- `SERVER_SSH_USER` (example: `ubuntu`)
- `SERVER_SSH_PRIVATE_KEY` (private key text)
- `SERVER_APP_DIR` (absolute path to repo on server, example: `/home/ubuntu/arena`)

Optional secrets:

- `SERVER_SSH_PORT` (default `22`)
- `SERVER_SSH_KNOWN_HOSTS` (recommended for strict host checking)

Workflow inputs you can change per run:

- `git_ref` (branch/tag, default `main`)
- `db_name` (default `arena-fps-slice`)
- `spacetime_server` (default `http://127.0.0.1:4789`)
