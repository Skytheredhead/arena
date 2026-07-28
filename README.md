# Arena UI

This branch is a UI-only foundation for the Arena rebuild. The previous game
runtime, backend, networking, simulation, generated bindings, media, maps, and
tests have been removed.

The retained React overlays run against local preview state so the menu, HUD,
chat, scoreboard, pause screen, settings, account stats, eliminated screen, and
mobile controls can be developed independently.

```bash
pnpm install
pnpm dev
```

In the HUD preview, use Escape for the pause UI, hold Tab for the scoreboard,
and press K for the eliminated UI.
