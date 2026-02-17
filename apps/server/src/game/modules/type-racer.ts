import type { PlayerInfo, GameResult } from "@bunko/shared";
import { GAME_META } from "@bunko/shared";
import type { ServerGameModule } from "../game-engine.js";

const SHORT_PASSAGES = [
  "The quick brown fox jumps over the lazy dog.",
  "How vexingly quick daft zebras jump.",
  "Pack my box with five dozen liquor jugs.",
  "Six big juicy steaks sizzled in the pan.",
  "The job requires extra pluck and zeal.",
];

const MEDIUM_PASSAGES = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
  "How vexingly quick daft zebras jump. The five boxing wizards jump quickly at dawn.",
  "Amazingly few discotheques provide jukeboxes. Crazy Frederick bought many very exquisite opal jewels.",
  "The wizard quickly jinxed the gnomes before they vaporized. Six big juicy steaks sizzled in the pan.",
  "Grumpy wizards make toxic brew for the evil queen and jack. The job requires extra pluck and zeal.",
];

const LONG_PASSAGES = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. The five boxing wizards jump quickly at dawn.",
  "Amazingly few discotheques provide jukeboxes. Crazy Frederick bought many very exquisite opal jewels. The wizard quickly jinxed the gnomes before they vaporized. Six big juicy steaks sizzled in the pan.",
  "We promptly judged antique ivory buckles for the next prize. A quart jar of oil mixed with zinc oxide makes a bright paint. Grumpy wizards make toxic brew for the evil queen and jack. The job requires extra pluck and zeal.",
];

const PASSAGES_BY_LENGTH: Record<string, string[]> = {
  short: SHORT_PASSAGES,
  medium: MEDIUM_PASSAGES,
  long: LONG_PASSAGES,
};

interface PlayerState {
  id: string;
  name: string;
  typed: string;
  wpm: number;
  finished: boolean;
  finishTime: number | null;
}

interface TypeRacerState {
  text: string;
  players: Map<string, PlayerState>;
  startTime: number;
  durationSecs: number;
}

interface TypeRacerConfig {
  text: string;
  durationSecs: number;
}

interface TypeRacerInput {
  typed: string;
}

interface TypeRacerBroadcast {
  text: string;
  players: Array<{
    id: string;
    name: string;
    progress: number;
    wpm: number;
    finished: boolean;
  }>;
  elapsedSecs: number;
  durationSecs: number;
}

export class TypeRacerModule
  implements ServerGameModule<TypeRacerState, TypeRacerInput, TypeRacerConfig>
{
  readonly gameId = "type-racer";

  init(players: PlayerInfo[], settings?: Record<string, unknown>): {
    state: TypeRacerState;
    config: TypeRacerConfig;
  } {
    const passageLength = typeof settings?.passageLength === "string" ? settings.passageLength : "medium";
    const passages = PASSAGES_BY_LENGTH[passageLength] ?? MEDIUM_PASSAGES;
    const text = passages[Math.floor(Math.random() * passages.length)];

    const playerMap = new Map<string, PlayerState>();
    for (const p of players) {
      playerMap.set(p.id, {
        id: p.id,
        name: p.name,
        typed: "",
        wpm: 0,
        finished: false,
        finishTime: null,
      });
    }

    const defaultDuration = GAME_META[this.gameId].timing.maxDurationSecs;
    const timeLimitSecs = typeof settings?.timeLimit === "number" ? settings.timeLimit : defaultDuration;
    const durationSecs = Math.max(15, Math.min(timeLimitSecs, 300));
    return {
      state: {
        text,
        players: playerMap,
        startTime: Date.now(),
        durationSecs,
      },
      config: { text, durationSecs },
    };
  }

  onInput(
    state: TypeRacerState,
    playerId: string,
    input: unknown,
  ): TypeRacerState {
    const player = state.players.get(playerId);
    if (!player || player.finished) return state;

    // Validate input shape and bounds
    if (!isTypeRacerInput(input)) return state;
    if (input.typed.length > state.text.length) return state;

    const typed = input.typed;

    // Validate: typed text must be a prefix of the target text
    if (!state.text.startsWith(typed)) return state;

    player.typed = typed;

    // Calculate WPM
    const elapsedMs = Date.now() - state.startTime;
    const elapsedMin = elapsedMs / 60000;
    if (elapsedMin > 0) {
      const wordCount = typed.split(/\s+/).filter(Boolean).length;
      player.wpm = Math.round(wordCount / elapsedMin);
    }

    // Check if finished
    if (typed === state.text) {
      player.finished = true;
      player.finishTime = Date.now();
    }

    return state;
  }

  serialize(
    state: TypeRacerState,
    _prev: TypeRacerState | null,
  ): { data: TypeRacerBroadcast; isDelta: boolean } {
    const players = [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      progress: state.text.length > 0 ? p.typed.length / state.text.length : 0,
      wpm: p.wpm,
      finished: p.finished,
    }));

    return {
      data: {
        text: state.text,
        players,
        elapsedSecs: (Date.now() - state.startTime) / 1000,
        durationSecs: state.durationSecs,
      },
      isDelta: false,
    };
  }

  isGameOver(state: TypeRacerState): boolean {
    const allFinished = [...state.players.values()].every((p) => p.finished);
    const timedOut =
      Date.now() - state.startTime > state.durationSecs * 1000;
    return allFinished || timedOut;
  }

  getResults(state: TypeRacerState): GameResult[] {
    const players = [...state.players.values()];

    // Sort: finished players by finish time, then unfinished by progress
    players.sort((a, b) => {
      if (a.finished && b.finished) {
        return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.typed.length - a.typed.length;
    });

    return players.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      score: p.finished
        ? Math.max(100 - i * 20, 10)
        : Math.round((p.typed.length / state.text.length) * 50),
      rank: i + 1,
      stats: { wpm: p.wpm, progress: p.typed.length / state.text.length },
    }));
  }

  onPlayerDisconnect(
    state: TypeRacerState,
    playerId: string,
  ): TypeRacerState {
    const player = state.players.get(playerId);
    if (player) player.finished = true;
    return state;
  }
}

function isTypeRacerInput(input: unknown): input is TypeRacerInput {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as TypeRacerInput).typed === "string"
  );
}
