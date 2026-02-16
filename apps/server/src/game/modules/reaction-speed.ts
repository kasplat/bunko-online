import type { PlayerInfo, GameResult, GameTiming } from "@bunko/shared";
import type { ServerGameModule } from "../game-engine.js";

const TOTAL_ROUNDS = 5;
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
const FALSE_START_PENALTY_MS = 500;

interface PlayerState {
  id: string;
  name: string;
  reactionTimes: number[]; // ms per round (-1 = false start, 0 = not yet)
  tappedThisRound: boolean;
}

interface ReactionState {
  players: Map<string, PlayerState>;
  round: number;
  roundStartedAt: number; // when the round was initiated (waiting phase)
  signalAt: number; // when the signal fires (roundStartedAt + random delay)
  signalShown: boolean;
  roundOver: boolean;
  finished: boolean;
}

interface ReactionConfig {
  totalRounds: number;
}

interface ReactionInput {
  action: "tap";
}

interface ReactionBroadcast {
  round: number;
  totalRounds: number;
  signalShown: boolean;
  roundOver: boolean;
  finished: boolean;
  players: Array<{
    id: string;
    name: string;
    reactionTimes: number[];
    tappedThisRound: boolean;
    avgMs: number;
  }>;
}

export class ReactionSpeedModule
  implements ServerGameModule<ReactionState, ReactionInput, ReactionConfig>
{
  readonly gameId = "reaction-speed";
  readonly displayName = "Reaction Speed";
  readonly minPlayers = 1;
  readonly maxPlayers = 10;
  readonly timing: GameTiming = {
    mode: "realtime",
    tickRate: 20,
    broadcastRate: 10,
    maxDurationSecs: 120,
  };

  init(players: PlayerInfo[]): {
    state: ReactionState;
    config: ReactionConfig;
  } {
    const playerMap = new Map<string, PlayerState>();
    for (const p of players) {
      playerMap.set(p.id, {
        id: p.id,
        name: p.name,
        reactionTimes: [],
        tappedThisRound: false,
      });
    }

    const now = Date.now();
    const delay = randomDelay();

    return {
      state: {
        players: playerMap,
        round: 1,
        roundStartedAt: now,
        signalAt: now + delay,
        signalShown: false,
        roundOver: false,
        finished: false,
      },
      config: { totalRounds: TOTAL_ROUNDS },
    };
  }

  onInput(
    state: ReactionState,
    playerId: string,
    input: unknown,
  ): ReactionState {
    if (!isReactionInput(input)) return state;
    if (state.finished || state.roundOver) return state;

    const player = state.players.get(playerId);
    if (!player || player.tappedThisRound) return state;

    const now = Date.now();
    player.tappedThisRound = true;

    if (!state.signalShown) {
      // False start — tapped before signal
      player.reactionTimes.push(-1);
    } else {
      // Valid tap — record reaction time
      const reactionMs = now - state.signalAt;
      player.reactionTimes.push(reactionMs);
    }

    // Check if all players have tapped
    const allTapped = [...state.players.values()].every(
      (p) => p.tappedThisRound,
    );
    if (allTapped) {
      state.roundOver = true;
    }

    return state;
  }

  tick(state: ReactionState, _dt: number): ReactionState {
    if (state.finished) return state;

    const now = Date.now();

    // Show signal when delay has elapsed
    if (!state.signalShown && now >= state.signalAt) {
      state.signalShown = true;
    }

    // Auto-end round after 3 seconds of signal shown (timeout for slow players)
    if (state.signalShown && !state.roundOver) {
      const elapsed = now - state.signalAt;
      if (elapsed > 3000) {
        // Give remaining players a timeout time
        for (const p of state.players.values()) {
          if (!p.tappedThisRound) {
            p.tappedThisRound = true;
            p.reactionTimes.push(3000);
          }
        }
        state.roundOver = true;
      }
    }

    // Advance to next round after a short pause
    if (state.roundOver) {
      const lastTapTime = Math.max(
        ...([...state.players.values()].map((p) => {
          const last = p.reactionTimes[p.reactionTimes.length - 1];
          return last === -1 ? 0 : last;
        })),
      );
      // Wait 1.5s after round ends before starting next
      const roundEndTime = state.signalAt + lastTapTime;
      if (now - roundEndTime > 1500 || now - state.signalAt > 5000) {
        if (state.round >= TOTAL_ROUNDS) {
          state.finished = true;
        } else {
          state.round++;
          state.roundStartedAt = now;
          state.signalAt = now + randomDelay();
          state.signalShown = false;
          state.roundOver = false;
          for (const p of state.players.values()) {
            p.tappedThisRound = false;
          }
        }
      }
    }

    return state;
  }

  serialize(
    state: ReactionState,
    _prev: ReactionState | null,
  ): { data: ReactionBroadcast; isDelta: boolean } {
    const players = [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      reactionTimes: p.reactionTimes,
      tappedThisRound: p.tappedThisRound,
      avgMs: getAverageReaction(p.reactionTimes),
    }));

    return {
      data: {
        round: state.round,
        totalRounds: TOTAL_ROUNDS,
        signalShown: state.signalShown,
        roundOver: state.roundOver,
        finished: state.finished,
        players,
      },
      isDelta: false,
    };
  }

  isGameOver(state: ReactionState): boolean {
    return state.finished;
  }

  getResults(state: ReactionState): GameResult[] {
    const players = [...state.players.values()];

    // Sort by average reaction time (lower is better, -1 penalties count as 500ms)
    players.sort((a, b) => {
      return getAverageReaction(a.reactionTimes) - getAverageReaction(b.reactionTimes);
    });

    return players.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      score: Math.max(100 - i * 20, 10),
      rank: i + 1,
      stats: {
        avgMs: getAverageReaction(p.reactionTimes),
        falseStarts: p.reactionTimes.filter((t) => t === -1).length,
      },
    }));
  }

  onPlayerDisconnect(
    state: ReactionState,
    playerId: string,
  ): ReactionState {
    const player = state.players.get(playerId);
    if (player && !player.tappedThisRound) {
      player.tappedThisRound = true;
      player.reactionTimes.push(3000);
    }
    return state;
  }
}

function randomDelay(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function getAverageReaction(times: number[]): number {
  if (times.length === 0) return 9999;
  const adjusted = times.map((t) =>
    t === -1 ? FALSE_START_PENALTY_MS : t,
  );
  return Math.round(adjusted.reduce((a, b) => a + b, 0) / adjusted.length);
}

function isReactionInput(input: unknown): input is ReactionInput {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as ReactionInput).action === "tap"
  );
}
