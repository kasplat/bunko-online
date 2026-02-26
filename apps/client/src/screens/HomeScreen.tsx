import { useMemo, useState } from "react";

const SUBTITLES = [
  "Fun fact: Bunko eats ass",
  "Have you read The Power Broker?",
  "Go touch grass",
];

interface Props {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const subtitle = useMemo(
    () => SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)],
    [],
  );

  return (
    <div className="screen home-screen">
      <img
        src="https://media.tenor.com/Tq2fqZg90pUAAAAi/monkey-dance.gif"
        alt="Dancing monkey"
        style={{ width: 80, height: 80 }}
      />
      <h1>Bunko</h1>
      <p style={{ opacity: 0.6, fontStyle: "italic", marginTop: -8 }}>{subtitle}</p>
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
