# 🏍️ Lightcycle Arena

**Play here → [tron-lightcycle.web.app](https://tron-lightcycle.web.app/)**  
A retro-inspired **Tron-style lightcycle** game built with **React + TypeScript**, featuring a lattice-based grid system, AI opponents, and local persistence for player highscores.

---

## 🎮 How to Play

- Use the **arrow keys** (or the on-screen D-Pad on mobile) to move your lightcycle.
- Avoid hitting walls or trails — both yours and your opponent’s.
- Survive as long as possible to gain points.
- Win a round to advance to the next level.
- Lose all lives and your run ends — you’ll be prompted to save your score locally.

Each level increases AI difficulty and point multipliers.

---

## ⚙️ Core Mechanics

### Lattice-Based Movement

Unlike a standard cell grid, **Lightcycle Arena** uses a _lattice_ —  
a doubled grid that distinguishes **vertices** (cycle positions) from **edges** (trail paths).

```ts
// Example lattice setup
const lattice = createEmptyLattice(rows, columns);
const { traversedEdgeCellInLattice, destinationVertexInLattice } =
  stepOnLattice(currentPosition, direction);
```

This allows precise control for:

- Drawing trails along **edges** (instead of over cell centers)
- Detecting **edge collisions** (as in the original Tron bikes)
- Smooth separation between **movement** and **occupancy**

---

### Player & AI Logic

Each player is modeled with a clear interface:

```ts
interface Player {
  id: number;
  name: string;
  color: string;
  headLatticeIndex: LatticeIndex;
  direction: Direction;
  pendingDirection: Direction;
  isAlive: boolean;
  ticksSurvived: number;
}
```

AI behavior is difficulty-based:

```ts
export const AI_PARAMS = {
  Easy: { decisionEveryNTicks: 4, randomness: 0.1, lookahead: 1 },
  Normal: { decisionEveryNTicks: 3, randomness: 0.08, lookahead: 2 },
  Hard: { decisionEveryNTicks: 2, randomness: 0.05, lookahead: 3 },
  VeryHard: { decisionEveryNTicks: 1, randomness: 0.03, lookahead: 4 },
  Insane: { decisionEveryNTicks: 0, randomness: 0.01, lookahead: 5 },
};
```

AI evaluates safe directions, avoids walls and trails, and reacts faster at higher levels.

---

## 🧠 Game Loop

- Runs at **10 logic updates per second**.
- Separates physics (logic) and rendering (draw calls) via `requestAnimationFrame`.
- Uses `useRef` extensively for performant mutable state.

```ts
while (accumulatedMilliseconds.current >= logicStepMilliseconds) {
  updateLogic();
  accumulatedMilliseconds.current -= logicStepMilliseconds;
}
drawFrame(...);
```

---

## 🏁 Scoring System

| Event            | Points                     |
| ---------------- | -------------------------- |
| Survive 1 second | 50 → 250 (scales by level) |
| Clear a level    | 1,000 → 10,000             |
| Lose all lives   | Run ends, prompt for name  |
| Beat all levels  | “Champion” run completion  |

Scores persist locally using `localStorage`.

---

## 💾 Local Persistence

```ts
savePlayerName(name);
tryInsertHighScore({ name, score, dateISO });
loadHighScores();
```

Highscores are displayed with seeded entries:
**Flynn**, **Tron**, **Clu**, **Alan**, and **Yori**.

---

## 📱 Responsive UI

- **Canvas** uses full viewport width (maintaining aspect ratio).
- **D-Pad Overlay** appears only on mobile and fills the remaining screen height.
- Layout handled via **Flexbox** with rounded corners and adaptive scaling.

---

## 🧩 Tech Stack

- **React 19 + TypeScript**
- **Canvas 2D API**
- **LocalStorage persistence**
- **Custom lattice math utilities**
- **Firebase Hosting**

---

## 🧪 Local Development

```bash
# install dependencies
yarn install

# start dev server
yarn start
```

The app will run at `http://localhost:3000`.

---

## ✨ Future Improvements

????

---

**Made with ⚡ React and passion for classic games.**
