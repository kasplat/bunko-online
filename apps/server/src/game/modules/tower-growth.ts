import type { PlayerInfo, GameResult } from "@bunko/shared";
import type { ServerGameModule } from "../game-engine.js";

const DEFAULT_TARGET_HEIGHT = 500;
const GROWTH_PER_TAP = 10;
const SHRINK_PER_TAP = 20;
const MIN_LIGHT_DURATION_MS = 2000;
const MAX_LIGHT_DURATION_MS = 5000;
const MAX_DURATION_MS = 120_000;
const MIN_HEIGHT = 0;

interface PlayerState {
  id: string;
  name: string;
  height: number;
  tapCount: number;
  penaltyCount: number;
}

interface TowerState {
  players: Map<string, PlayerState>;
  lightColor: "green" | "red";
  lightChangedAt: number;
  nextLightChangeAt: number;
  targetHeight: number;
  startedAt: number;
  finished: boolean;
  winnerId: string | null;
}

interface TowerConfig {
  targetHeight: number;
}

interface TowerInput {
  action: "tap";
}

interface TowerBroadcast {
  players: Array<{
    id: string;
    name: string;
    height: number;
    tapCount: number;
    penaltyCount: number;
  }>;
  lightColor: "green" | "red";
  targetHeight: number;
  finished: boolean;
  winnerId: string | null;
}

export class TowerGrowthModule
  implements ServerGameModule<TowerState, TowerInput, TowerConfig>
{
  readonly gameId = "tower-growth";

  init(
    players: PlayerInfo[],
    settings?: Record<string, unknown>,
  ): { state: TowerState; config: TowerConfig } {
    const playerMap = new Map<string, PlayerState>();
    for (const p of players) {
      playerMap.set(p.id, {
        id: p.id,
        name: p.name,
        height: 0,
        tapCount: 0,
        penaltyCount: 0,
      });
    }

    let targetHeight = DEFAULT_TARGET_HEIGHT;
    if (settings && typeof settings.targetHeight === "number") {
      targetHeight = Math.max(100, Math.min(10000, settings.targetHeight));
    }

    const now = Date.now();

    return {
      state: {
        players: playerMap,
        lightColor: "red",
        lightChangedAt: now,
        nextLightChangeAt: now + randomLightDuration(),
        targetHeight,
        startedAt: now,
        finished: false,
        winnerId: null,
      },
      config: { targetHeight },
    };
  }

  onInput(state: TowerState, playerId: string, input: unknown): TowerState {
    if (!isTowerInput(input)) return state;
    if (state.finished) return state;

    const player = state.players.get(playerId);
    if (!player) return state;

    if (state.lightColor === "green") {
      player.height += GROWTH_PER_TAP;
      player.tapCount++;

      if (player.height >= state.targetHeight) {
        player.height = state.targetHeight;
        state.finished = true;
        state.winnerId = playerId;
      }
    } else {
      player.height = Math.max(MIN_HEIGHT, player.height - SHRINK_PER_TAP);
      player.penaltyCount++;
    }

    return state;
  }

  tick(state: TowerState, _dt: number): TowerState {
    if (state.finished) return state;

    const now = Date.now();

    if (now >= state.nextLightChangeAt) {
      state.lightColor = state.lightColor === "green" ? "red" : "green";
      state.lightChangedAt = now;
      state.nextLightChangeAt = now + randomLightDuration();
    }

    if (now - state.startedAt >= MAX_DURATION_MS) {
      state.finished = true;
    }

    return state;
  }

  serialize(
    state: TowerState,
    _prev: TowerState | null,
  ): { data: TowerBroadcast; isDelta: boolean } {
    const players = [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      height: p.height,
      tapCount: p.tapCount,
      penaltyCount: p.penaltyCount,
    }));

    return {
      data: {
        players,
        lightColor: state.lightColor,
        targetHeight: state.targetHeight,
        finished: state.finished,
        winnerId: state.winnerId,
      },
      isDelta: false,
    };
  }

  isGameOver(state: TowerState): boolean {
    return state.finished;
  }

  getResults(state: TowerState): GameResult[] {
    const players = [...state.players.values()];

    players.sort((a, b) => {
      if (a.id === state.winnerId) return -1;
      if (b.id === state.winnerId) return 1;
      return b.height - a.height;
    });

    return players.map((p, i) => {
      let score: number;
      if (p.id === state.winnerId) {
        score = 100;
      } else {
        score = Math.max(10, Math.round((p.height / state.targetHeight) * 80));
      }

      return {
        playerId: p.id,
        playerName: p.name,
        score,
        rank: i + 1,
        stats: {
          height: p.height,
          tapCount: p.tapCount,
          penaltyCount: p.penaltyCount,
        },
      };
    });
  }

  onPlayerDisconnect(state: TowerState, _playerId: string): TowerState {
    return state;
  }
}

function randomLightDuration(): number {
  return (
    MIN_LIGHT_DURATION_MS +
    Math.random() * (MAX_LIGHT_DURATION_MS - MIN_LIGHT_DURATION_MS)
  );
}

function isTowerInput(input: unknown): input is TowerInput {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as TowerInput).action === "tap"
  );
}
