// ---- Base message ----

export interface BaseMessage {
  type: string;
  seq: number;
}

// ---- Client -> Server ----

export interface C2S_JoinRoom extends BaseMessage {
  type: "c2s:join_room";
  playerName: string;
}

export interface C2S_LeaveRoom extends BaseMessage {
  type: "c2s:leave_room";
}

export interface C2S_SelectGame extends BaseMessage {
  type: "c2s:select_game";
  gameId: string;
}

export interface C2S_Ready extends BaseMessage {
  type: "c2s:ready";
  ready: boolean;
}

export interface C2S_StartGame extends BaseMessage {
  type: "c2s:start_game";
}

export interface C2S_GameInput extends BaseMessage {
  type: "c2s:game_input";
  gameId: string;
  payload: unknown;
}

export type ClientMessage =
  | C2S_JoinRoom
  | C2S_LeaveRoom
  | C2S_SelectGame
  | C2S_Ready
  | C2S_StartGame
  | C2S_GameInput;

/** Distributive Omit that preserves discriminated union members */
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

/** ClientMessage without the seq field — used by the send() function which auto-adds seq */
export type ClientMessagePayload = DistributiveOmit<ClientMessage, "seq">;

// ---- Server -> Client ----

export interface S2C_RoomState extends BaseMessage {
  type: "s2c:room_state";
  roomCode: string;
  phase: RoomPhase;
  players: PlayerInfo[];
  hostId: string;
  selectedGameId: string | null;
  sessionScores: Record<string, number>;
}

export interface S2C_GameStarting extends BaseMessage {
  type: "s2c:game_starting";
  gameId: string;
  config: unknown;
  countdownSecs: number;
}

export interface S2C_GameState extends BaseMessage {
  type: "s2c:game_state";
  gameId: string;
  state: unknown;
  isDelta: boolean;
}

export interface S2C_GameOver extends BaseMessage {
  type: "s2c:game_over";
  gameId: string;
  results: GameResult[];
}

export interface S2C_Error extends BaseMessage {
  type: "s2c:error";
  code: string;
  message: string;
}

export type ServerMessage =
  | S2C_RoomState
  | S2C_GameStarting
  | S2C_GameState
  | S2C_GameOver
  | S2C_Error;

// ---- Shared types used by messages ----

import type { RoomPhase } from "./room.js";

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface GameResult {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
  stats?: Record<string, unknown>;
}
