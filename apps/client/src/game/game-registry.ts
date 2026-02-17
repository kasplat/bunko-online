import { getAvailableGames } from "@bunko/shared";
import type { ClientGameModule } from "./game-renderer";
import { TypeRacerClientModule } from "./modules/type-racer";
import { ReactionSpeedClientModule } from "./modules/reaction-speed";

const factories = new Map<string, () => ClientGameModule>();

factories.set("type-racer", () => new TypeRacerClientModule());
factories.set("reaction-speed", () => new ReactionSpeedClientModule());

export function createClientModule(gameId: string): ClientGameModule | null {
  const factory = factories.get(gameId);
  return factory ? factory() : null;
}

export { getAvailableGames };
