# Plan: Room Directory on Home Screen

## Context

Players currently need to know a 4-letter room code to join a game. We want to show a live list of active rooms on the home screen so players can browse and join with one click.

PartyKit doesn't have built-in room discovery, so we'll create a separate **LobbyParty** that acts as a room directory. Room parties notify it via HTTP on state changes; the lobby broadcasts the list to home screen clients via WebSocket.

## Architecture

```
RoomParty instances --(HTTP POST)--> LobbyParty ("main")
                                          |
                                     (WebSocket)
                                          |
                                     HomeScreen clients
```

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/protocol.ts` | Modify | Add `RoomListing`, `S2C_RoomList`, `LobbyServerMessage`, `RoomDirectoryUpdate` types |
| `apps/server/partykit.json` | Modify | Add `"parties": { "lobby": "src/lobby-party.ts" }` |
| `apps/server/src/lobby-party.ts` | **New** | LobbyParty class: HTTP receiver + WebSocket broadcaster |
| `apps/server/src/room-party.ts` | Modify | Add `notifyLobby()`, call it on all state transitions |
| `apps/server/src/lobby-party.test.ts` | **New** | Tests for validation function |
| `apps/client/src/hooks/useLobbySocket.ts` | **New** | Hook connecting to LobbyParty, returns `{ rooms, connected }` |
| `apps/client/src/screens/HomeScreen.tsx` | Modify | Show room directory with join buttons |
| `apps/client/src/styles/main.css` | Modify | Room directory card styles |

## Implementation Details

### 1. Shared types (`protocol.ts`)

```ts
export interface RoomListing {
  roomCode: string;
  playerCount: number;
  phase: RoomPhase;
  selectedGameId: string | null;
  selectedGameName: string | null;
}

export interface S2C_RoomList extends BaseMessage {
  type: "s2c:room_list";
  rooms: RoomListing[];
}

export type LobbyServerMessage = S2C_RoomList;

export interface RoomDirectoryUpdate {
  action: "upsert" | "remove";
  roomCode: string;
  playerCount: number;
  phase: RoomPhase;
  selectedGameId: string | null;
}
```

### 2. LobbyParty (`lobby-party.ts`)

- `onStart`: starts stale-check interval (every 10s)
- `onConnect`: sends full room list snapshot
- `onRequest` (HTTP POST): receives upsert/remove from RoomParty, updates `rooms` Map, broadcasts
- `pruneStaleRooms()`: removes rooms not updated in 30s
- Exports `isValidDirectoryUpdate` for testing

### 3. RoomParty changes (`room-party.ts`)

Add `notifyLobby()` method using `this.room.context.parties.lobby.get("main").fetch(...)`. Call it in:
- `onConnect` (player joined)
- `onClose` (player left / room empty)
- `startGame()` (countdown + playing phases)
- `endGame()` (results phase)
- `returnToLobby()` (back to lobby)
- `handleLeave()` (explicit leave)
- `cleanup()` (room destroyed)

All calls are fire-and-forget (try/catch, errors swallowed).

### 4. Client hook (`useLobbySocket.ts`)

```ts
const socket = new PartySocket({
  host: PARTYKIT_HOST,
  party: "lobby",
  room: "main",
});
```

Returns `{ rooms: RoomListing[], connected: boolean }`. Opens on HomeScreen mount, closes on unmount.

### 5. HomeScreen UI

- Shows "Active Rooms" section below existing create/join controls
- Each room card: code, player count, phase badge (color-coded), game name, Join button
- Rooms sorted: lobby-phase first, then by player count
- Join button disabled until player enters a name
- "No active rooms" message when list is empty

## Edge Cases

- **Room gone when joining**: PartyKit creates fresh Durable Object; user becomes host. Fine.
- **LobbyParty unavailable**: notifyLobby silently fails; gameplay unaffected; stale check cleans up.
- **Rapid updates**: Each upsert overwrites previous; full list broadcast = always consistent.

## Verification

1. `pnpm --filter @bunko/shared build` after protocol changes
2. `pnpm test` — all tests pass
3. `pnpm build` — full build succeeds
4. `pnpm dev` — manual test:
   - Open home screen, see "No active rooms"
   - Create room in another tab, see it appear live
   - Click Join on listed room, verify it works
   - Start game, see phase change to "Playing"
   - All players leave, see room disappear
