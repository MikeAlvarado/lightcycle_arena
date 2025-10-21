// src/components/GameUI.tsx
import "../styles/gameUI.css";

interface GameUIProps {
  score: number;
  lives: number;
  highScore: number;
}

export function GameUI({ score, lives, highScore }: GameUIProps): JSX.Element {
  const formattedScore = score.toString().padStart(8, "0");
  const formattedHighScore = highScore.toString().padStart(8, "0");
  const hearts = "❤".repeat(lives).padEnd(3, "♡");

  return (
    <div className="game-ui">
      <h1 className="game-title">Lightcycle Arena</h1>

      <div className="hud-container">
        <div className="hud-row">
          <span className="hud-lives">Lives: {hearts}</span>
          <span className="hud-highscore-label">High Score</span>
        </div>
        <div className="hud-row">
          <span className="hud-score">Score: {formattedScore}</span>
          <span className="hud-highscore-value">{formattedHighScore}</span>
        </div>
      </div>
    </div>
  );
}
