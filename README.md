# Bunko Online

Multiplayer mini-game platform. Players create/join rooms via 4-letter codes and play competitive games together.

## Tech Stack

- **Frontend:** React 19 + Vite
- **Backend:** PartyKit (WebSocket-based)
- **Shared:** TypeScript types & utilities
- **Package manager:** pnpm (workspace monorepo)
- **Testing:** Vitest

## Setup

```bash
# Install dependencies
pnpm install

# Build the shared package (required before first run)
pnpm --filter @bunko/shared build
```

## Development

```bash
# Start client + server in parallel
pnpm dev

# Or run individually
pnpm --filter @bunko/client dev    # Client at http://localhost:5173
pnpm --filter @bunko/server dev    # PartyKit server at http://localhost:1999
```

After changing anything in `packages/shared/`, rebuild it before restarting dev:

```bash
pnpm --filter @bunko/shared build
```

## Testing

```bash
pnpm test                            # All tests
pnpm --filter @bunko/server test     # Server tests only
pnpm --filter @bunko/shared test     # Shared tests only
```

## Deployment

**Client:** Auto-deploys to Cloudflare Pages on push to `main`.

**PartyKit server:** Must be deployed manually:

```bash
cd apps/server && npx partykit deploy
```

Set the `VITE_PARTYKIT_HOST` environment variable in Cloudflare Pages to your deployed PartyKit URL (e.g., `bunko-server.yourname.partykit.dev`).

## Project Structure

```
packages/shared/   - @bunko/shared: message protocol, types, utilities
apps/server/       - @bunko/server: PartyKit server (room management, game engine)
apps/client/       - @bunko/client: React SPA
plans/             - Feature plans and design docs
```

## Games

- **Type Racer** - Race to type a passage the fastest
- **Reaction Speed** - Test your reaction time
- **Tower Growth** - Tap to grow your tower during green light, avoid red light
