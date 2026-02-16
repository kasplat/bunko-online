import { useEffect, useState } from "react";
import type {
  ServerMessage,
  S2C_RoomState,
  S2C_GameStarting,
  S2C_GameOver,
  GameResult,
} from "@bunko/shared";

type MessageHandler = (msg: ServerMessage) => void;

export function useGameState(subscribe: (handler: MessageHandler) => () => void) {
  const [roomState, setRoomState] = useState<S2C_RoomState | null>(null);
  const [gameConfig, setGameConfig] = useState<{ gameId: string; config: unknown; countdownSecs: number } | null>(null);
  const [gameResults, setGameResults] = useState<GameResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribe((msg) => {
      switch (msg.type) {
        case "s2c:room_state":
          setRoomState(msg);
          if (msg.phase === "lobby") {
            setGameConfig(null);
            setGameResults(null);
          }
          break;
        case "s2c:game_starting":
          setGameConfig({
            gameId: msg.gameId,
            config: msg.config,
            countdownSecs: msg.countdownSecs,
          });
          setGameResults(null);
          break;
        case "s2c:game_over":
          setGameResults(msg.results);
          break;
        case "s2c:error":
          setError(msg.message);
          setTimeout(() => setError(null), 3000);
          break;
      }
    });
  }, [subscribe]);

  return { roomState, gameConfig, gameResults, error };
}
