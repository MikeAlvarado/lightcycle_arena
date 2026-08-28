# Lightcycle Arena — app

The game itself. See the [repository README](../README.md) for how it plays and
how the lattice works.

## Stack

- **React 19** + **TypeScript**, bundled by **Vite**
- **three.js** for the 3D cockpit view, loaded on demand so the flat board
  never pays for it
- A headless **balance simulator** (`npm run simulate`): the arena's rules are
  pure functions, so the ladder can be measured instead of guessed at
- **Vitest** + Testing Library for tests, **ESLint** (flat config) for linting

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload on http://localhost:3000 (`npm start` is an alias) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the test suite once (`npm run test:watch` to keep it running) |
| `npm run simulate` | Play the bots against each other headlessly and print the balance tables |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over the whole project |

CI runs lint, typecheck, test and build on every push and pull request.

## Deploying

`dist/` is what Firebase Hosting serves (see `firebase.json`):

```bash
npm run build && firebase deploy
```
