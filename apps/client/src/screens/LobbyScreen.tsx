import type { S2C_RoomState, ClientMessagePayload } from "@bunko/shared";
import { getAvailableGames } from "../game/game-registry";

interface Props {
  roomState: S2C_RoomState;
  myId: string | null;
  send: (msg: ClientMessagePayload) => void;
  onLeave: () => void;
}

export function LobbyScreen({ roomState, myId, send, onLeave }: Props) {
  const isHost = myId === roomState.hostId;
  const me = roomState.players.find((p) => p.id === myId);
  const allReady = roomState.players.every((p) => p.ready);
  const games = getAvailableGames();
  const hasScores = Object.values(roomState.sessionScores).some((s) => s > 0);

  const leaderboard = roomState.players
    .map((p) => ({ name: p.name, id: p.id, score: roomState.sessionScores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="screen lobby-screen">
      <div className="room-header">
        <h2>Room: {roomState.roomCode}</h2>
        <button className="leave-btn" onClick={onLeave}>
          Leave
        </button>
      </div>

      <div className="lobby-body">
        <div className="lobby-main">
          <div className="player-list">
            <h3>Players</h3>
            {roomState.players.map((p) => (
              <div
                key={p.id}
                className={`player ${p.id === myId ? "me" : ""} ${!p.connected ? "disconnected" : ""}`}
              >
                <span className="player-name">
                  {p.name}
                  {p.id === roomState.hostId && " (host)"}
                  {p.id === myId && " (you)"}
                </span>
                <span className={`ready-badge ${p.ready ? "ready" : ""}`}>
                  {p.ready ? "Ready" : "Not ready"}
                </span>
              </div>
            ))}
          </div>

          {isHost && games.length > 0 && (
            <div className="game-select">
              <h3>Select Game</h3>
              <div className="game-list">
                {games.map((g) => (
                  <button
                    key={g.gameId}
                    className={`game-option ${roomState.selectedGameId === g.gameId ? "selected" : ""}`}
                    onClick={() =>
                      send({ type: "c2s:select_game", gameId: g.gameId })
                    }
                  >
                    <strong>{g.displayName}</strong>
                    <span>{g.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {roomState.selectedGameId === "type-racer" && (
            <div className="game-settings">
              <h3>Game Settings</h3>
              <div className="setting-row">
                <label>Passage Length</label>
                <div className="setting-options">
                  {(["short", "medium", "long"] as const).map((len) => (
                    <button
                      key={len}
                      className={`setting-option ${(roomState.gameSettings?.passageLength ?? "medium") === len ? "selected" : ""}`}
                      disabled={!isHost}
                      onClick={() =>
                        send({
                          type: "c2s:game_settings",
                          gameId: "type-racer",
                          settings: { ...roomState.gameSettings, passageLength: len },
                        })
                      }
                    >
                      {len.charAt(0).toUpperCase() + len.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <label>Time Limit</label>
                <div className="setting-options">
                  {([30, 60, 90, 120] as const).map((secs) => (
                    <button
                      key={secs}
                      className={`setting-option ${(roomState.gameSettings?.timeLimit ?? 60) === secs ? "selected" : ""}`}
                      disabled={!isHost}
                      onClick={() =>
                        send({
                          type: "c2s:game_settings",
                          gameId: "type-racer",
                          settings: { ...roomState.gameSettings, timeLimit: secs },
                        })
                      }
                    >
                      {secs}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isHost && roomState.selectedGameId && (
            <p className="selected-game">
              Game:{" "}
              {games.find((g) => g.gameId === roomState.selectedGameId)
                ?.displayName ?? roomState.selectedGameId}
            </p>
          )}

          {!isHost && !roomState.selectedGameId && (
            <p className="waiting">Waiting for host to select a game...</p>
          )}

          <div className="lobby-actions">
            {me && (
              <button
                className={me.ready ? "ready-btn active" : "ready-btn"}
                disabled={!roomState.selectedGameId}
                onClick={() => send({ type: "c2s:ready", ready: !me.ready })}
              >
                {me.ready ? "Unready" : "Ready Up"}
              </button>
            )}
            {isHost && (
              <button
                className="start-btn"
                disabled={!allReady || !roomState.selectedGameId}
                onClick={() => send({ type: "c2s:start_game" })}
              >
                Start Game
              </button>
            )}
          </div>
        </div>

        {hasScores && (
          <div className="lobby-sidebar">
            <div className="leaderboard">
              <h3>Leaderboard</h3>
              {leaderboard.map((p, i) => (
                <div
                  key={p.id}
                  className={`lb-row ${i === 0 ? "lb-first" : ""} ${p.id === myId ? "lb-me" : ""}`}
                >
                  <span className="lb-rank">#{i + 1}</span>
                  <span className="lb-name">{p.name}</span>
                  <span className="lb-score">{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
