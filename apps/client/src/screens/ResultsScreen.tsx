import type { GameResult, PlayerInfo, ClientMessagePayload } from "@bunko/shared";

interface Props {
  results: GameResult[] | null;
  sessionScores: Record<string, number>;
  players: PlayerInfo[];
  myId: string | null;
  hostId: string;
  send: (msg: ClientMessagePayload) => void;
}

export function ResultsScreen({ results, sessionScores, players, myId, hostId, send }: Props) {
  const sorted = results ? [...results].sort((a, b) => a.rank - b.rank) : [];
  const isHost = myId === hostId;

  return (
    <div className="screen results-screen">
      <h2>Results</h2>

      {sorted.length > 0 && (
        <div className="results-table">
          {sorted.map((r) => (
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

      {isHost ? (
        <button
          className="return-lobby-btn"
          onClick={() => send({ type: "c2s:return_to_lobby" })}
        >
          Return to Lobby
        </button>
      ) : (
        <p className="returning">Waiting for host to return to lobby...</p>
      )}
    </div>
  );
}
