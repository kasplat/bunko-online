import type { GameMeta } from "@bunko/shared";
import type { ServerGameModule } from "./game-engine.js";
import { TypeRacerModule } from "./modules/type-racer.js";

const modules = new Map<string, () => ServerGameModule>();
const metas: GameMeta[] = [];

function register(meta: GameMeta, factory: () => ServerGameModule) {
  modules.set(meta.gameId, factory);
  metas.push(meta);
}

// Register games
register(
  {
    gameId: "type-racer",
    displayName: "Type Racer",
    description: "Race to type a paragraph the fastest!",
    minPlayers: 1,
    maxPlayers: 10,
    timing: { mode: "turnbased", maxDurationSecs: 60 },
  },
  () => new TypeRacerModule(),
);

export function createGameModule(gameId: string): ServerGameModule | null {
  const factory = modules.get(gameId);
  return factory ? factory() : null;
}

export function getAvailableGames(): GameMeta[] {
  return metas;
}
