import type { GameResult, PlayerInfo } from "@bunko/shared";

interface Props {
  results: GameResult[] | null;
  sessionScores: Record<string, number>;
  players: PlayerInfo[];
}

export function ResultsScreen({ results, sessionScores, players }: Props) {
  const sorted = results ? [...results].sort((a, b) => a.rank - b.rank) : [];

  return (
    <div className="screen results-screen">
      <h2>Results</h2>

      {sorted.length > 0 && (
        <div className="results-table">
          {sorted.map((r, i) => (
            <div key={r.playerId} className={`result-row rank-${r.rank}`}>
              <span className="rank">#{r.rank}</span>
              <span className="name">{r.playerName}</span>
              <span className="score">{r.score} pts</span>
            </div>
          ))}
        </div>
      )}

      <div className="session-scores">
        <h3>Session Scores</h3>
        {players
          .map((p) => ({ name: p.name, score: sessionScores[p.id] ?? 0 }))
          .sort((a, b) => b.score - a.score)
          .map((p) => (
            <div key={p.name} className="session-row">
              <span>{p.name}</span>
              <span>{p.score} pts</span>
            </div>
          ))}
      </div>

      <p className="returning">Returning to lobby...</p>
    </div>
  );
}
