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
      expect(state.finishOrder).toEqual([]);
    });

    it("initializes players at height 0 and not finished", () => {
      const { state } = mod.init(makePlayers(2));
      const p1 = state.players.get("p1")!;
      expect(p1.height).toBe(0);
      expect(p1.tapCount).toBe(0);
      expect(p1.penaltyCount).toBe(0);
      expect(p1.finished).toBe(false);
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

    it("marks player finished when reaching target (single player ends game)", () => {
      const { state } = mod.init(makePlayers(1), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.finished).toBe(true);
      expect(updated.players.get("p1")!.height).toBe(100);
      expect(updated.finishOrder).toEqual(["p1"]);
      expect(updated.finished).toBe(true); // single player = game over
    });

    it("does not end game when first of multiple players finishes", () => {
      const { state } = mod.init(makePlayers(3), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.finished).toBe(true);
      expect(updated.finishOrder).toEqual(["p1"]);
      expect(updated.finished).toBe(false); // 2 players still going
    });

    it("auto-finishes last remaining player", () => {
      const { state } = mod.init(makePlayers(2), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      // p1 finishes, p2 is the only one left → auto-placed last
      expect(updated.finishOrder).toEqual(["p1", "p2"]);
      expect(updated.players.get("p2")!.finished).toBe(true);
      expect(updated.finished).toBe(true);
    });

    it("ends game when all players finish", () => {
      const { state } = mod.init(makePlayers(3), { targetHeight: 100 });
      state.lightColor = "green";

      // p1 finishes
      state.players.get("p1")!.height = 95;
      let s = mod.onInput(state, "p1", { action: "tap" });
      expect(s.finished).toBe(false);

      // p2 finishes → p3 auto-placed last
      s.players.get("p2")!.height = 95;
      s = mod.onInput(s, "p2", { action: "tap" });
      expect(s.finishOrder).toEqual(["p1", "p2", "p3"]);
      expect(s.finished).toBe(true);
    });

    it("ignores input from finished player", () => {
      const { state } = mod.init(makePlayers(2), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;

      const s = mod.onInput(state, "p1", { action: "tap" });
      // p1 is finished, try tapping again
      const s2 = mod.onInput(s, "p1", { action: "tap" });
      expect(s2.players.get("p1")!.height).toBe(100); // unchanged
      expect(s2.players.get("p1")!.tapCount).toBe(1); // not incremented
    });

    it("caps height at targetHeight on finish", () => {
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
      const { state } = mod.init(makePlayers(2));
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

    it("ends game after max duration and ranks unfinished by height", () => {
      const { state } = mod.init(makePlayers(3));
      state.nextLightChangeAt = state.startedAt + 200_000;

      // p1 already finished earlier
      state.players.get("p1")!.finished = true;
      state.players.get("p1")!.height = state.targetHeight;
      state.finishOrder.push("p1");

      // p2 and p3 still going with different heights
      state.players.get("p2")!.height = 300;
      state.players.get("p3")!.height = 200;

      vi.setSystemTime(state.startedAt + 120_000);
      const updated = mod.tick(state, 0.05);
      expect(updated.finished).toBe(true);
      // p2 ranked before p3 (higher height)
      expect(updated.finishOrder).toEqual(["p1", "p2", "p3"]);
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
      expect(data.finishOrder).toEqual([]);
      expect(data.players).toHaveLength(2);
      expect(data.players[0]).toEqual(
        expect.objectContaining({
          id: "p1",
          height: 0,
          tapCount: 0,
          penaltyCount: 0,
          finished: false,
          finishPosition: 0,
        }),
      );
    });

    it("includes finish position for finished players", () => {
      const { state } = mod.init(makePlayers(2), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;
      const s = mod.onInput(state, "p1", { action: "tap" });

      const { data } = mod.serialize(s, null);
      const p1 = data.players.find((p) => p.id === "p1")!;
      expect(p1.finished).toBe(true);
      expect(p1.finishPosition).toBe(1);
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
    it("uses score table: 1st=100, 2nd=80, 3rd=65", () => {
      const { state } = mod.init(makePlayers(3), { targetHeight: 100 });
      state.lightColor = "green";

      // Finish in order: p1, p2, then p3 auto-placed
      state.players.get("p1")!.height = 95;
      let s = mod.onInput(state, "p1", { action: "tap" });
      s.players.get("p2")!.height = 95;
      s = mod.onInput(s, "p2", { action: "tap" });

      const results = mod.getResults(s);
      expect(results[0].playerId).toBe("p1");
      expect(results[0].score).toBe(100);
      expect(results[0].rank).toBe(1);
      expect(results[1].playerId).toBe("p2");
      expect(results[1].score).toBe(80);
      expect(results[1].rank).toBe(2);
      expect(results[2].playerId).toBe("p3");
      expect(results[2].score).toBe(65);
      expect(results[2].rank).toBe(3);
    });

    it("includes stats in results", () => {
      const { state } = mod.init(makePlayers(1), { targetHeight: 100 });
      state.lightColor = "green";
      state.players.get("p1")!.height = 95;
      state.players.get("p1")!.tapCount = 10;
      state.players.get("p1")!.penaltyCount = 2;

      const s = mod.onInput(state, "p1", { action: "tap" });
      const results = mod.getResults(s);
      expect(results[0].stats).toEqual({
        height: 100,
        tapCount: 11,
        penaltyCount: 2,
      });
    });

    it("ranks by finish order not height", () => {
      const { state } = mod.init(makePlayers(3), { targetHeight: 100 });
      state.lightColor = "green";

      // p2 finishes first
      state.players.get("p2")!.height = 95;
      let s = mod.onInput(state, "p2", { action: "tap" });

      // p1 finishes second → p3 auto-placed last
      s.players.get("p1")!.height = 95;
      s = mod.onInput(s, "p1", { action: "tap" });

      const results = mod.getResults(s);
      expect(results[0].playerId).toBe("p2");
      expect(results[1].playerId).toBe("p1");
      expect(results[2].playerId).toBe("p3");
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
