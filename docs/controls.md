# Controls

Arena is desktop-first and uses pointer lock for first-person mouse input.

## Default mouse and keyboard

| Control            | Action                            |
| ------------------ | --------------------------------- |
| Mouse              | Look                              |
| Left mouse         | Fire                              |
| Right mouse        | Hold sniper scope / aim           |
| `W`, `A`, `S`, `D` | Move                              |
| Left `Shift`       | Sprint                            |
| `Space`            | Jump                              |
| `R`                | Reload                            |
| `1`                | Pulse rifle                       |
| `2`                | Longshot sniper                   |
| `3`                | Breach shotgun                    |
| Mouse wheel        | Cycle weapons one slot at a time  |
| Hold `Tab`         | Scoreboard                        |
| `/`                | Open chat                         |
| `Enter`            | Send focused chat message         |
| `F`                | Toggle fullscreen                 |
| `Esc`              | Release pointer lock / open pause |

Scroll input is debounced so one wheel gesture produces a sensible one-slot
change. Weapon selection wraps in both directions.

## Pointer lock recovery

- Entering gameplay requires a user click before the browser grants pointer
  lock.
- `Esc`, window blur, opening chat, pausing, death/results UI, or a connection
  transition clears held movement/fire state.
- The game must never continue firing because pointer lock was lost.
- After an unlock or reconnect, the overlay asks for a click to resume. The
  client does not attempt to bypass the browser's user-gesture requirement.
- A rejected pointer-lock or fullscreen request leaves the UI usable and shows
  the non-locked state.

## Settings

The menu and pause screen expose:

- mouse sensitivity;
- field of view from 55° through 110°;
- low, medium, and high graphics presets;
- effects and music volume;
- fullscreen.

Key bindings are represented by `KeyBindings` in
`apps/client/src/input/InputController.ts`. Any remapping UI must update that
mapping, clear held keys, persist only validated browser key codes, and retain
an accessible way to pause and restore defaults.

Graphics settings affect rendering only. They cannot alter map collision,
weapon statistics, hit resolution, rain occlusion, or another player's state.
