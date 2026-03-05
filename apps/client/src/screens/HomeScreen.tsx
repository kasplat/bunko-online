import { useMemo, useState } from "react";
import { audioManager } from "../audio";

const SUBTITLES = [
  "Fun fact: Bunko eats ass",
  "Have you read The Power Broker?",
  "Go touch grass",
];

const DEFAULT_NAMES = [
  "Monkey",
  "Donkey",
  "Banana",
  "Chimp",
  "Gorilla",
  "Bonobo",
  "Gibbon",
  "Baboon",
];

const GIFS = [
  "https://media.tenor.com/Tq2fqZg90pUAAAAi/monkey-dance.gif",
  "https://media1.tenor.com/m/Bh6YThOUYC4AAAAC/funny-monkey-everyday-monkey-dancing.gif",
  "https://media.tenor.com/QpSztqdVO0wAAAAj/donkey-kong-dk-rap.gif",
  "https://media.tenor.com/Zv1Eic3ki0kAAAAi/beanie-monkey.gif",
  "https://media1.tenor.com/m/DvQHTFUt9Q8AAAAC/radicord-diddy-kong.gif",
];

interface Props {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const defaultName = useMemo(
    () => DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)],
    [],
  );
  const subtitle = useMemo(
    () => SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)],
    [],
  );
  const gif = useMemo(
    () => GIFS[Math.floor(Math.random() * GIFS.length)],
    [],
  );

  return (
    <div className="screen home-screen">
      <img
        src={gif}
        alt="Dancing monkey"
        style={{ width: 80, height: 80 }}
      />
      <h1>Bunko</h1>
      <p style={{ opacity: 0.6, fontStyle: "italic", marginTop: -8 }}>{subtitle}</p>
      <input
        type="text"
        placeholder={defaultName}
        value={name}
        onChange={(e) => {
          if (e.target.value.length > name.length) {
            audioManager.play("/gunshot.mp3");
          }
          setName(e.target.value);
        }}
        maxLength={20}
      />
      <div className="actions">
        <button
          onClick={() => {
            audioManager.play("/create-room.mp3");
            onCreateRoom(name.trim() || defaultName);
          }}
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
            disabled={roomCode.length < 4}
            onClick={() => onJoinRoom(name.trim() || defaultName, roomCode)}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
