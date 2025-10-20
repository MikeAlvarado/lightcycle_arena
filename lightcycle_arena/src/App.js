// src/App.js
import React from 'react';
import { GameCanvas } from './components/GameCanvas';

function App() {
  return (
    <main
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
      }}
    >
      <section style={{ width: '100%', maxWidth: 900 }}>
        <header style={{ marginBottom: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Lightcycle Arena</h1>
        </header>

        <GameCanvas />
      </section>
    </main>
  );
}

export default App;
