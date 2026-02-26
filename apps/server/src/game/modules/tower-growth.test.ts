import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TowerGrowthModule } from "./tower-growth.js";
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

describe("TowerGrowthModule", () => {
  let mod: TowerGrowthModule;

  beforeEach(() => {
    mod = new TowerGrowthModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("metadata", () => {
    it("has correct game properties", () => {
      expect(mod.gameId).toBe("tower-growth");
      const meta = GAME_META["tower-growth"];
      expect(meta.minPlayers).toBe(1);
      expect(meta.maxPlayers).toBe(10);
      expect(meta.timing.mode).toBe("realtime");
      expect(meta.timing.maxDurationSecs).toBe(120);
    });
  });

  describe("init", () => {
    it("creates state for all players", () => {
      const { state, config } = mod.init(makePlayers(3));
      expect(state.players.size).toBe(3);
      expect(state.targetHeight).toBe(500);
      expect(config.targetHeight).toBe(500);
      expect(state.lightColor).toBe("red");
      expect(state.finished).toBe(false);
      expect(state.winnerId).toBeNull();
    });

    it("initializes players at height 0", () => {
      const { state } = mod.init(makePlayers(2));
      const p1 = state.players.get("p1")!;
      expect(p1.height).toBe(0);
      expect(p1.tapCount).toBe(0);
      expect(p1.penaltyCount).toBe(0);
    });

    it("works for a single player", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.players.size).toBe(1);
    });

    it("uses custom targetHeight from settings", () => {
      const { state, config } = mod.init(makePlayers(1), {
        targetHeight: 1000,
      });
      expect(state.targetHeight).toBe(1000);
      expect(config.targetHeight).toBe(1000);
    });

    it("clamps targetHeight to minimum 100", () => {
      const { state } = mod.init(makePlayers(1), { targetHeight: 10 });
      expect(state.targetHeight).toBe(100);
    });

    it("clamps targetHeight to maximum 10000", () => {
      const { state } = mod.init(makePlayers(1), { targetHeight: 99999 });
      expect(state.targetHeight).toBe(10000);
    });

    it("defaults targetHeight for invalid settings", () => {
      const { state } = mod.init(makePlayers(1), {
        targetHeight: "invalid",
      });
      expect(state.targetHeight).toBe(500);
    });

    it("starts with light as red", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.lightColor).toBe("red");
    });
  });

  describe("onInput", () => {
    it("grows height on green light", () => {
      const { state } = mod.init(makePlayers(1));
      state.lightColor = "green";

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.height).toBe(10);
      expect(updated.players.get("p1")!.tapCount).toBe(1);
    });

    it("shrinks height on red light", () => {
      const { state } = mod.init(makePlayers(1));
      state.players.get("p1")!.height = 50;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.height).toBe(30);
      expect(updated.players.get("p1")!.penaltyCount).toBe(1);
    });

    it("does not go below 0", () => {
      const { state } = mod.init(makePlayers(1));
      state.players.get("p1")!.height = 5;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.height).toBe(0);
    });

    it("detects winner when reaching target height", () => {
      const { state } = mod.init(makePlayers(1), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.finished).toBe(true);
      expect(updated.winnerId).toBe("p1");
      expect(updated.players.get("p1")!.height).toBe(100);
    });

    it("caps height at targetHeight on win", () => {
      const { state } = mod.init(makePlayers(1), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 99;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.height).toBe(100);
    });

    it("rejects invalid input", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "p1", { foo: "bar" });
      expect(updated.players.get("p1")!.height).toBe(0);
    });

    it("rejects input from nonexistent player", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "unknown", { action: "tap" });
      expect(updated).toBe(state);
    });

    it("rejects input when game is finished", () => {
      const { state } = mod.init(makePlayers(1));
      state.finished = true;
      state.lightColor = "green";

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.height).toBe(0);
    });

    it("allows rapid tapping without cooldown", () => {
      const { state } = mod.init(makePlayers(1));
      state.lightColor = "green";

      let s = state;
      for (let i = 0; i < 10; i++) {
        s = mod.onInput(s, "p1", { action: "tap" });
      }
      expect(s.players.get("p1")!.height).toBe(100);
      expect(s.players.get("p1")!.tapCount).toBe(10);
    });
  });

  describe("tick", () => {
    it("toggles light when duration expires", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.lightColor).toBe("red");

      vi.setSystemTime(state.nextLightChangeAt + 1);
      const updated = mod.tick(state, 0.05);
      expect(updated.lightColor).toBe("green");
    });

    it("schedules next light change after toggle", () => {
      const { state } = mod.init(makePlayers(1));
      const firstChange = state.nextLightChangeAt;

      vi.setSystemTime(firstChange + 1);
      const updated = mod.tick(state, 0.05);
      expect(updated.nextLightChangeAt).toBeGreaterThan(firstChange);
    });

    it("does not toggle before scheduled time", () => {
      const { state } = mod.init(makePlayers(1));
      vi.setSystemTime(state.nextLightChangeAt - 100);
      const updated = mod.tick(state, 0.05);
      expect(updated.lightColor).toBe("red");
    });

    it("ends game after max duration", () => {
      const { state } = mod.init(makePlayers(1));
      // Push next light change far out so it doesn't interfere
      state.nextLightChangeAt = state.startedAt + 200_000;

      vi.setSystemTime(state.startedAt + 120_000);
      const updated = mod.tick(state, 0.05);
      expect(updated.finished).toBe(true);
    });

    it("does nothing when game is finished", () => {
      const { state } = mod.init(makePlayers(1));
      state.finished = true;
      const original = state.lightColor;

      vi.setSystemTime(state.nextLightChangeAt + 1);
      const updated = mod.tick(state, 0.05);
      expect(updated.lightColor).toBe(original);
    });
  });

  describe("serialize", () => {
    it("returns correct broadcast shape", () => {
      const { state } = mod.init(makePlayers(2));
      const { data, isDelta } = mod.serialize(state, null);

      expect(isDelta).toBe(false);
      expect(data.lightColor).toBe("red");
      expect(data.targetHeight).toBe(500);
      expect(data.finished).toBe(false);
      expect(data.winnerId).toBeNull();
      expect(data.players).toHaveLength(2);
      expect(data.players[0]).toEqual(
        expect.objectContaining({
          id: "p1",
          height: 0,
          tapCount: 0,
          penaltyCount: 0,
        }),
      );
    });
  });

  describe("isGameOver", () => {
    it("returns false when game is in progress", () => {
      const { state } = mod.init(makePlayers(1));
      expect(mod.isGameOver(state)).toBe(false);
    });

    it("returns true when finished", () => {
      const { state } = mod.init(makePlayers(1));
      state.finished = true;
      expect(mod.isGameOver(state)).toBe(true);
    });
  });

  describe("getResults", () => {
    it("ranks winner first with 100 points", () => {
      const { state } = mod.init(makePlayers(2));
      state.finished = true;
      state.winnerId = "p1";
      state.players.get("p1")!.height = state.targetHeight;
      state.players.get("p2")!.height = 250;

      const results = mod.getResults(state);
      expect(results[0].playerId).toBe("p1");
      expect(results[0].score).toBe(100);
      expect(results[0].rank).toBe(1);
      expect(results[1].playerId).toBe("p2");
      expect(results[1].rank).toBe(2);
    });

    it("scores non-winners proportional to progress", () => {
      const { state } = mod.init(makePlayers(2));
      state.finished = true;
      state.winnerId = "p1";
      state.players.get("p1")!.height = state.targetHeight;
      state.players.get("p2")!.height = 250; // 50% of 500

      const results = mod.getResults(state);
      expect(results[1].score).toBe(40); // 50% * 80 = 40
    });

    it("gives minimum 10 points", () => {
      const { state } = mod.init(makePlayers(2));
      state.finished = true;
      state.winnerId = "p1";
      state.players.get("p1")!.height = state.targetHeight;
      state.players.get("p2")!.height = 0;

      const results = mod.getResults(state);
      expect(results[1].score).toBe(10);
    });

    it("includes stats in results", () => {
      const { state } = mod.init(makePlayers(1));
      state.players.get("p1")!.height = 100;
      state.players.get("p1")!.tapCount = 10;
      state.players.get("p1")!.penaltyCount = 2;

      const results = mod.getResults(state);
      expect(results[0].stats).toEqual({
        height: 100,
        tapCount: 10,
        penaltyCount: 2,
      });
    });

    it("ranks by height when no winner (timeout)", () => {
      const { state } = mod.init(makePlayers(3));
      state.finished = true;
      state.players.get("p1")!.height = 100;
      state.players.get("p2")!.height = 300;
      state.players.get("p3")!.height = 200;

      const results = mod.getResults(state);
      expect(results[0].playerId).toBe("p2");
      expect(results[1].playerId).toBe("p3");
      expect(results[2].playerId).toBe("p1");
    });
  });

  describe("onPlayerDisconnect", () => {
    it("does not change state", () => {
      const { state } = mod.init(makePlayers(2));
      state.players.get("p1")!.height = 50;

      const updated = mod.onPlayerDisconnect(state, "p1");
      expect(updated).toBe(state);
      expect(updated.players.get("p1")!.height).toBe(50);
    });
  });
});
