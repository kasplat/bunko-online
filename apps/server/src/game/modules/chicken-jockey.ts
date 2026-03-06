import type { PlayerInfo, GameResult } from "@bunko/shared";
import type { ServerGameModule } from "../game-engine.js";

const LANE_LENGTH = 1000;
const HALF_LANE = LANE_LENGTH / 2;
const MOVE_SPEED = 100; // units/sec
const BRAKE_DECEL = MOVE_SPEED / 0.75; // ~133.3 units/sec^2, full stop in 0.75s
const MAX_DURATION_MS = 30_000;
const CRASH_PENALTY = -30;
const CRASH_VICTIM_BONUS = 15;

// Scoring anchors: [progress ratio, score]
const SCORE_ANCHORS: [number, number][] = [
  [0, 0],
  [0.5, 10],
  [0.75, 50],
  [0.9, 90],
  [1.0, 100],
];

interface LanePlayer {
  id: string;
  name: string;
  distance: number;
  speed: number;
  braking: boolean;
  stopped: boolean;
  crashed: boolean;
  score: number;
}

interface Lane {
  laneIndex: number;
  playerA: LanePlayer;
  playerB: LanePlayer;
  resolved: boolean;
  resolvedAt: number;
}

interface ChickenState {
  lanes: Lane[];
  playerLaneMap: Map<string, number>;
  startedAt: number;
  finished: boolean;
}

interface ChickenConfig {
  pairings: Array<[string, string]>;
  playerNames: Record<string, string>;
  halfLane: number;
}

interface ChickenInput {
  action: "brake_start" | "brake_stop";
}

interface BroadcastPlayer {
  id: string;
  name: string;
  distance: number;
  speed: number;
  braking: boolean;
  stopped: boolean;
  crashed: boolean;
  score: number;
}

interface ChickenBroadcast {
  lanes: Array<{
    laneIndex: number;
    playerA: BroadcastPlayer;
    playerB: BroadcastPlayer;
    resolved: boolean;
  }>;
  finished: boolean;
}

export class ChickenJockeyModule
  implements ServerGameModule<ChickenState, ChickenInput, ChickenConfig>
{
  readonly gameId = "chicken-jockey";

  init(
    players: PlayerInfo[],
    _settings?: Record<string, unknown>,
  ): { state: ChickenState; config: ChickenConfig } {
    // Shuffle players randomly
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const lanes: Lane[] = [];
    const playerLaneMap = new Map<string, number>();
    const pairings: Array<[string, string]> = [];
    const playerNames: Record<string, string> = {};

    for (const p of players) {
      playerNames[p.id] = p.name;
    }

    // Pair sequentially (even count enforced by minPlayers: 2)
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const laneIndex = lanes.length;
      const a = shuffled[i];
      const b = shuffled[i + 1];

      lanes.push({
        laneIndex,
        playerA: makeLanePlayer(a.id, a.name),
        playerB: makeLanePlayer(b.id, b.name),
        resolved: false,
        resolvedAt: 0,
      });

      playerLaneMap.set(a.id, laneIndex);
      playerLaneMap.set(b.id, laneIndex);
      pairings.push([a.id, b.id]);
    }

    return {
      state: {
        lanes,
        playerLaneMap,
        startedAt: Date.now(),
        finished: false,
      },
      config: {
        pairings,
        playerNames,
        halfLane: HALF_LANE,
      },
    };
  }

  onInput(
    state: ChickenState,
    playerId: string,
    input: unknown,
  ): ChickenState {
    if (!isChickenInput(input)) return state;
    if (state.finished) return state;

    const laneIndex = state.playerLaneMap.get(playerId);
    if (laneIndex === undefined) return state;

    const lane = state.lanes[laneIndex];
    if (lane.resolved) return state;

    const player =
      lane.playerA.id === playerId ? lane.playerA : lane.playerB;
    if (player.stopped || player.crashed) return state;

    if (input.action === "brake_start") {
      player.braking = true;
    } else if (input.action === "brake_stop") {
      player.braking = false;
    }

    return state;
  }

  tick(state: ChickenState, dt: number): ChickenState {
    if (state.finished) return state;

    const now = Date.now();
    const timedOut = now - state.startedAt >= MAX_DURATION_MS;

    for (const lane of state.lanes) {
      if (lane.resolved) continue;

      // Advance physics for each player
      for (const player of [lane.playerA, lane.playerB]) {
        if (player.stopped || player.crashed) continue;

        if (timedOut) {
          player.speed = 0;
          player.stopped = true;
          continue;
        }

        if (player.braking) {
          player.speed = Math.max(0, player.speed - BRAKE_DECEL * dt);
          if (player.speed === 0) {
            player.stopped = true;
          }
        }

        player.distance += player.speed * dt;
      }

      // Check crash: both players' distances together exceed lane length
      const totalDistance = lane.playerA.distance + lane.playerB.distance;
      if (totalDistance >= LANE_LENGTH) {
        if (!lane.playerA.stopped) lane.playerA.crashed = true;
        if (!lane.playerB.stopped) lane.playerB.crashed = true;
        // Clamp distances
        lane.playerA.distance = Math.min(lane.playerA.distance, HALF_LANE);
        lane.playerB.distance = Math.min(lane.playerB.distance, HALF_LANE);
        scoreLane(lane);
        lane.resolved = true;
        lane.resolvedAt = now;
      }

      // Check if both stopped (no crash)
      if (
        !lane.resolved &&
        lane.playerA.stopped &&
        lane.playerB.stopped
      ) {
        scoreLane(lane);
        lane.resolved = true;
        lane.resolvedAt = now;
      }
    }

    // Check if all lanes resolved
    if (state.lanes.every((l) => l.resolved)) {
      state.finished = true;
    }

    return state;
  }

  serialize(
    state: ChickenState,
    _prev: ChickenState | null,
  ): { data: ChickenBroadcast; isDelta: boolean } {
    return {
      data: {
        lanes: state.lanes.map((lane) => ({
          laneIndex: lane.laneIndex,
          playerA: serializePlayer(lane.playerA),
          playerB: serializePlayer(lane.playerB),
          resolved: lane.resolved,
        })),
        finished: state.finished,
      },
      isDelta: false,
    };
  }

  isGameOver(state: ChickenState): boolean {
    return state.finished;
  }

  getResults(state: ChickenState): GameResult[] {
    const allPlayers: {
      id: string;
      name: string;
      score: number;
      distance: number;
      crashed: boolean;
    }[] = [];

    for (const lane of state.lanes) {
      for (const p of [lane.playerA, lane.playerB]) {
        allPlayers.push({
          id: p.id,
          name: p.name,
          score: p.score,
          distance: p.distance,
          crashed: p.crashed,
        });
      }
    }

    allPlayers.sort((a, b) => b.score - a.score);

    return allPlayers.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      score: Math.max(0, p.score),
      rank: i + 1,
      stats: {
        distance: Math.round(p.distance),
        progress: Math.round((p.distance / HALF_LANE) * 100),
        crashed: p.crashed,
      },
    }));
  }

  onPlayerDisconnect(
    state: ChickenState,
    playerId: string,
  ): ChickenState {
    const laneIndex = state.playerLaneMap.get(playerId);
    if (laneIndex === undefined) return state;

    const lane = state.lanes[laneIndex];
    const player =
      lane.playerA.id === playerId ? lane.playerA : lane.playerB;

    if (!player.stopped && !player.crashed) {
      player.speed = 0;
      player.stopped = true;
      player.braking = false;
    }

    return state;
  }
}

function makeLanePlayer(id: string, name: string): LanePlayer {
  return {
    id,
    name,
    distance: 0,
    speed: MOVE_SPEED,
    braking: false,
    stopped: false,
    crashed: false,
    score: 0,
  };
}

function serializePlayer(p: LanePlayer): BroadcastPlayer {
  return {
    id: p.id,
    name: p.name,
    distance: p.distance,
    speed: p.speed,
    braking: p.braking,
    stopped: p.stopped,
    crashed: p.crashed,
    score: p.score,
  };
}

export function computeScore(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return 0;
  if (p >= 1) return 100;

  for (let i = 1; i < SCORE_ANCHORS.length; i++) {
    if (p <= SCORE_ANCHORS[i][0]) {
      const [x0, y0] = SCORE_ANCHORS[i - 1];
      const [x1, y1] = SCORE_ANCHORS[i];
      const t = (p - x0) / (x1 - x0);
      return Math.round(y0 + t * (y1 - y0));
    }
  }

  return 100;
}

function scoreLane(lane: Lane): void {
  const a = lane.playerA;
  const b = lane.playerB;

  if (a.crashed && b.crashed) {
    a.score = CRASH_PENALTY;
    b.score = CRASH_PENALTY;
  } else if (a.crashed) {
    a.score = CRASH_PENALTY;
    b.score = computeScore(b.distance / HALF_LANE) + CRASH_VICTIM_BONUS;
  } else if (b.crashed) {
    b.score = CRASH_PENALTY;
    a.score = computeScore(a.distance / HALF_LANE) + CRASH_VICTIM_BONUS;
  } else {
    a.score = computeScore(a.distance / HALF_LANE);
    b.score = computeScore(b.distance / HALF_LANE);
  }
}

function isChickenInput(input: unknown): input is ChickenInput {
  return (
    typeof input === "object" &&
    input !== null &&
    ((input as ChickenInput).action === "brake_start" ||
      (input as ChickenInput).action === "brake_stop")
  );
}
