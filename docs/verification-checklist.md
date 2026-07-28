# Release verification checklist

Copy this checklist into the release evidence and record the date, operator,
commit, deployment ID, database identity, module program hash, and map hash.
Leave an item unchecked unless it was actually observed.

## Candidate identity

- [ ] Git commit recorded.
- [ ] Working tree scope reviewed; unrelated user changes preserved.
- [ ] Frontend deployment ID recorded.
- [ ] Database identity is exactly
      `c200f1da34230f67f31d0a88666fa8453fcdfbb15ab06e497fbe1a95fff95aaa`.
- [ ] Full post-publish module program hash recorded.
- [ ] Client and `server_config.map_version` both equal
      `99d61d90e6a52315f6b605d8973cc53481a4f4f2c3d2c1d252f1215b8cc1d772`.

## Automated gates

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm generate:map:check`
- [ ] ESLint through `pnpm lint`
- [ ] Shared TypeScript tests
- [ ] Client tests
- [ ] Rust tests
- [ ] Shared TypeScript build
- [ ] Client TypeScript/Vite production build
- [ ] SpacetimeDB module build with CLI tool version 2.1.0
- [ ] Complete `pnpm check`
- [ ] Generated bindings and client subscriptions use `open_rooms`,
      `server_config`, and caller-scoped `my_*` views rather than private
      dynamic base tables.
- [ ] CI passed on the deployed commit with Node 24 and
      `wasm32-unknown-unknown`

Attach logs; a local pass on another commit does not satisfy the release gate.

## Local multi-client gameplay

Use at least three independent browser contexts so identity storage is not
shared.

- [ ] Guest nickname enters quick play without registration.
- [ ] Quick play selects the best open room.
- [ ] Create-room code flow works.
- [ ] Join-by-code flow works.
- [ ] Anonymous `open_rooms` shows only real ID, code, phase, round, human
      count, and bot count values.
- [ ] An anonymous browser receives no per-tick gameplay, player, chat,
      inventory, account, or private session rows.
- [ ] After joining, every `my_room_*` view is restricted to the caller's room.
- [ ] `my_weapon_states`, `my_account_session`, `my_account_stats`, and
      `my_action_result` are restricted to the caller.
- [ ] Remote player rows do not expose another player's input/action
      acknowledgement counters.
- [ ] Room always contains exactly 12 combatants.
- [ ] Joining human replaces one eligible bot without changing total capacity.
- [ ] Leaving/disconnect returns control to a bot.
- [ ] Reconnect within 20 seconds reclaims the reserved player.
- [ ] Reconnect after expiry performs a clean join without stale action replay.

## Movement, bots, and map

- [ ] Authoritative collision blocks every tested wall/cover volume.
- [ ] Ramps, interiors, exterior lanes, vertical routes, and flanks are
      traversable.
- [ ] Client and server agree on floor/support heights.
- [ ] All 12 spawn points are outside collision.
- [ ] Repeated respawns avoid the most threatened spawn.
- [ ] Spawn protection prevents an immediate invalid death.
- [ ] Falling below the kill plane resolves safely.
- [ ] Bots navigate multiple route groups.
- [ ] Bots recover from obstacles/stuck states.
- [ ] Bots select only perceived/eligible targets.
- [ ] Bot aim variance is visible; bots do not use hidden player information.
- [ ] Bot deaths, pickups, reloads, weapons, and respawns follow human rules.

## Weapons and combat

For each Pulse Rifle, Longshot Sniper, and Breach Shotgun:

- [ ] Slot key and scroll selection agree with the HUD/viewmodel.
- [ ] Ammo is server-owned and decrements exactly once per accepted shot.
- [ ] Empty magazine cannot fire.
- [ ] Reload timing and reserve transfer are authoritative.
- [ ] Firing cadence rejects early repeats.
- [ ] Recoil, spread, muzzle flash, impact, hit marker, animation, and original
      sound are distinct.
- [ ] Occluded targets are not hit.
- [ ] Damage and falloff match the server profile.
- [ ] Kill attribution, death, feed, scoreboard, and statistics agree.

Additional:

- [ ] Sniper scope is centered at tested FOVs and unscopes safely.
- [ ] Shotgun pellet spread/falloff is meaningful at close versus long range.
- [ ] Spawn-protected/dead/cross-room targets cannot take invalid damage.
- [ ] Client attempts to submit damage, score, ammo, or transform state have no
      authoritative effect.

## Match lifecycle

- [ ] First player reaching 30 eliminations ends the round once.
- [ ] Ten-minute timeout ends a round with no 30-kill player.
- [ ] Final standings use authoritative kills/deaths and stable tie-breaks.
- [ ] Results remain visible through intermission.
- [ ] Ten-second intermission starts the next round once.
- [ ] Players, bots, weapons, pickups, score, timer, and transient events reset.
- [ ] If `accounts_enabled` is true, persistent signed-in statistics survive
      the round reset; otherwise this check is recorded N/A.
- [ ] Guests create no persistent account statistics.

## Fault and abuse testing

- [ ] 100–200 ms added latency remains responsive through prediction.
- [ ] Jitter does not move remote players backward through snapshots.
- [ ] Short packet interruption preserves fire/reload/respawn edges.
- [ ] Longer interruption enters explicit reconnect UI.
- [ ] `u32` sequence rollover accepts new and rejects stale input.
- [ ] Duplicate inputs/actions are idempotent.
- [ ] Counter advance beyond 8 is rejected.
- [ ] Claimed future shot tick clamps to server now.
- [ ] Claimed old shot tick clamps to the 12-tick rewind bound.
- [ ] NaN/infinite axes and angles are rejected.
- [ ] Unknown button bits and weapon slots are rejected.
- [ ] Input, room, chat, and auth floods reach explicit limits.
- [ ] Nickname and chat markup/control characters do not enter the DOM as HTML.
- [ ] A committed room/chat failure in `my_action_result` reaches the scoped UI
      error, while an input failure does not become a stale room/chat message.
- [ ] A connection identity cannot subscribe to another room/account by
      guessing IDs or using a private base-table query.
- [ ] Public password registration is unavailable unless `accounts_enabled`
      is explicitly enabled after the accepted OIDC/verified-identity or
      abuse-resistant gateway gate.
- [ ] A custom/fallback endpoint advertising `accounts_enabled=true` still
      leaves account controls disabled and receives no login/register password.

## Visual, audio, and performance QA

Inspect actual gameplay at 1920×1080 and at least one smaller desktop layout:

- [ ] HUD, ammo, health, timer, feed, chat, scoreboard, reconnect, and results
      remain legible.
- [ ] Weapon viewmodels align and do not clip at minimum/default/maximum FOV.
- [ ] Pointer-lock loss clears held input and click-to-resume works.
- [ ] Pause and fullscreen recover gracefully.
- [ ] Wet materials, rain, interiors, exterior landmarks, and atmospheric
      lighting remain readable.
- [ ] Low, medium, and high presets visibly change cost without gameplay drift.
- [ ] High preset sustains the 1080p/60 FPS target in a full room on the
      recorded test machine.
- [ ] Audio is original/procedural, spatially useful, non-clipping, and volume
      controls work.

Record hardware, browser/version, resolution, preset, average FPS, low-percentile
frame time if available, and any limitation.

## Production end-to-end

- [ ] `https://arena.skylarenns.com` serves the deployed commit.
- [ ] Frontend opens only secure API/WebSocket connections to
      `arenaapi.skylarenns.com`.
- [ ] Allowed Origin completes HTTP preflight and WebSocket upgrade.
- [ ] Disallowed Origin is blocked for HTTP and WebSocket requests.
- [ ] No-Origin CLI/non-browser traffic is permitted only through the normal
      SpacetimeDB authentication and authorization path.
- [ ] Production guest joins, receives bots, moves, fires all weapons, deals
      authoritative damage, dies, and respawns.
- [ ] A second production human safely replaces a bot.
- [ ] Production reconnect preserves the reserved player/action contract.
- [ ] A production match ends and the next match starts.
- [ ] If `accounts_enabled` is true, signed-in statistics persist across a new
      browser session; otherwise this check is recorded N/A.
- [ ] Identity tokens are endpoint/database-scoped in `sessionStorage`; legacy
      Arena token keys are absent from persistent `localStorage`.
- [ ] The deployed `server_config.accounts_enabled` value matches the recorded
      public-registration decision.
- [ ] `spacetimedb.service` remains active/enabled.
- [ ] gmbl on port `9299` remains healthy.
- [ ] parrot on port `39100` remains healthy.
- [ ] No unexpected warnings/errors appear in Arena module, tunnel, or browser
      logs.

## Known owner/physical gates

These cannot be inferred from code or HTTP status:

- [ ] Owner-authorized SpacetimeDB publish.
- [ ] Owner-authorized Cloudflare rule activation and event review.
- [ ] Owner-authorized Vercel production promotion.
- [ ] Owner-approved OIDC/verified identity or abuse-resistant registration
      gateway before unrestricted public password registration.
- [ ] Owner sudo removal of `arena.service` and `arena-publish.service`.
- [ ] Physical mouse feel, audio, visuals, 1080p performance, and multiple
      simultaneous browser/client checks.
