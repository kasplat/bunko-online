# Skill: Add a New Game Module to Bunko Online

Use this skill when adding a new mini-game to the Bunko Online platform.

## Overview

Adding a game requires coordinated changes across 6 files in the monorepo. Follow these steps in order.

## Step 1: Define Game Types (shared)

No file changes needed in `packages/shared/` -- game-specific types live in the module files themselves.
The shared `C2S_GameInput.payload` is typed as `unknown`, so each game defines its own input/state types internally.

If the game needs new shared message types (rare), add them to `packages/shared/src/protocol.ts` and rebuild:
```bash
pnpm --filter @bunko/shared build
```

## Step 2: Create Server Module

Create `apps/server/src/game/modules/<game-id>.ts`.

The module must implement `ServerGameModule<TState, TInput, TConfig>` from `../game-engine.js`.

### Template

```typescript
import type { PlayerInfo, GameResult, GameTiming } from "@bunko/shared";
import type { ServerGameModule } from "../game-engine.js";

// Internal types (not exported to shared)
interface MyGameState {
  players: Map<string, MyPlayerState>;
  // ... game-specific state
}

interface MyPlayerState {
  id: string;
  name: string;
  // ... per-player state
}

interface MyGameConfig {
  // Sent to clients on game start
}

interface MyGameInput {
  // Shape of player input
}

export class MyGameModule
  implements ServerGameModule<MyGameState, MyGameInput, MyGameConfig>
{
  readonly gameId = "<game-id>";
  readonly displayName = "<Display Name>";
  readonly minPlayers = 1;
  readonly maxPlayers = 10;
  readonly timing: GameTiming = {
    mode: "turnbased", // or "realtime"
    maxDurationSecs: 60,
    // For realtime: tickRate: 20, broadcastRate: 10
  };

  init(players: PlayerInfo[]): { state: MyGameState; config: MyGameConfig } {
    // Create initial state for all players
    // Return both internal state and config sent to clients
  }

  onInput(state: MyGameState, playerId: string, input: unknown): MyGameState {
    // 1. Validate input with a type guard
    if (!isMyGameInput(input)) return state;
    // 2. Validate bounds/rules
    // 3. Update state
    return state;
  }

  // Only for realtime games:
  // tick(state: MyGameState, dt: number): MyGameState { ... }

  serialize(
    state: MyGameState,
    _prev: MyGameState | null,
  ): { data: unknown; isDelta: boolean } {
    // Convert Maps/Sets to plain JSON arrays/objects
    // isDelta: true if sending only changes (optimization)
    return { data: { /* ... */ }, isDelta: false };
  }

  isGameOver(state: MyGameState): boolean {
    // Return true when the game should end
  }

  getResults(state: MyGameState): GameResult[] {
    // Return sorted results with rank, score, and optional stats
    // GameResult: { playerId, playerName, score, rank, stats? }
  }

  onPlayerDisconnect(state: MyGameState, playerId: string): MyGameState {
    // Handle player leaving mid-game (e.g., mark as finished)
    return state;
  }
}

// Always add a type guard for input validation
function isMyGameInput(input: unknown): input is MyGameInput {
  return (
    typeof input === "object" &&
    input !== null &&
    // ... validate required fields
  );
}
```

### Key requirements:
- `onInput` must validate input shape and bounds (never trust client data)
- `serialize` must return plain JSON (no Maps/Sets/classes)
- `getResults` must return entries sorted by rank with `rank` starting at 1
- Score convention: winner gets 100, decreasing by 20 per rank, minimum 10

## Step 3: Register Server Module

Edit `apps/server/src/game/game-registry.ts`:

```typescript
import { MyGameModule } from "./modules/<game-id>.js";

// Add after existing registrations:
register(
  {
    gameId: "<game-id>",
    displayName: "<Display Name>",
    description: "<Short description for lobby>",
    minPlayers: 1,
    maxPlayers: 10,
    timing: { mode: "turnbased", maxDurationSecs: 60 },
  },
  () => new MyGameModule(),
);
```

## Step 4: Create Client Module

Create `apps/client/src/game/modules/<game-id>.ts`.

The module must implement `ClientGameModule<TState, TInput, TConfig>` from `../game-renderer`.

### Template

```typescript
import type { ClientGameModule } from "../game-renderer";

// These types must match what the server's serialize() and config send
interface MyGameConfig {
  // Matches server's config
}

interface MyGameState {
  // Matches server's serialized output (plain JSON, not Maps)
}

export class MyGameClientModule
  implements ClientGameModule<MyGameState, MyGameInput, MyGameConfig>
{
  readonly gameId = "<game-id>";

  private container: HTMLElement | null = null;
  private sendInput: ((input: MyGameInput) => void) | null = null;
  private getPlayerId: (() => string) | null = null;
  private state: MyGameState | null = null;

  mount(
    container: HTMLElement,
    config: MyGameConfig,
    sendInput: (input: MyGameInput) => void,
    getPlayerId: () => string,
  ) {
    this.container = container;
    this.sendInput = sendInput;
    this.getPlayerId = getPlayerId;

    // 1. Build DOM structure
    container.innerHTML = `<div class="my-game">...</div>`;

    // 2. Inject scoped CSS
    const style = document.createElement("style");
    style.textContent = `
      .my-game { /* styles */ }
    `;
    container.appendChild(style);

    // 3. Set up event listeners
    // Use this.sendInput({...}) to send player actions to server
  }

  onStateUpdate(state: MyGameState, _isDelta: boolean) {
    this.state = state;
    // Re-render based on new state from server
  }

  // Only for realtime/animated games:
  // onFrame(dt: number) { ... }

  unmount() {
    // Remove event listeners
    if (this.container) this.container.innerHTML = "";
    this.container = null;
    this.sendInput = null;
    this.state = null;
  }
}
```

### Key requirements:
- Client modules render directly to DOM (not React) via `mount()`
- CSS is injected as a `<style>` element inside the container
- Always clean up event listeners in `unmount()`
- Client state types must match the server's `serialize()` output (plain JSON)
- Use `this.getPlayerId()` to highlight the current player
- Always HTML-escape user-provided text to prevent XSS

## Step 5: Register Client Module

Edit `apps/client/src/game/game-registry.ts`:

```typescript
import { MyGameClientModule } from "./modules/<game-id>";

// Add after existing registrations:
register(
  {
    gameId: "<game-id>",
    displayName: "<Display Name>",
    description: "<Short description for lobby>",
    minPlayers: 1,
    maxPlayers: 10,
    timing: { mode: "turnbased", maxDurationSecs: 60 },
  },
  () => new MyGameClientModule(),
);
```

**Important:** The `GameMeta` (gameId, displayName, description, timing, etc.) must match between server and client registries.

## Step 6: Write Tests

Create `apps/server/src/game/modules/<game-id>.test.ts` using Vitest:

```typescript
import { describe, it, expect } from "vitest";
import { MyGameModule } from "./<game-id>";

describe("MyGameModule", () => {
  const players = [
    { id: "p1", name: "Alice", ready: true, connected: true },
    { id: "p2", name: "Bob", ready: true, connected: true },
  ];

  it("initializes with correct state", () => {
    const mod = new MyGameModule();
    const { state, config } = mod.init(players);
    // Assert initial state
  });

  it("processes valid input", () => {
    const mod = new MyGameModule();
    const { state } = mod.init(players);
    const next = mod.onInput(state, "p1", { /* valid input */ });
    // Assert state changed correctly
  });

  it("rejects invalid input", () => {
    const mod = new MyGameModule();
    const { state } = mod.init(players);
    const next = mod.onInput(state, "p1", { /* bad input */ });
    expect(next).toBe(state); // State unchanged
  });

  it("detects game over", () => {
    // ...
  });

  it("produces ranked results", () => {
    // ...
  });
});
```

Run tests: `pnpm --filter @bunko/server test`

## Checklist

- [ ] Server module implements all required `ServerGameModule` methods
- [ ] Server module validates input in `onInput()` with a type guard
- [ ] Server module's `serialize()` returns plain JSON (no Maps/Sets)
- [ ] Server registry entry added with matching `GameMeta`
- [ ] Client module implements `mount`, `onStateUpdate`, `unmount`
- [ ] Client module cleans up event listeners in `unmount()`
- [ ] Client registry entry added with matching `GameMeta`
- [ ] Client state types match server's `serialize()` output
- [ ] Tests written and passing
- [ ] Game ID is kebab-case and consistent across all files

## No Changes Needed

These files do **not** need modification when adding a game:
- `packages/shared/src/protocol.ts` -- the generic `payload: unknown` handles all games
- `apps/client/src/screens/GameScreen.tsx` -- automatically mounts any registered module
- `apps/server/src/room-party.ts` -- uses the registry to create any game module
- `packages/shared/src/game-registry.ts` -- just type definitions, no game-specific code
