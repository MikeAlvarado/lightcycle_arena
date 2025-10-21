import { GameCanvas } from "./components/GameCanvas";

/**
 * App
 * ---
 * Root component that renders the Lightcycle Arena canvas.
 */
function App(): JSX.Element {
  return (
    <main className="app-root">
      <header className="app-header">
        <h1 className="app-title">Lightcycle Arena</h1>
      </header>

      <section className="app-stage">
        <GameCanvas />
      </section>
    </main>
  );
}

export default App;