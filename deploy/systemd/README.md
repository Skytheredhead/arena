# Systemd boundary

Arena runs as a database module inside the healthy shared
`spacetimedb.service`. It must not gain a second application daemon.

The 2026-07-27 read-only audit found:

| Unit                    | State                              | Disposition                                  |
| ----------------------- | ---------------------------------- | -------------------------------------------- |
| `spacetimedb.service`   | active, enabled, SpacetimeDB 2.1.0 | Retain; do not restart or edit for Arena     |
| `arena.service`         | inactive, disabled, Arena-specific | Owner may remove after production acceptance |
| `arena-publish.service` | inactive, disabled, Arena-specific | Owner may remove after production acceptance |

Before removal, inspect `FragmentPath`, the complete unit contents, reverse
dependencies, and current state. Remove only the two exact Arena fragment files
after the owner confirms their paths. The guarded commands and post-removal
checks are in
[`../../docs/production-cutover.md`](../../docs/production-cutover.md#7-remove-obsolete-arena-only-units).

The removal does not authorize changes to the shared service, gmbl, parrot,
Cloudflare Tunnel, or any other unit.
