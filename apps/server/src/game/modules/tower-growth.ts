import type { PlayerInfo, GameResult } from "@bunko/shared";
import type { ServerGameModule } from "../game-engine.js";

const DEFAULT_TARGET_HEIGHT = 500;
const GROWTH_PER_TAP = 10;
const SHRINK_PER_TAP = 20;
const MIN_LIGHT_DURATION_MS = 2000;
const MAX_LIGHT_DURATION_MS = 5000;
const MAX_DURATION_MS = 120_000;
const MIN_HEIGHT = 0;
const DECAY_PER_SECOND = 2;

// Mario Kart / F1-inspired decreasing point table (up to 10 players)
const SCORE_TABLE = [100, 80, 65, 55, 45, 38, 32, 27, 23, 20];

interface PlayerState {
  id: string;
  name: string;
  height: number;
  tapCount: number;
  penaltyCount: number;
  finished: boolean;
}

interface TowerState {
  players: Map<string, PlayerState>;
  lightColor: "green" | "red";
  lightChangedAt: number;
  nextLightChangeAt: number;
  targetHeight: number;
  startedAt: number;
  finished: boolean;
  finishOrder: string[];
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
    finished: boolean;
    finishPosition: number;
  }>;
  lightColor: "green" | "red";
  targetHeight: number;
  finished: boolean;
  finishOrder: string[];
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
        finished: false,
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
        finishOrder: [],
      },
      config: { targetHeight },
    };
  }

  onInput(state: TowerState, playerId: string, input: unknown): TowerState {
    if (!isTowerInput(input)) return state;
    if (state.finished) return state;

    const player = state.players.get(playerId);
    if (!player) return state;
    if (player.finished) return state;

    if (state.lightColor === "green") {
      player.height += GROWTH_PER_TAP;
      player.tapCount++;

      if (player.height >= state.targetHeight) {
        player.height = state.targetHeight;
        player.finished = true;
        state.finishOrder.push(playerId);
        checkGameEnd(state);
      }
    } else {
      player.height = Math.max(MIN_HEIGHT, player.height - SHRINK_PER_TAP);
      player.penaltyCount++;
    }

    return state;
  }

  tick(state: TowerState, dt: number): TowerState {
    if (state.finished) return state;

    const now = Date.now();

    if (now >= state.nextLightChangeAt) {
      state.lightColor = state.lightColor === "green" ? "red" : "green";
      state.lightChangedAt = now;
      state.nextLightChangeAt = now + randomLightDuration();
    }

    // Passive decay for all unfinished players
    const decay = DECAY_PER_SECOND * dt;
    for (const p of state.players.values()) {
      if (!p.finished) {
        p.height = Math.max(MIN_HEIGHT, p.height - decay);
      }
    }

    if (now - state.startedAt >= MAX_DURATION_MS) {
      // Timeout: add unfinished players sorted by height desc
      const unfinished = [...state.players.values()]
        .filter((p) => !p.finished)
        .sort((a, b) => b.height - a.height);
      for (const p of unfinished) {
        p.finished = true;
        state.finishOrder.push(p.id);
      }
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
      finished: p.finished,
      finishPosition: state.finishOrder.indexOf(p.id) + 1, // 0 = not finished
    }));

    return {
      data: {
        players,
        lightColor: state.lightColor,
        targetHeight: state.targetHeight,
        finished: state.finished,
        finishOrder: state.finishOrder,
      },
      isDelta: false,
    };
  }

  isGameOver(state: TowerState): boolean {
    return state.finished;
  }

  getResults(state: TowerState): GameResult[] {
    return state.finishOrder.map((id, i) => {
      const player = state.players.get(id)!;
      const score =
        i < SCORE_TABLE.length
          ? SCORE_TABLE[i]
          : SCORE_TABLE[SCORE_TABLE.length - 1];

      return {
        playerId: player.id,
        playerName: player.name,
        score,
        rank: i + 1,
        stats: {
          height: player.height,
          tapCount: player.tapCount,
          penaltyCount: player.penaltyCount,
        },
      };
    });
  }

  onPlayerDisconnect(state: TowerState, _playerId: string): TowerState {
    return state;
  }
}

function checkGameEnd(state: TowerState): void {
  const unfinished = [...state.players.values()].filter((p) => !p.finished);
  if (unfinished.length === 0) {
    state.finished = true;
  } else if (unfinished.length === 1) {
    // Last player standing — auto-place them last
    unfinished[0].finished = true;
    state.finishOrder.push(unfinished[0].id);
    state.finished = true;
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
