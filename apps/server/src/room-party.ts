import type * as Party from "partykit/server";
import type {
  RoomPhase,
  PlayerInfo,
  ClientMessage,
  ServerMessage,
  S2C_Error,
} from "@bunko/shared";
import type { ServerGameModule } from "./game/game-engine.js";
import { createGameModule, getAvailableGames, getGameMeta } from "./game/game-registry.js";

const MAX_NAME_LENGTH = 20;

interface Player {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

export default class RoomParty implements Party.Server {
  phase: RoomPhase = "lobby";
  players = new Map<string, Player>();
  hostId: string | null = null;
  selectedGameId: string | null = null;
  sessionScores: Record<string, number> = {};
  gameSettings: Record<string, unknown> = {};

  // Game state
  gameModule: ServerGameModule | null = null;
  gameState: unknown = null;
  prevGameState: unknown = null;
  tickInterval: ReturnType<typeof setInterval> | null = null;
  broadcastInterval: ReturnType<typeof setInterval> | null = null;
  countdownTimeout: ReturnType<typeof setTimeout> | null = null;
  resultsTimeout: ReturnType<typeof setTimeout> | null = null;
  lastTickTime = 0;
  seq = 0;

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const rawName = url.searchParams.get("name") ?? "";
    const name = sanitizeName(rawName) || `Player ${conn.id.slice(0, 4)}`;

    // Check if this is a reconnecting player
    const existing = this.players.get(conn.id);
    if (existing) {
      existing.connected = true;
      existing.name = name;
      if (this.phase === "playing" && this.gameModule?.onPlayerReconnect && this.gameState) {
        this.gameState = this.gameModule.onPlayerReconnect(this.gameState, conn.id);
      }
    } else {
      this.players.set(conn.id, {
        id: conn.id,
        name,
        ready: false,
        connected: true,
      });
    }

    if (!this.hostId) {
      this.hostId = conn.id;
    }

    this.broadcastRoomState();
  }

  onMessage(message: string, sender: Party.Connection) {
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      this.sendError(sender, "INVALID_MESSAGE", "Could not parse message");
      return;
    }

    if (!isValidClientMessage(raw)) {
      this.sendError(sender, "INVALID_MESSAGE", "Malformed message");
      return;
    }

    const msg = raw as ClientMessage;

    switch (msg.type) {
      case "c2s:join_room":
        // Handled in onConnect
        break;
      case "c2s:select_game":
        this.handleSelectGame(sender, msg.gameId);
        break;
      case "c2s:ready":
        this.handleReady(sender, msg.ready);
        break;
      case "c2s:start_game":
        this.handleStartGame(sender);
        break;
      case "c2s:game_input":
        this.handleGameInput(sender, msg.payload);
        break;
      case "c2s:leave_room":
        this.handleLeave(sender);
        break;
      case "c2s:return_to_lobby":
        this.handleReturnToLobby(sender);
        break;
      case "c2s:game_settings":
        this.handleGameSettings(sender, msg.gameId, msg.settings);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    if (!player) return;

    if (
      (this.phase === "playing" || this.phase === "countdown") &&
      this.gameModule &&
      this.gameState
    ) {
      player.connected = false;
      if (this.phase === "playing" && this.gameModule.onPlayerDisconnect) {
        this.gameState = this.gameModule.onPlayerDisconnect(
          this.gameState,
          conn.id,
        );
      }
    } else {
      this.players.delete(conn.id);
    }

    if (this.hostId === conn.id) {
      this.transferHost();
    }

    if (this.players.size === 0) {
      this.cleanup();
    } else {
      this.broadcastRoomState();
    }
  }

  // ---- Message handlers ----

  private handleSelectGame(sender: Party.Connection, gameId: string) {
    if (sender.id !== this.hostId) {
      this.sendError(sender, "NOT_HOST", "Only the host can select a game");
      return;
    }
    if (this.phase !== "lobby") return;
    if (typeof gameId !== "string" || !gameId) return;

    this.selectedGameId = gameId;
    this.gameSettings = {};
    for (const p of this.players.values()) {
      p.ready = false;
    }
    this.broadcastRoomState();
  }

  private handleReady(sender: Party.Connection, ready: boolean) {
    if (this.phase !== "lobby") return;
    const player = this.players.get(sender.id);
    if (player) {
      player.ready = !!ready;
      this.broadcastRoomState();
    }
  }

  private handleStartGame(sender: Party.Connection) {
    if (sender.id !== this.hostId) {
      this.sendError(sender, "NOT_HOST", "Only the host can start the game");
      return;
    }
    if (this.phase !== "lobby" || !this.selectedGameId) {
      this.sendError(sender, "NO_GAME", "No game selected");
      return;
    }

    const connectedPlayers = [...this.players.values()].filter(
      (p) => p.connected,
    );

    const allReady = connectedPlayers.every((p) => p.ready);
    if (!allReady) {
      this.sendError(sender, "NOT_READY", "Not all players are ready");
      return;
    }

    // Validate player count against game requirements
    const gameMeta = getAvailableGames().find(
      (g) => g.gameId === this.selectedGameId,
    );
    if (gameMeta) {
      if (connectedPlayers.length < gameMeta.minPlayers) {
        this.sendError(
          sender,
          "TOO_FEW_PLAYERS",
          `Need at least ${gameMeta.minPlayers} players`,
        );
        return;
      }
      if (connectedPlayers.length > gameMeta.maxPlayers) {
        this.sendError(
          sender,
          "TOO_MANY_PLAYERS",
          `Maximum ${gameMeta.maxPlayers} players`,
        );
        return;
      }
    }

    this.startGame();
  }

  private handleGameInput(sender: Party.Connection, payload: unknown) {
    if (this.phase !== "playing" || !this.gameModule || !this.gameState) return;

    this.gameState = this.gameModule.onInput(
      this.gameState,
      sender.id,
      payload,
    );

    const timing = getGameMeta(this.gameModule.gameId)?.timing;
    if (timing?.mode === "turnbased") {
      this.broadcastGameState();
      this.checkGameOver();
    }
  }

  private handleReturnToLobby(sender: Party.Connection) {
    if (sender.id !== this.hostId) {
      this.sendError(sender, "NOT_HOST", "Only the host can return to lobby");
      return;
    }
    if (this.phase !== "results") return;

    if (this.resultsTimeout) {
      clearTimeout(this.resultsTimeout);
      this.resultsTimeout = null;
    }

    this.phase = "lobby";
    for (const p of this.players.values()) {
      p.ready = false;
    }
    const toRemove: string[] = [];
    for (const [id, p] of this.players) {
      if (!p.connected) toRemove.push(id);
    }
    for (const id of toRemove) {
      this.players.delete(id);
    }
    this.broadcastRoomState();
  }

  private handleGameSettings(sender: Party.Connection, gameId: string, settings: Record<string, unknown>) {
    if (sender.id !== this.hostId) {
      this.sendError(sender, "NOT_HOST", "Only the host can change settings");
      return;
    }
    if (this.phase !== "lobby") return;
    this.gameSettings = settings;
    this.broadcastRoomState();
  }

  private handleLeave(sender: Party.Connection) {
    this.players.delete(sender.id);
    if (this.hostId === sender.id) {
      this.transferHost();
    }
    this.broadcastRoomState();
  }

  // ---- Game lifecycle ----

  private startGame() {
    if (!this.selectedGameId) return;

    const module = createGameModule(this.selectedGameId);
    if (!module) {
      this.broadcast({
        type: "s2c:error",
        seq: this.seq++,
        code: "UNKNOWN_GAME",
        message: `Game "${this.selectedGameId}" not found`,
      });
      return;
    }

    this.gameModule = module;
    const playerInfos = this.getPlayerInfos().filter((p) => p.connected);
    const { state, config } = module.init(playerInfos, this.gameSettings);
    this.gameState = state;
    this.prevGameState = null;

    const countdownSecs = 3;
    this.phase = "countdown";
    this.broadcastRoomState();

    this.broadcast({
      type: "s2c:game_starting",
      seq: this.seq++,
      gameId: this.selectedGameId,
      config,
      countdownSecs,
    });

    this.countdownTimeout = setTimeout(() => {
      this.countdownTimeout = null;
      if (this.phase !== "countdown") return;
      this.phase = "playing";
      this.broadcastRoomState();
      this.broadcastGameState();

      const gameTiming = getGameMeta(module.gameId)?.timing;
      if (gameTiming?.mode === "realtime") {
        this.startTickLoop(module);
      }
    }, countdownSecs * 1000);
  }

  private startTickLoop(module: ServerGameModule) {
    const gameTiming = getGameMeta(module.gameId)?.timing;
    const tickMs = 1000 / (gameTiming?.tickRate ?? 20);
    const broadcastMs = 1000 / (gameTiming?.broadcastRate ?? 10);

    this.lastTickTime = Date.now();

    this.tickInterval = setInterval(() => {
      if (!this.gameState || !module.tick) return;
      const now = Date.now();
      const dt = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      this.gameState = module.tick(this.gameState, dt);
      this.checkGameOver();
    }, tickMs);

    this.broadcastInterval = setInterval(() => {
      if (this.phase === "playing") {
        this.broadcastGameState();
      }
    }, broadcastMs);
  }

  private broadcastGameState() {
    if (!this.gameModule || !this.gameState || !this.selectedGameId) return;

    const { data, isDelta } = this.gameModule.serialize(
      this.gameState,
      this.prevGameState,
    );
    this.prevGameState = this.gameState;

    this.broadcast({
      type: "s2c:game_state",
      seq: this.seq++,
      gameId: this.selectedGameId,
      state: data,
      isDelta,
    });
  }

  private checkGameOver() {
    if (!this.gameModule || !this.gameState) return;
    if (this.gameModule.isGameOver(this.gameState)) {
      this.endGame();
    }
  }

  private endGame() {
    if (!this.gameModule || !this.gameState || !this.selectedGameId) return;

    this.stopTickLoop();

    const results = this.gameModule.getResults(this.gameState);
    for (const r of results) {
      this.sessionScores[r.playerId] =
        (this.sessionScores[r.playerId] ?? 0) + r.score;
    }

    this.broadcast({
      type: "s2c:game_over",
      seq: this.seq++,
      gameId: this.selectedGameId,
      results,
    });

    this.gameModule.dispose?.();
    this.gameModule = null;
    this.gameState = null;
    this.prevGameState = null;

    this.phase = "results";
    this.broadcastRoomState();

    // Host controls when to return to lobby via c2s:return_to_lobby
  }

  // ---- Helpers ----

  private transferHost() {
    const connected = [...this.players.values()].find((p) => p.connected);
    this.hostId = connected?.id ?? null;
  }

  private getPlayerInfos(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: p.connected,
    }));
  }

  private broadcastRoomState() {
    const base = {
      type: "s2c:room_state" as const,
      seq: this.seq++,
      roomCode: this.room.id,
      phase: this.phase,
      players: this.getPlayerInfos(),
      hostId: this.hostId ?? "",
      selectedGameId: this.selectedGameId,
      sessionScores: this.sessionScores,
      gameSettings: this.gameSettings,
    };

    // Send per-connection so each client gets their own yourId
    for (const conn of this.room.getConnections()) {
      conn.send(JSON.stringify({ ...base, yourId: conn.id }));
    }
  }

  private broadcast(msg: ServerMessage) {
    this.room.broadcast(JSON.stringify(msg));
  }

  private sendError(conn: Party.Connection, code: string, message: string) {
    const msg: S2C_Error = {
      type: "s2c:error",
      seq: this.seq++,
      code,
      message,
    };
    conn.send(JSON.stringify(msg));
  }

  private stopTickLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private clearPendingTimeouts() {
    if (this.countdownTimeout) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = null;
    }
    if (this.resultsTimeout) {
      clearTimeout(this.resultsTimeout);
      this.resultsTimeout = null;
    }
  }

  private cleanup() {
    this.stopTickLoop();
    this.clearPendingTimeouts();
    this.gameModule?.dispose?.();
    this.gameModule = null;
    this.gameState = null;
    this.phase = "lobby";
  }
}

RoomParty satisfies Party.Worker;

// ---- Validation helpers ----

export function sanitizeName(raw: string): string {
  return raw.replace(/[^\w\s\-]/g, "").trim().slice(0, MAX_NAME_LENGTH);
}

export function isValidClientMessage(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") return false;

  switch (obj.type) {
    case "c2s:select_game":
      return typeof obj.gameId === "string";
    case "c2s:ready":
      return typeof obj.ready === "boolean";
    case "c2s:start_game":
    case "c2s:leave_room":
    case "c2s:return_to_lobby":
      return true;
    case "c2s:game_settings":
      return typeof obj.gameId === "string" && typeof obj.settings === "object" && obj.settings !== null;
    case "c2s:game_input":
      return typeof obj.gameId === "string" && obj.payload !== undefined;
    case "c2s:join_room":
      return typeof obj.playerName === "string";
    default:
      return false;
  }
}
