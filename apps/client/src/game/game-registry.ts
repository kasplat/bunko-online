import type { ClientGameModule } from "./game-renderer";
import type { GameMeta } from "@bunko/shared";
import { TypeRacerClientModule } from "./modules/type-racer";
import { ReactionSpeedClientModule } from "./modules/reaction-speed";

const modules = new Map<string, () => ClientGameModule>();
const metas: GameMeta[] = [];

function register(meta: GameMeta, factory: () => ClientGameModule) {
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
  () => new TypeRacerClientModule(),
);

register(
  {
    gameId: "reaction-speed",
    displayName: "Reaction Speed",
    description: "Tap as fast as you can when the screen turns green!",
    minPlayers: 1,
    maxPlayers: 10,
    timing: { mode: "realtime", tickRate: 20, broadcastRate: 10, maxDurationSecs: 120 },
  },
  () => new ReactionSpeedClientModule(),
);

export function createClientModule(gameId: string): ClientGameModule | null {
  const factory = modules.get(gameId);
  return factory ? factory() : null;
}

export function getAvailableGames(): GameMeta[] {
  return metas;
}
