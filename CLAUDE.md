# Working in this repository

Lightcycle Arena: a Tron-style lightcycle game. React + TypeScript, two views of
the same game (a flat 2D board and a 3D chase camera), five named AI riders.

## Layout and commands

The git root holds `.github/` and `docs/`; **the app lives one level down in
`lightcycle_arena/`**, and every npm command runs from there. CI paths have been
wrong about this before — the workflow once pointed at
`lightcycle_arena/lightcycle_arena` and failed on every run.

```bash
cd lightcycle_arena
npm run dev        # Vite on :3000
npm run lint       # ESLint flat config
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run build      # into dist/, which is what Firebase serves
npm run simulate   # headless balance tables (see below)
```

Run lint, typecheck, test and build before calling anything done. They are the
same five steps CI runs.

## How it is put together

Three layers, and the boundary between them is the point:

| Layer | Where | What it holds |
| --- | --- | --- |
| Rules, pure | `src/game/`, `src/ai/`, `src/utils/`, `src/config/` | The lattice, one tick of movement, the match reducer, the bots. No React, no DOM. |
| Effects | `src/game/useLightcycleGame.ts`, `src/render/useArenaRenderers.ts` | Board state in refs, the animation loop, input, audio, storage, renderer lifecycle. |
| Presentation | `src/components/` | HUD, overlays, canvases, on-screen pad. `GameCanvas.tsx` renders; it decides nothing. |

`src/render/types.ts` defines the `GameRenderer` contract. Both the 2D canvas
renderer and the three.js one implement it, and the game only ever talks to
that — which is why a second view cost no game logic at all.

### The lattice

Positions live on a doubled grid: **even/even is a vertex** a bike can stand on,
**even/odd and odd/even are the edges between them**, which is where walls go.
That separation is what makes edge collisions exact. See
`src/utils/latticeHelpers.ts`.

### Things that will bite

- **The animation loop is started once** in `useArenaRenderers` and reads the
  newest callbacks through a ref. Do not make it depend on game state; that was
  the old design and it rebuilt the timing state on every level change.
- **Occupancy vs trails.** The shared occupancy lattice holds walls *and* the
  vertex each live bike is standing on; the per-rider trails hold only walls.
  With the jet wall off, the standing-on mark is cleared as the bike leaves it.
- **Trails never overlap** — a walled cell is one nobody can enter — which is
  what lets a downed rider's wall be cleared without checking owners.
- **Both riders are resolved against the same board**, then compared. Moving
  them one after another hands head-ons to whoever went second.
- **The AI mutates the lattice speculatively** while scoring a move and restores
  it. A test asserts the board comes back unchanged.
- **Renderers watch their container with a ResizeObserver**, not the window: the
  HUD appearing when a run starts resizes the arena without the window moving.
- **`.canvas-overlay p` outranks any single class.** Scope paragraph classes
  (`.canvas-overlay .title-tagline`) or they silently render as body copy.

### Balance is measured, not guessed

`npm run simulate` plays the bots against each other headlessly and prints two
tables: the difficulty ladder and what the opening looks like for a rider who
never turns. It is seeded, so it doubles as a regression test. Duels are played
from both seats — the arena is not perfectly even-handed and a mirror match came
out 63/37 before that was fixed.

Raise the sample when tuning: `VITE_SIMULATION_ROUNDS=200 npm run simulate`.

## Testing

Vitest with jsdom. `src/setupTests.ts` stubs `matchMedia` and `ResizeObserver`;
`GameCanvas.test.tsx` stubs the canvas context and `Path2D` with a proxy, which
is what lets the whole game loop run headlessly under fake timers. Prefer that
to mocking the game.

## Verifying by eye

The in-app browser pane runs with `document.hidden === true`, so
`requestAnimationFrame` is throttled to almost nothing. **A frozen-looking game
in a screenshot is usually the pane, not a bug.** Screenshots do push frames
through, so stepping with them works; anything about real motion has to be
checked by a human running `npm run dev`.

## Conventions

- Names say what they are; comments say *why*, never what.
- No dead configuration. If a knob stops being read, delete it — `lookahead` sat
  unread in the AI params for a long time and made the ladder look deeper than
  it was.
- Fix findings at the root rather than silencing them. The lint rules that were
  turned off are turned off in one place, with the reason written down.
