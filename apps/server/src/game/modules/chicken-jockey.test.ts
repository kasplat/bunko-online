import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChickenJockeyModule, computeScore } from "./chicken-jockey.js";
import { GAME_META } from "@bunko/shared";
import type { PlayerInfo } from "@bunko/shared";

function makePlayers(count: number): PlayerInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    ready: true,
    connected: true,
  }));
}

describe("ChickenJockeyModule", () => {
  let mod: ChickenJockeyModule;

  beforeEach(() => {
    mod = new ChickenJockeyModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("metadata", () => {
    it("has correct game properties", () => {
      expect(mod.gameId).toBe("chicken-jockey");
      const meta = GAME_META["chicken-jockey"];
      expect(meta.minPlayers).toBe(2);
      expect(meta.maxPlayers).toBe(10);
      expect(meta.timing.mode).toBe("realtime");
      expect(meta.timing.maxDurationSecs).toBe(30);
    });
  });

  describe("init", () => {
    it("creates one lane for 2 players", () => {
      const { state, config } = mod.init(makePlayers(2));
      expect(state.lanes).toHaveLength(1);
      expect(config.pairings).toHaveLength(1);
      expect(config.halfLane).toBe(500);
    });

    it("creates two lanes for 4 players", () => {
      const { state } = mod.init(makePlayers(4));
      expect(state.lanes).toHaveLength(2);
    });

    it("creates five lanes for 10 players", () => {
      const { state } = mod.init(makePlayers(10));
      expect(state.lanes).toHaveLength(5);
    });

    it("initializes players at distance 0 with full speed", () => {
      const { state } = mod.init(makePlayers(2));
      const lane = state.lanes[0];
      expect(lane.playerA.distance).toBe(0);
      expect(lane.playerA.speed).toBe(100);
      expect(lane.playerA.braking).toBe(false);
      expect(lane.playerA.stopped).toBe(false);
      expect(lane.playerA.crashed).toBe(false);
      expect(lane.playerB.distance).toBe(0);
      expect(lane.playerB.speed).toBe(100);
    });

    it("maps all players to their lanes", () => {
      const { state } = mod.init(makePlayers(4));
      // All 4 players should be in the map
      expect(state.playerLaneMap.size).toBe(4);
    });

    it("provides player names in config", () => {
      const { config } = mod.init(makePlayers(2));
      expect(Object.keys(config.playerNames)).toHaveLength(2);
    });

    it("starts not finished", () => {
      const { state } = mod.init(makePlayers(2));
      expect(state.finished).toBe(false);
      expect(state.lanes[0].resolved).toBe(false);
    });
  });

  describe("onInput", () => {
    it("sets braking to true on brake_start", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;

      mod.onInput(state, playerId, { action: "brake_start" });
      expect(state.lanes[0].playerA.braking).toBe(true);
    });

    it("sets braking to false on brake_stop", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;

      mod.onInput(state, playerId, { action: "brake_start" });
      expect(state.lanes[0].playerA.braking).toBe(true);

      mod.onInput(state, playerId, { action: "brake_stop" });
      expect(state.lanes[0].playerA.braking).toBe(false);
    });

    it("rejects invalid input", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;
      const result = mod.onInput(state, playerId, { foo: "bar" });
      expect(result).toBe(state);
    });

    it("rejects input from nonexistent player", () => {
      const { state } = mod.init(makePlayers(2));
      const result = mod.onInput(state, "unknown", {
        action: "brake_start",
      });
      expect(result).toBe(state);
    });

    it("rejects input when game is finished", () => {
      const { state } = mod.init(makePlayers(2));
      state.finished = true;
      const playerId = state.lanes[0].playerA.id;
      const result = mod.onInput(state, playerId, {
        action: "brake_start",
      });
      expect(state.lanes[0].playerA.braking).toBe(false);
      expect(result).toBe(state);
    });

    it("rejects input when lane is resolved", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].resolved = true;
      const playerId = state.lanes[0].playerA.id;
      mod.onInput(state, playerId, { action: "brake_start" });
      expect(state.lanes[0].playerA.braking).toBe(false);
    });

    it("rejects input from stopped player", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;
      state.lanes[0].playerA.stopped = true;
      mod.onInput(state, playerId, { action: "brake_start" });
      expect(state.lanes[0].playerA.braking).toBe(false);
    });
  });

  describe("tick", () => {
    it("moves players forward when not braking", () => {
      const { state } = mod.init(makePlayers(2));
      mod.tick(state, 0.1); // 100ms
      // speed=100, dt=0.1 => distance += 10
      expect(state.lanes[0].playerA.distance).toBeCloseTo(10, 1);
      expect(state.lanes[0].playerB.distance).toBeCloseTo(10, 1);
    });

    it("decelerates player when braking", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.braking = true;

      mod.tick(state, 0.1);
      // decel = 100/0.75 ≈ 133.33, speed after 0.1s ≈ 100 - 13.33 = 86.67
      expect(state.lanes[0].playerA.speed).toBeCloseTo(86.67, 0);
      // distance moved = 86.67 * 0.1 ≈ 8.67 (speed was reduced first, then moved)
      // Actually: speed reduces then moves, or moves then reduces?
      // In our impl: speed reduces first, then distance += speed * dt
      // After decel: speed = max(0, 100 - 133.33*0.1) = 86.67
      // distance += 86.67 * 0.1 = 8.67
      expect(state.lanes[0].playerA.distance).toBeCloseTo(8.67, 0);
    });

    it("stops player when speed reaches 0 from braking", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.braking = true;

      // Brake for 0.75s total to fully stop (from 100 speed)
      mod.tick(state, 0.75);
      expect(state.lanes[0].playerA.speed).toBe(0);
      expect(state.lanes[0].playerA.stopped).toBe(true);
    });

    it("player resumes at reduced speed after releasing brake", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;

      // Brake for 0.3s
      mod.onInput(state, playerId, { action: "brake_start" });
      mod.tick(state, 0.3);
      const speedAfterBrake = state.lanes[0].playerA.speed;
      expect(speedAfterBrake).toBeLessThan(100);
      expect(speedAfterBrake).toBeGreaterThan(0);

      // Release brake
      mod.onInput(state, playerId, { action: "brake_stop" });
      const distBefore = state.lanes[0].playerA.distance;
      mod.tick(state, 0.1);
      // Should continue at the reduced speed
      expect(state.lanes[0].playerA.speed).toBeCloseTo(speedAfterBrake, 1);
      expect(state.lanes[0].playerA.distance).toBeGreaterThan(distBefore);
    });

    it("detects crash when players meet", () => {
      const { state } = mod.init(makePlayers(2));
      // Move both players to near center
      state.lanes[0].playerA.distance = 490;
      state.lanes[0].playerB.distance = 490;

      mod.tick(state, 0.2); // Each moves 20 more, total = 510+510 = 1020 > 1000
      expect(state.lanes[0].playerA.crashed).toBe(true);
      expect(state.lanes[0].playerB.crashed).toBe(true);
      expect(state.lanes[0].resolved).toBe(true);
    });

    it("only moving player crashes when one is stopped", () => {
      const { state } = mod.init(makePlayers(2));
      // A is stopped near center, B is still moving
      state.lanes[0].playerA.distance = 400;
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerB.distance = 590;

      mod.tick(state, 0.2); // B moves 20 more = 610, total = 1010 > 1000
      expect(state.lanes[0].playerA.crashed).toBe(false);
      expect(state.lanes[0].playerB.crashed).toBe(true);
      expect(state.lanes[0].resolved).toBe(true);
    });

    it("resolves lane when both players stop", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerA.distance = 300;
      state.lanes[0].playerB.speed = 0;
      state.lanes[0].playerB.stopped = true;
      state.lanes[0].playerB.distance = 200;

      mod.tick(state, 0.05);
      expect(state.lanes[0].resolved).toBe(true);
    });

    it("finishes game when all lanes are resolved", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerB.speed = 0;
      state.lanes[0].playerB.stopped = true;

      mod.tick(state, 0.05);
      expect(state.finished).toBe(true);
    });

    it("does not finish until all lanes resolve", () => {
      const { state } = mod.init(makePlayers(4));
      // Resolve lane 0
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerB.speed = 0;
      state.lanes[0].playerB.stopped = true;

      mod.tick(state, 0.05);
      expect(state.lanes[0].resolved).toBe(true);
      expect(state.finished).toBe(false); // lane 1 still going
    });

    it("force-stops all players on timeout", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.distance = 200;
      state.lanes[0].playerB.distance = 100;

      vi.setSystemTime(state.startedAt + 30_000);
      mod.tick(state, 0.05);

      expect(state.lanes[0].playerA.stopped).toBe(true);
      expect(state.lanes[0].playerB.stopped).toBe(true);
      expect(state.lanes[0].resolved).toBe(true);
      expect(state.finished).toBe(true);
    });

    it("does nothing when game is finished", () => {
      const { state } = mod.init(makePlayers(2));
      state.finished = true;
      const distA = state.lanes[0].playerA.distance;

      mod.tick(state, 0.1);
      expect(state.lanes[0].playerA.distance).toBe(distA);
    });

    it("clamps distance on crash to half lane", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.distance = 499;
      state.lanes[0].playerB.distance = 499;

      mod.tick(state, 0.1); // Both move past center
      expect(state.lanes[0].playerA.distance).toBeLessThanOrEqual(500);
      expect(state.lanes[0].playerB.distance).toBeLessThanOrEqual(500);
    });
  });

  describe("computeScore", () => {
    it("returns 0 at 0% progress", () => {
      expect(computeScore(0)).toBe(0);
    });

    it("returns 10 at 50% progress", () => {
      expect(computeScore(0.5)).toBe(10);
    });

    it("returns 50 at 75% progress", () => {
      expect(computeScore(0.75)).toBe(50);
    });

    it("returns 90 at 90% progress", () => {
      expect(computeScore(0.9)).toBe(90);
    });

    it("returns 100 at 100% progress", () => {
      expect(computeScore(1.0)).toBe(100);
    });

    it("interpolates between anchors", () => {
      const score = computeScore(0.625); // midpoint between 0.5 and 0.75
      expect(score).toBe(30); // midpoint between 10 and 50
    });

    it("clamps negative to 0", () => {
      expect(computeScore(-0.5)).toBe(0);
    });

    it("clamps above 1 to 100", () => {
      expect(computeScore(1.5)).toBe(100);
    });
  });

  describe("scoring", () => {
    it("scores both players on normal stop", () => {
      const { state } = mod.init(makePlayers(2));
      // Both stop at 75% progress
      state.lanes[0].playerA.distance = 375;
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerB.distance = 375;
      state.lanes[0].playerB.speed = 0;
      state.lanes[0].playerB.stopped = true;

      mod.tick(state, 0.05);
      expect(state.lanes[0].playerA.score).toBe(50);
      expect(state.lanes[0].playerB.score).toBe(50);
    });

    it("penalizes both on mutual crash", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.distance = 495;
      state.lanes[0].playerB.distance = 495;

      mod.tick(state, 0.2);
      expect(state.lanes[0].playerA.score).toBe(-30);
      expect(state.lanes[0].playerB.score).toBe(-30);
    });

    it("penalizes crasher and rewards victim", () => {
      const { state } = mod.init(makePlayers(2));
      // A stopped at 75% progress
      state.lanes[0].playerA.distance = 375;
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      // B will crash into A
      state.lanes[0].playerB.distance = 620;

      mod.tick(state, 0.1); // B moves 10 more -> total 375 + 630 = 1005 > 1000
      expect(state.lanes[0].playerB.crashed).toBe(true);
      expect(state.lanes[0].playerB.score).toBe(-30);
      // A gets score + victim bonus: computeScore(375/500) + 15 = 50 + 15 = 65
      expect(state.lanes[0].playerA.score).toBe(65);
    });
  });

  describe("serialize", () => {
    it("returns correct broadcast shape", () => {
      const { state } = mod.init(makePlayers(2));
      const { data, isDelta } = mod.serialize(state, null);

      expect(isDelta).toBe(false);
      expect(data.lanes).toHaveLength(1);
      expect(data.finished).toBe(false);
      expect(data.lanes[0].playerA).toEqual(
        expect.objectContaining({
          distance: 0,
          speed: 100,
          braking: false,
          stopped: false,
          crashed: false,
          score: 0,
        }),
      );
    });

    it("includes resolved state", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].resolved = true;
      const { data } = mod.serialize(state, null);
      expect(data.lanes[0].resolved).toBe(true);
    });
  });

  describe("isGameOver", () => {
    it("returns false when in progress", () => {
      const { state } = mod.init(makePlayers(2));
      expect(mod.isGameOver(state)).toBe(false);
    });

    it("returns true when finished", () => {
      const { state } = mod.init(makePlayers(2));
      state.finished = true;
      expect(mod.isGameOver(state)).toBe(true);
    });
  });

  describe("getResults", () => {
    it("ranks players by score descending", () => {
      const { state } = mod.init(makePlayers(4));
      // Lane 0: both stop at different distances
      state.lanes[0].playerA.distance = 450; // 90% -> 90pts
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerB.distance = 250; // 50% -> 10pts
      state.lanes[0].playerB.speed = 0;
      state.lanes[0].playerB.stopped = true;
      // Lane 1: both stop
      state.lanes[1].playerA.distance = 375; // 75% -> 50pts
      state.lanes[1].playerA.speed = 0;
      state.lanes[1].playerA.stopped = true;
      state.lanes[1].playerB.distance = 100; // 20% -> 4pts
      state.lanes[1].playerB.speed = 0;
      state.lanes[1].playerB.stopped = true;

      // Resolve lanes
      mod.tick(state, 0.05);

      const results = mod.getResults(state);
      expect(results).toHaveLength(4);
      expect(results[0].score).toBe(90);
      expect(results[0].rank).toBe(1);
      expect(results[1].score).toBe(50);
      expect(results[1].rank).toBe(2);
      expect(results[2].score).toBe(10);
      expect(results[2].rank).toBe(3);
      expect(results[3].score).toBe(4);
      expect(results[3].rank).toBe(4);
    });

    it("floors negative scores at 0 in results", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.distance = 495;
      state.lanes[0].playerB.distance = 495;

      mod.tick(state, 0.2); // mutual crash
      const results = mod.getResults(state);
      expect(results[0].score).toBe(0); // floored from -30
    });

    it("includes stats in results", () => {
      const { state } = mod.init(makePlayers(2));
      state.lanes[0].playerA.distance = 375;
      state.lanes[0].playerA.speed = 0;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerB.distance = 250;
      state.lanes[0].playerB.speed = 0;
      state.lanes[0].playerB.stopped = true;

      mod.tick(state, 0.05);
      const results = mod.getResults(state);
      expect(results[0].stats).toEqual(
        expect.objectContaining({
          progress: 75,
          crashed: false,
        }),
      );
    });
  });

  describe("onPlayerDisconnect", () => {
    it("stops the disconnected player immediately", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;

      mod.onPlayerDisconnect(state, playerId);
      expect(state.lanes[0].playerA.speed).toBe(0);
      expect(state.lanes[0].playerA.stopped).toBe(true);
    });

    it("does not affect already stopped player", () => {
      const { state } = mod.init(makePlayers(2));
      const playerId = state.lanes[0].playerA.id;
      state.lanes[0].playerA.stopped = true;
      state.lanes[0].playerA.distance = 300;

      mod.onPlayerDisconnect(state, playerId);
      expect(state.lanes[0].playerA.distance).toBe(300);
    });

    it("returns state unchanged for unknown player", () => {
      const { state } = mod.init(makePlayers(2));
      const result = mod.onPlayerDisconnect(state, "unknown");
      expect(result).toBe(state);
    });
  });
});
