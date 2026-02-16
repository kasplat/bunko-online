import { useEffect, useRef, useState } from "react";
import type {
  S2C_RoomState,
  ClientMessagePayload,
  ServerMessage,
} from "@bunko/shared";
import { createClientModule } from "../game/game-registry";
import type { ClientGameModule } from "../game/game-renderer";

interface Props {
  roomState: S2C_RoomState;
  gameConfig: { gameId: string; config: unknown; countdownSecs: number } | null;
  myId: string | null;
  send: (msg: ClientMessagePayload) => void;
  subscribe: (handler: (msg: ServerMessage) => void) => () => void;
}

export function GameScreen({
  roomState,
  gameConfig,
  myId,
  send,
  subscribe,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const moduleRef = useRef<ClientGameModule | null>(null);
  const rafRef = useRef<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Handle countdown
  useEffect(() => {
    if (roomState.phase === "playing") {
      setCountdown(null);
      return;
    }
    if (roomState.phase !== "countdown" || !gameConfig) return;

    let remaining = gameConfig.countdownSecs;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        setCountdown(null);
        clearInterval(interval);
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [roomState.phase, gameConfig]);

  // Mount game module when playing starts
  useEffect(() => {
    if (roomState.phase !== "playing" || !gameConfig || !containerRef.current)
      return;

    const module = createClientModule(gameConfig.gameId);
    if (!module) return;

    moduleRef.current = module;

    const sendInput = (input: unknown) => {
      send({
        type: "c2s:game_input",
        gameId: gameConfig.gameId,
        payload: input,
      });
    };

    module.mount(
      containerRef.current,
      gameConfig.config,
      sendInput,
      () => myId ?? "",
    );

    // Animation frame loop
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      module.onFrame?.(dt);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Subscribe to game state updates
    const unsub = subscribe((msg) => {
      if (msg.type === "s2c:game_state") {
        moduleRef.current?.onStateUpdate(msg.state, msg.isDelta);
      }
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      unsub();
      module.unmount();
      moduleRef.current = null;
    };
  }, [roomState.phase, gameConfig, myId, send, subscribe]);

  return (
    <div className="screen game-screen">
      {countdown !== null && (
        <div className="countdown-overlay">
          <span className="countdown-number">{countdown}</span>
        </div>
      )}
      <div ref={containerRef} className="game-container" />
    </div>
  );
}
