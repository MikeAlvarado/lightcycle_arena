import { GameUI } from "./components/GameUI";
import { GameCanvas } from "./components/GameCanvas";

export default function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <GameUI score={0} lives={3} highScore={2000} />
      <GameCanvas />
    </div>
  );
}
