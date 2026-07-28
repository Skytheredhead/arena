# Arena-only production cutover

This is an irreversible data replacement runbook. It authorizes only the Arena
database named below. It does not authorize a shared SpacetimeDB restart,
server-wide clear, default-server publish, or change to another application.

## Recorded identity

Read-only audit on 2026-07-27 established:

| Property                  | Recorded value                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Endpoint                  | `http://192.168.1.174:4789`                                                         |
| SpacetimeDB               | `2.1.0`                                                                             |
| Database name             | `arena-fps-slice`                                                                   |
| Database identity         | `c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa`                  |
| Owner identity            | `c200f06c33432798365105ffadda3f2b55c4da6871569ad0da84f05bdd7df9c8`                  |
| Pre-cutover program hash  | Prefix `837c` in the latest audit; capture the full current value before publishing |
| Shared service            | `spacetimedb.service`, active and enabled; retain                                   |
| Public route              | `arenaapi.skylarenns.com` → `http://127.0.0.1:4789` through the existing tunnel     |
| Cloudflare WAF rule       | `0c0a0dc32be7419a8051f3a97ce3aecb`, active                                          |
| Cloudflare CORS transform | `44a5b310b6b040a4a6609338527a5b9a`, active                                          |

Describing `arena-fps-slice` and the full identity returned byte-identical
72,358-byte schema documents during the audit. That evidence is historical;
repeat it before publishing.

## Hard isolation guards

Do not continue unless every item is true:

- [ ] `./scripts/spacetime-2.1.sh --version` reports tool version `2.1.0`.
- [ ] The explicit server is exactly `http://192.168.1.174:4789`.
- [ ] `list` maps `arena-fps-slice` to exactly
      `c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa`.
- [ ] Describing the name and identity produces byte-identical current schema.
- [ ] The authenticated CLI identity owns that database.
- [ ] `spacetimedb.service` is healthy and no service restart is planned.
- [ ] `gmbl` on port `9299` and `parrot` on port `39100` are healthy and out of
      scope.
- [ ] The candidate Git commit and generated map hash are recorded.
- [ ] `pnpm check` passes at that exact commit.
- [ ] Generated bindings expose `open_rooms` plus caller-scoped `my_*` views
      and do not subscribe browsers to private dynamic base tables.
- [ ] `server_config.accounts_enabled` is false, or an OIDC/verified identity
      or abuse-resistant registration gateway has been accepted and recorded.

`STOP`: if the name maps to another identity, more than one possible Arena
database appears, authentication is uncertain, or another service changes
during the preflight.

Never run `spacetime server clear`. Never omit `--server` or `--no-config` from
a production database command.

## 1. Read-only preflight

Run from `/Users/skylarenns/Desktop/arena` and save the output outside the
repository if it contains tokens or private server metadata:

```bash
cd /Users/skylarenns/Desktop/arena
./scripts/spacetime-2.1.sh --version
./scripts/spacetime-2.1.sh list \
  --server http://192.168.1.174:4789 \
  --yes
./scripts/spacetime-2.1.sh describe \
  --server http://192.168.1.174:4789 \
  --no-config \
  --json \
  arena-fps-slice
./scripts/spacetime-2.1.sh describe \
  --server http://192.168.1.174:4789 \
  --no-config \
  --json \
  c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa
```

On the host, the owner must also record:

```bash
systemctl is-active spacetimedb.service
systemctl is-enabled spacetimedb.service
systemctl is-active arena.service arena-publish.service
systemctl is-enabled arena.service arena-publish.service
ss -lntp
```

Expected isolation:

- shared `spacetimedb.service` remains active/enabled on port `4789`;
- obsolete `arena.service` and `arena-publish.service` remain
  inactive/disabled until their later removal;
- no command targets the gmbl or parrot service/port.

## 2. Freeze and verify the candidate

```bash
cd /Users/skylarenns/Desktop/arena
git status --short
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm generate
pnpm check
jq -r '.contentHash' packages/shared/generated/arena-map.json
```

Review the generated binding diff before deployment. Record the commit, map
hash, test output, and candidate frontend build.

## 3. Replace only the Arena database

The following command is intentionally addressed to the full, re-confirmed
Arena identity rather than a nickname or CLI default:

```bash
cd /Users/skylarenns/Desktop/arena
./scripts/spacetime-2.1.sh publish \
  --server http://192.168.1.174:4789 \
  --no-config \
  --module-path /Users/skylarenns/Desktop/arena/apps/server \
  --delete-data=always \
  --break-clients \
  --yes \
  c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa
```

`--delete-data=always` permanently discards Arena's old rows. It is permitted
for this cutover only after the guards pass. Do not substitute a shell
variable, wildcard, another identity, or `spacetime delete`.

Immediately verify the mapping and new module:

```bash
./scripts/spacetime-2.1.sh list \
  --server http://192.168.1.174:4789 \
  --yes
./scripts/spacetime-2.1.sh describe \
  --server http://192.168.1.174:4789 \
  --no-config \
  --json \
  c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa
./scripts/spacetime-2.1.sh sql \
  --server http://192.168.1.174:4789 \
  --no-config \
  c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa \
  "SELECT * FROM server_config"
./scripts/spacetime-2.1.sh logs \
  --server http://192.168.1.174:4789 \
  --no-config \
  --level warn \
  --num-lines 100 \
  c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa
```

Record the full new program hash and confirm `map_version` matches the client
artifact.

## 4. Re-verify the public edge policy

The existing tunnel already routes `arenaapi.skylarenns.com` to loopback port
`4789`; preserve that ingress and tunnel credential. The scoped WAF and exact
CORS response rules are active. Re-verify
[the Cloudflare origin policy](cloudflare-origin-policy.md) from outside the
LAN before and after module publication; do not create a duplicate rule.

Do not put an interactive Cloudflare Access login in front of the public guest
game API. Guest play depends on an anonymous browser being able to establish
the SpacetimeDB connection.

## 5. Deploy the frontend

The repository root contains the Vercel deployment configuration. The
production project must set:

```dotenv
VITE_SPACETIME_URI=https://arenaapi.skylarenns.com
VITE_SPACETIME_DATABASE=arena-fps-slice
# Optional; leave blank unless a separately reviewed secondary route exists.
VITE_SPACETIME_FALLBACK_URI=
```

Deploy the exact verified commit through the existing Arena Vercel project.
Do not create a second project or repoint another domain. Record the deployment
ID and commit, then verify the production CSP permits only the intended
`https://` and `wss://` API origin. The checked-in CSP currently permits only
`arenaapi.skylarenns.com`; configuring a different fallback also requires its
exact HTTPS/WSS origins in CSP and an equivalent edge-origin review.

All three variables are browser-readable configuration, not secret storage.
The client keeps the issued identity token in endpoint/database-scoped
`sessionStorage` and removes legacy Arena token copies from persistent
`localStorage`.

Account controls are enabled only for the exact
`https://arenaapi.skylarenns.com` / `arena-fps-slice` scope and only when the
server flag is true. Verify that selecting a custom/fallback backend leaves
accounts disabled even if that endpoint advertises `accounts_enabled=true`.

## Public account-registration gate

Guest quick play does not require an account and must remain available through
the public game API. Optional password accounts have server-side hashing,
per-identity/global authentication budgets, and account lockout guards, but
the current flow does not verify email ownership or use OIDC, Turnstile, or
equivalent bot attestation.

Do not enable unrestricted public registration based on reducer limits alone;
untrusted clients can mint fresh Spacetime identities. Before a fully public
account launch, use OIDC/verified email or an abuse-resistant registration
gateway with global rate/risk enforcement. Otherwise keep
`server_config.accounts_enabled` false and document that guest play is the
supported public flow.

## 6. End-to-end acceptance

Complete [the verification checklist](verification-checklist.md). At minimum,
use multiple simultaneous production browser sessions to prove:

- secure connection through both production domains;
- quick play and a 12-row room filled by bots;
- safe bot replacement as another human joins;
- movement collision and reconciliation;
- all three weapons, authoritative ammo/reload/damage/death/respawn;
- chat sanitization, scoreboard, kill feed, and reconnect;
- 30-kill or 10-minute completion, intermission, and next-round reset;
- guest play and, only when `server_config.accounts_enabled` is true,
  signed-in persistent statistics (otherwise record account checks as N/A);
- anonymous room browsing exposes only the minimal `open_rooms` summary;
- joined clients receive only their own room/account/action-result views;
- reconnect tokens remain session scoped and never enter persistent storage;
- no regression to the gmbl or parrot services.

HTTP 200, a successful Vercel build, a WebSocket upgrade alone, or a successful
module publish alone is not end-to-end proof.

## 7. Remove obsolete Arena-only units

This is an owner-only sudo step after the new shared-service path passes
production acceptance. First inspect and save the unit definitions:

```bash
systemctl cat arena.service
systemctl cat arena-publish.service
systemctl show -p FragmentPath arena.service arena-publish.service
```

Confirm both fragment paths are Arena-specific files under
`/etc/systemd/system`, both units are inactive/disabled, and neither is a
dependency of `spacetimedb.service`. Then the owner may run:

```bash
sudo systemctl disable --now arena.service arena-publish.service
sudo rm -- /etc/systemd/system/arena.service
sudo rm -- /etc/systemd/system/arena-publish.service
sudo systemctl daemon-reload
sudo systemctl reset-failed arena.service arena-publish.service
```

After removal:

```bash
systemctl is-active spacetimedb.service
systemctl is-enabled spacetimedb.service
systemctl status arena.service arena-publish.service
ss -lntp
```

Do not remove, disable, restart, or edit `spacetimedb.service`.

## Rollback boundary

- Frontend: use the existing Vercel project's previous known-good deployment.
- Edge rules: retain an exported ruleset/version so the owner can revert the
  specific Arena rule only.
- Module: republish a retained known-good Arena WASM or source artifact to the
  same full identity with the same explicit server.
- Data: the pre-cutover Arena rows are not recoverable after
  `--delete-data=always` unless the owner independently captured a compatible
  backup.

A rollback never includes restarting the shared service, deleting a different
database, or changing gmbl/parrot.

## Owner-only steps still requiring authorization

- authenticated SpacetimeDB publish as the recorded owner identity;
- Vercel production deployment/domain access;
- Cloudflare WAF/Transform Rules access;
- OIDC/verified-email or abuse-resistant registration-gateway decision before
  unrestricted public password registration;
- SSH/sudo removal of the two obsolete systemd units;
- physical multi-client, audio, visual, and performance acceptance.
