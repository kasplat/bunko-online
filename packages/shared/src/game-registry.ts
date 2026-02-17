export interface GameTiming {
  mode: "realtime" | "turnbased";
  /** Tick rate in Hz for realtime games */
  tickRate?: number;
  /** Broadcast rate in Hz for realtime games (can be lower than tickRate) */
  broadcastRate?: number;
  /** Max game duration in seconds (0 = unlimited) */
  maxDurationSecs: number;
}

export interface GameMeta {
  gameId: string;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  timing: GameTiming;
}

/** Single source of truth for all game metadata. */
export const GAME_META: Record<string, GameMeta> = {
  "type-racer": {
    gameId: "type-racer",
    displayName: "Type Racer",
    description: "Race to type a paragraph the fastest!",
    minPlayers: 1,
    maxPlayers: 10,
    timing: { mode: "turnbased", maxDurationSecs: 60 },
  },
  "reaction-speed": {
    gameId: "reaction-speed",
    displayName: "Reaction Speed",
    description: "Tap as fast as you can when the screen turns green!",
    minPlayers: 1,
    maxPlayers: 100,
    timing: { mode: "realtime", tickRate: 20, broadcastRate: 10, maxDurationSecs: 120 },
  },
};

export function getAvailableGames(): GameMeta[] {
  return Object.values(GAME_META);
}

export function getGameMeta(gameId: string): GameMeta | undefined {
  return GAME_META[gameId];
}
