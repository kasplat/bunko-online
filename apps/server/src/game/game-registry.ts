import { getAvailableGames, getGameMeta } from "@bunko/shared";
import type { ServerGameModule } from "./game-engine.js";
import { TypeRacerModule } from "./modules/type-racer.js";
import { ReactionSpeedModule } from "./modules/reaction-speed.js";

const factories = new Map<string, () => ServerGameModule>();

factories.set("type-racer", () => new TypeRacerModule());
factories.set("reaction-speed", () => new ReactionSpeedModule());

export function createGameModule(gameId: string): ServerGameModule | null {
  const factory = factories.get(gameId);
  return factory ? factory() : null;
}

export { getAvailableGames, getGameMeta };
