import { useState, useCallback } from "react";
import { usePartySocket } from "./hooks/usePartySocket";
import { useGameState } from "./hooks/useGameState";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { GameScreen } from "./screens/GameScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { generateRoomCode } from "@bunko/shared";

export function App() {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const { send, subscribe, connected } = usePartySocket(roomCode, playerName);
  const { roomState, gameConfig, gameResults, error } =
    useGameState(subscribe);

  // Server sends yourId in every room state update
  const myId = roomState?.yourId ?? null;

  const handleCreate = useCallback(
    (name: string) => {
      setPlayerName(name);
      setRoomCode(generateRoomCode());
    },
    [],
  );

  const handleJoin = useCallback(
    (name: string, code: string) => {
      setPlayerName(name);
      setRoomCode(code.toUpperCase());
    },
    [],
  );

  const handleLeave = useCallback(() => {
    send({ type: "c2s:leave_room" });
    setRoomCode(null);
  }, [send]);

  // Screen routing based on room phase
  if (!roomCode) {
    return (
      <div className="app">
        <HomeScreen onCreateRoom={handleCreate} onJoinRoom={handleJoin} />
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="app">
        <div className="screen">
          <p>{connected ? "Joining room..." : "Connecting..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {error && <div className="error-toast">{error}</div>}
      {roomState.phase === "lobby" && (
        <LobbyScreen
          roomState={roomState}
          myId={myId}
          send={send}
          onLeave={handleLeave}
        />
      )}
      {(roomState.phase === "countdown" || roomState.phase === "playing") && (
        <GameScreen
          roomState={roomState}
          gameConfig={gameConfig}
          myId={myId}
          send={send}
          subscribe={subscribe}
        />
      )}
      {roomState.phase === "results" && (
        <ResultsScreen
          results={gameResults}
          sessionScores={roomState.sessionScores}
          players={roomState.players}
        />
      )}
    </div>
  );
}
