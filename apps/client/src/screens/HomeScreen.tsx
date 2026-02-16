import { useState } from "react";

interface Props {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  return (
    <div className="screen home-screen">
      <h1>Bunko</h1>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
      />
      <div className="actions">
        <button
          disabled={!name.trim()}
          onClick={() => onCreateRoom(name.trim())}
        >
          Create Room
        </button>
        <div className="join-section">
          <input
            type="text"
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={4}
          />
          <button
            disabled={!name.trim() || roomCode.length < 4}
            onClick={() => onJoinRoom(name.trim(), roomCode)}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
