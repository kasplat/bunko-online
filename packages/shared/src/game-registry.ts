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
