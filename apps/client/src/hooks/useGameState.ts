import { useEffect, useRef, useState } from "react";
import type {
  ServerMessage,
  S2C_RoomState,
  GameResult,
} from "@bunko/shared";

type MessageHandler = (msg: ServerMessage) => void;

export function useGameState(subscribe: (handler: MessageHandler) => () => void) {
  const [roomState, setRoomState] = useState<S2C_RoomState | null>(null);
  const [gameConfig, setGameConfig] = useState<{ gameId: string; config: unknown; countdownSecs: number } | null>(null);
  const [gameResults, setGameResults] = useState<GameResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = setTimeout(() => {
            setError(null);
            errorTimeoutRef.current = null;
          }, 3000);
          break;
      }
    });
  }, [subscribe]);

  return { roomState, gameConfig, gameResults, error };
}
