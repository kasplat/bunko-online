import { getAvailableGames } from "@bunko/shared";
import type { ClientGameModule } from "./game-renderer";
import { TypeRacerClientModule } from "./modules/type-racer";
import { ReactionSpeedClientModule } from "./modules/reaction-speed";
import { TowerGrowthClientModule } from "./modules/tower-growth";
import { ChickenJockeyClientModule } from "./modules/chicken-jockey";

const factories = new Map<string, () => ClientGameModule>();

factories.set("type-racer", () => new TypeRacerClientModule());
factories.set("reaction-speed", () => new ReactionSpeedClientModule());
factories.set("tower-growth", () => new TowerGrowthClientModule());
factories.set("chicken-jockey", () => new ChickenJockeyClientModule());

export function createClientModule(gameId: string): ClientGameModule | null {
  const factory = factories.get(gameId);
  return factory ? factory() : null;
}

export { getAvailableGames };
