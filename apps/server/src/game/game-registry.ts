import { getAvailableGames, getGameMeta } from "@bunko/shared";
import type { ServerGameModule } from "./game-engine.js";
import { TypeRacerModule } from "./modules/type-racer.js";
import { ReactionSpeedModule } from "./modules/reaction-speed.js";
import { TowerGrowthModule } from "./modules/tower-growth.js";
import { ChickenJockeyModule } from "./modules/chicken-jockey.js";

const factories = new Map<string, () => ServerGameModule>();

factories.set("type-racer", () => new TypeRacerModule());
factories.set("reaction-speed", () => new ReactionSpeedModule());
factories.set("tower-growth", () => new TowerGrowthModule());
factories.set("chicken-jockey", () => new ChickenJockeyModule());

export function createGameModule(gameId: string): ServerGameModule | null {
  const factory = factories.get(gameId);
  return factory ? factory() : null;
}

export { getAvailableGames, getGameMeta };
