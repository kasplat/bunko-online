import type { PlayerInfo, GameResult, GameTiming } from "@bunko/shared";

/** Server-side game module — each mini-game implements this */
export interface ServerGameModule<
  TState = unknown,
  TInput = unknown,
  TConfig = unknown,
> {
  readonly gameId: string;
  readonly displayName: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly timing: GameTiming;

  /** Called once when the game starts. Returns initial state + config sent to clients. */
  init(players: PlayerInfo[]): { state: TState; config: TConfig };

  /** Process a player's input. Returns updated state. */
  onInput(state: TState, playerId: string, input: TInput): TState;

  /** For realtime games: advance simulation by one tick. dt is seconds since last tick. */
  tick?(state: TState, dt: number): TState;

  /** Serialize state for broadcast. */
  serialize(
    state: TState,
    prevState: TState | null,
  ): { data: unknown; isDelta: boolean };

  /** Check if the game is over. */
  isGameOver(state: TState): boolean;

  /** Extract final results. */
  getResults(state: TState): GameResult[];

  /** Handle player disconnect mid-game. */
  onPlayerDisconnect?(state: TState, playerId: string): TState;

  /** Handle player reconnect mid-game. */
  onPlayerReconnect?(state: TState, playerId: string): TState;

  /** Cleanup resources. */
  dispose?(): void;
}
