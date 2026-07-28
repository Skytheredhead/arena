# Arena engineering guide

This directory is the operating guide for Arena's clean-room browser FPS.
The source code remains the authority when a constant changes; update the
corresponding document in the same change.

## Start here

- [Architecture](architecture.md) explains the trust boundaries, runtime
  layers, caller-scoped views, room lifecycle, and ownership of state.
- [Network and gameplay contract](network-gameplay-contract.md) defines the
  sequenced-input, retry, reconciliation, reconnect, and lag-compensation
  rules.
- [Map generation](map-generation.md) explains the single map source, generated
  client/server artifacts, and content hash.
- [Controls](controls.md) lists the default desktop controls and settings.
- [Local development](local-development.md) pins the toolchain and gives an
  isolated SpacetimeDB 2.1.0 workflow.
- [Production cutover](production-cutover.md) is the guarded, Arena-only
  deployment procedure.
- [Cloudflare origin policy](cloudflare-origin-policy.md) defines the browser
  origin boundary for `arenaapi.skylarenns.com`.
- [Verification checklist](verification-checklist.md) is the acceptance record
  for local, multi-client, network-fault, and production checks.

## Production coordinates

| Item                         | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Frontend                     | `https://arena.skylarenns.com`                                     |
| Public SpacetimeDB endpoint  | `https://arenaapi.skylarenns.com`                                  |
| Shared LAN endpoint          | `http://192.168.1.174:4789`                                        |
| Database name                | `arena-fps-slice`                                                  |
| Database identity            | `c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa` |
| Required SpacetimeDB version | `2.1.0`                                                            |
| Map                          | `neon-foundry-01` / `Neon Foundry`                                 |

The database mapping above was resolved read-only on 2026-07-27 by describing
the name and identity on the explicit shared endpoint and comparing the
byte-identical schemas. Re-resolve it immediately before any destructive
publish. A stale document is never authority to delete a database.

## Status language

Runbooks distinguish commands from evidence:

- An unchecked checkbox means not verified.
- A command in a code block is an operator action, not evidence that it ran.
- `EXPECTED` describes an acceptance condition.
- `STOP` means do not improvise around the guard.

No credential, API token, SpacetimeDB login token, Cloudflare tunnel credential,
or Vercel token belongs in this repository.

## Current public-data and identity boundary

The module keeps dynamic gameplay and account base tables private. Anonymous
clients receive only the minimal `open_rooms` browser projection; a connected
player receives room, player, weapon, pickup, event, action-result, session,
and statistics data through caller-scoped `my_*` views. `server_config` is the
only static public base table. See
[the published data boundary](architecture.md#published-data-boundary) before
changing subscriptions or generated bindings.

Guest identity tokens are held in `sessionStorage` and keyed by normalized
endpoint plus database. They are reconnect credentials, not account passwords.
Do not persist them in `localStorage` or send a production token to a custom
backend.

Password accounts are optional and are not yet a verified public identity
system. The current registration path does not verify email ownership or use
OIDC/Turnstile-class bot resistance. Unrestricted public registration remains
blocked on OIDC or an abuse-resistant registration gateway; keep
`server_config.accounts_enabled` false and use guest play while that gate is
unresolved. The client also requires the exact production endpoint/database
scope before it exposes account controls; custom and fallback backends remain
guest-only.
