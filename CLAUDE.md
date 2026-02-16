# Bunko Online

Multiplayer mini-game platform. Players create/join rooms via 4-letter codes and play competitive games together.

## Tech Stack

- **Frontend:** React 19 + Vite (SPA)
- **Backend:** PartyKit (WebSocket-based Durable Objects)
- **Shared:** TypeScript types & utilities
- **Package manager:** pnpm (workspace monorepo)
- **Testing:** Vitest (server & shared packages)

## Monorepo Structure

```
packages/shared/   - @bunko/shared: message protocol, types, utilities (must build first)
apps/server/       - @bunko/server: PartyKit server (room management, game engine)
apps/client/       - @bunko/client: React SPA
```

## Commands

```bash
pnpm dev              # Start all apps in parallel (client + server)
pnpm build            # Build shared first, then apps (order matters)
pnpm test             # Run all tests (vitest)
pnpm --filter @bunko/server test       # Server tests only
pnpm --filter @bunko/shared test       # Shared tests only
pnpm --filter @bunko/server dev        # Server only
pnpm --filter @bunko/client dev        # Client only
pnpm --filter @bunko/shared build      # Rebuild shared (needed after changing shared types)
```

## Key Architecture

### Message Protocol (`packages/shared/src/protocol.ts`)

All client-server communication uses typed WebSocket messages. Client-to-server messages
use `c2s:` prefix, server-to-client use `s2c:`. When modifying messages:

1. Update types in `packages/shared/src/protocol.ts`
2. Rebuild shared: `pnpm --filter @bunko/shared build`
3. Update server handler in `apps/server/src/room-party.ts`
4. Update client handler in `apps/client/src/hooks/useGameState.ts`

### Room Lifecycle

Phases flow: `lobby` -> `countdown` -> `playing` -> `results` -> `lobby`
Defined in `packages/shared/src/room.ts`.

### Game Module System

Games are pluggable modules. Each game needs files in both server and client:

- **Server module:** `apps/server/src/game/modules/<name>.ts` (implements `ServerGameModule`)
- **Client module:** `apps/client/src/game/modules/<name>.ts` (implements `ClientGameModule`)
- **Server registry:** `apps/server/src/game/game-registry.ts`
- **Client registry:** `apps/client/src/game/game-registry.ts`

The `ServerGameModule` interface (`apps/server/src/game/game-engine.ts`) requires:
`init`, `onInput`, `serialize`, `isGameOver`, `getResults`, and optionally `tick` (for realtime games).

The `ClientGameModule` interface (`apps/client/src/game/game-renderer.ts`) requires:
`mount`, `onStateUpdate`, `unmount`, and optionally `onFrame`.

### Timing Modes

- **Turn-based:** Discrete input (e.g., Type Racer). No `tick()` needed.
- **Real-time:** Continuous simulation. Implement `tick(state, dt)` on server and `onFrame(dt)` on client.

### Client Rendering

Game modules render directly to DOM (not React components). The `GameScreen` component
provides a container `<div>`, and the module's `mount()` method builds its own DOM inside it.

## Conventions

- Game IDs are kebab-case strings (e.g., `"type-racer"`)
- Input validation happens on the server in `onInput()` with a type guard function
- The `C2S_GameInput.payload` field is `unknown` -- each game defines and validates its own input shape
- Server state can use Maps/Sets internally but `serialize()` must return plain JSON
- Client modules handle their own CSS by injecting `<style>` elements in `mount()`
