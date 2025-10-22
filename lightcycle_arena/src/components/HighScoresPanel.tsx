// src/components/HighScoresPanel.tsx
import type { HighScoreEntry } from "../types/game";

interface HighScoresPanelProps {
  entries: HighScoreEntry[];
  maxRows?: number;
}

/**
 * Renders a compact leaderboard table.
 * Defaults to top 5 entries to keep the HUD clean.
 */
export function HighScoresPanel({
  entries,
  maxRows = 5,
}: HighScoresPanelProps): JSX.Element {
  const visibleEntries = entries.slice(0, maxRows);

  function formatScore(scoreValue: number): string {
    return scoreValue.toString().padStart(8, "0");
  }

  return (
    <div className="leaderboard" aria-label="Leaderboard">
      <div className="leaderboard-header">
        <h3 className="leaderboard-title">Leaderboard</h3>
        <p className="leaderboard-subtitle">Top {visibleEntries.length}</p>
      </div>

      <table className="leaderboard-table" role="table">
        <thead>
          <tr>
            <th className="leaderboard-rank">#</th>
            <th>Name</th>
            <th className="leaderboard-score">Score</th>
          </tr>
        </thead>
        <tbody>
          {visibleEntries.map((entry, index) => (
            <tr key={`${entry.name}-${entry.score}-${index}`}>
              <td className="leaderboard-rank">{index + 1}</td>
              <td className="leaderboard-name">{entry.name}</td>
              <td className="leaderboard-score">{formatScore(entry.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
