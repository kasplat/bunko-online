import { useEffect, useRef, useCallback, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessagePayload, ServerMessage } from "@bunko/shared";

const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST ?? "localhost:1999";

type MessageHandler = (msg: ServerMessage) => void;

export function usePartySocket(roomCode: string | null, playerName: string) {
  const socketRef = useRef<PartySocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const [connected, setConnected] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!roomCode) return;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode,
      query: { name: playerName },
    });

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));

    socket.addEventListener("message", (e) => {
      try {
        const msg: ServerMessage = JSON.parse(e.data);
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[bunko] Failed to parse message:", err);
        }
      }
    });

    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
      handlersRef.current.clear();
      setConnected(false);
    };
  }, [roomCode, playerName]);

  const send = useCallback((msg: ClientMessagePayload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({ ...msg, seq: seqRef.current++ }),
      );
    }
  }, []);

  const subscribe = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { send, subscribe, connected };
}
