import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReactionSpeedModule } from "./reaction-speed.js";
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

const BASE_TIME = 1000000;

describe("ReactionSpeedModule", () => {
  let mod: ReactionSpeedModule;

  beforeEach(() => {
    mod = new ReactionSpeedModule();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("metadata", () => {
    it("has correct gameId", () => {
      expect(mod.gameId).toBe("reaction-speed");
    });

    it("has shared game meta", () => {
      const meta = GAME_META["reaction-speed"];
      expect(meta).toBeDefined();
      expect(meta.timing.mode).toBe("realtime");
      expect(meta.minPlayers).toBe(1);
    });
  });

  describe("init", () => {
    it("creates state for all players", () => {
      const { state, config } = mod.init(makePlayers(3));
      expect(state.players.size).toBe(3);
      expect(state.round).toBe(1);
      expect(state.finished).toBe(false);
      expect(config.totalRounds).toBe(5);
    });

    it("initializes players with empty reaction times", () => {
      const { state } = mod.init(makePlayers(2));
      const p1 = state.players.get("p1")!;
      expect(p1.reactionTimes).toEqual([]);
      expect(p1.tappedThisRound).toBe(false);
    });

    it("sets signal time in the future", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.signalAt).toBeGreaterThan(BASE_TIME);
      expect(state.signalAt).toBeLessThanOrEqual(BASE_TIME + 5000);
      expect(state.signalShown).toBe(false);
    });

    it("initializes roundEndedAt to 0", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.roundEndedAt).toBe(0);
    });

    it("works for a single player", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.players.size).toBe(1);
    });
  });

  describe("onInput", () => {
    it("records reaction time on valid tap after signal", () => {
      const { state } = mod.init(makePlayers(1));
      state.signalShown = true;
      state.signalAt = BASE_TIME;
      vi.setSystemTime(BASE_TIME + 250);

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.reactionTimes).toEqual([250]);
      expect(updated.players.get("p1")!.tappedThisRound).toBe(true);
    });

    it("detects false start (tap before signal)", () => {
      const { state } = mod.init(makePlayers(1));
      // Signal not shown yet
      state.signalShown = false;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.reactionTimes).toEqual([-1]);
    });

    it("rejects invalid input shapes", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "p1", { foo: "bar" });
      expect(updated.players.get("p1")!.reactionTimes).toEqual([]);
    });

    it("rejects non-object input", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "p1", "tap");
      expect(updated.players.get("p1")!.reactionTimes).toEqual([]);
    });

    it("rejects tap from unknown player", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "unknown", { action: "tap" });
      expect(updated).toBe(state);
    });

    it("rejects duplicate tap in same round", () => {
      const { state } = mod.init(makePlayers(1));
      state.signalShown = true;
      state.signalAt = BASE_TIME;
      vi.setSystemTime(BASE_TIME + 200);

      let updated = mod.onInput(state, "p1", { action: "tap" });
      vi.setSystemTime(BASE_TIME + 300);
      updated = mod.onInput(updated, "p1", { action: "tap" });

      // Should still only have one reaction time
      expect(updated.players.get("p1")!.reactionTimes).toEqual([200]);
    });

    it("rejects tap when round is over", () => {
      const { state } = mod.init(makePlayers(1));
      state.roundOver = true;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.reactionTimes).toEqual([]);
    });

    it("rejects tap when game is finished", () => {
      const { state } = mod.init(makePlayers(1));
      state.finished = true;

      const updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.players.get("p1")!.reactionTimes).toEqual([]);
    });

    it("marks roundOver when all players tap", () => {
      const { state } = mod.init(makePlayers(2));
      state.signalShown = true;
      state.signalAt = BASE_TIME;
      vi.setSystemTime(BASE_TIME + 200);

      let updated = mod.onInput(state, "p1", { action: "tap" });
      expect(updated.roundOver).toBe(false);

      vi.setSystemTime(BASE_TIME + 350);
      updated = mod.onInput(updated, "p2", { action: "tap" });
      expect(updated.roundOver).toBe(true);
      expect(updated.roundEndedAt).toBe(BASE_TIME + 350);
    });
  });

  describe("tick", () => {
    it("shows signal when delay elapses", () => {
      const { state } = mod.init(makePlayers(1));
      state.signalAt = BASE_TIME + 3000;

      // Before signal time
      vi.setSystemTime(BASE_TIME + 2999);
      let updated = mod.tick(state, 0.016);
      expect(updated.signalShown).toBe(false);

      // At signal time
      vi.setSystemTime(BASE_TIME + 3000);
      updated = mod.tick(updated, 0.016);
      expect(updated.signalShown).toBe(true);
    });

    it("auto-ends round after ROUND_TIMEOUT_MS", () => {
      const { state } = mod.init(makePlayers(2));
      state.signalShown = true;
      state.signalAt = BASE_TIME;

      // Just before timeout
      vi.setSystemTime(BASE_TIME + 3000);
      let updated = mod.tick(state, 0.016);
      expect(updated.roundOver).toBe(false);

      // After timeout
      vi.setSystemTime(BASE_TIME + 3001);
      updated = mod.tick(updated, 0.016);
      expect(updated.roundOver).toBe(true);
      expect(updated.roundEndedAt).toBe(BASE_TIME + 3001);

      // All players should be marked as tapped with timeout time
      for (const p of updated.players.values()) {
        expect(p.tappedThisRound).toBe(true);
        expect(p.reactionTimes).toEqual([3000]);
      }
    });

    it("advances to next round after ROUND_PAUSE_MS", () => {
      const { state } = mod.init(makePlayers(1));
      state.signalShown = true;
      state.signalAt = BASE_TIME;
      state.roundOver = true;
      state.roundEndedAt = BASE_TIME + 200;

      // Before pause elapsed
      vi.setSystemTime(BASE_TIME + 200 + 1500);
      let updated = mod.tick(state, 0.016);
      expect(updated.round).toBe(1);

      // After pause elapsed
      vi.setSystemTime(BASE_TIME + 200 + 1501);
      updated = mod.tick(state, 0.016);
      expect(updated.round).toBe(2);
      expect(updated.roundOver).toBe(false);
      expect(updated.signalShown).toBe(false);
      expect(updated.roundEndedAt).toBe(0);
    });

    it("finishes game after all rounds", () => {
      const { state } = mod.init(makePlayers(1));
      state.round = 5; // last round
      state.roundOver = true;
      state.roundEndedAt = BASE_TIME;

      vi.setSystemTime(BASE_TIME + 2000);
      const updated = mod.tick(state, 0.016);
      expect(updated.finished).toBe(true);
    });

    it("does nothing when game is finished", () => {
      const { state } = mod.init(makePlayers(1));
      state.finished = true;

      const updated = mod.tick(state, 0.016);
      expect(updated).toBe(state);
    });

    it("resets player tapped flags on new round", () => {
      const { state } = mod.init(makePlayers(2));
      state.signalShown = true;
      state.signalAt = BASE_TIME;
      state.roundOver = true;
      state.roundEndedAt = BASE_TIME + 200;

      for (const p of state.players.values()) {
        p.tappedThisRound = true;
        p.reactionTimes.push(200);
      }

      vi.setSystemTime(BASE_TIME + 2000);
      const updated = mod.tick(state, 0.016);
      expect(updated.round).toBe(2);
      for (const p of updated.players.values()) {
        expect(p.tappedThisRound).toBe(false);
      }
    });
  });

  describe("serialize", () => {
    it("returns player data with avgMs", () => {
      const { state } = mod.init(makePlayers(2));
      const p1 = state.players.get("p1")!;
      p1.reactionTimes = [200, 300];

      const { data, isDelta } = mod.serialize(state, null);
      expect(isDelta).toBe(false);
      expect(data.players).toHaveLength(2);

      const serializedP1 = data.players.find((p) => p.id === "p1")!;
      expect(serializedP1.avgMs).toBe(250);
      expect(serializedP1.reactionTimes).toEqual([200, 300]);
    });

    it("returns correct round info", () => {
      const { state } = mod.init(makePlayers(1));
      const { data } = mod.serialize(state, null);
      expect(data.round).toBe(1);
      expect(data.totalRounds).toBe(5);
      expect(data.finished).toBe(false);
    });

    it("treats false starts as penalty in avgMs", () => {
      const { state } = mod.init(makePlayers(1));
      const p1 = state.players.get("p1")!;
      p1.reactionTimes = [-1, 300]; // false start + 300ms

      const { data } = mod.serialize(state, null);
      const serializedP1 = data.players.find((p) => p.id === "p1")!;
      // (-1 treated as 500ms penalty) => (500 + 300) / 2 = 400
      expect(serializedP1.avgMs).toBe(400);
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
    it("sorts by average reaction time (lower is better)", () => {
      const { state } = mod.init(makePlayers(2));
      state.players.get("p1")!.reactionTimes = [300, 400];
      state.players.get("p2")!.reactionTimes = [150, 200];

      const results = mod.getResults(state);
      expect(results[0].playerId).toBe("p2"); // faster
      expect(results[0].rank).toBe(1);
      expect(results[1].playerId).toBe("p1");
      expect(results[1].rank).toBe(2);
    });

    it("applies scaling score formula", () => {
      const { state } = mod.init(makePlayers(3));
      state.players.get("p1")!.reactionTimes = [100];
      state.players.get("p2")!.reactionTimes = [200];
      state.players.get("p3")!.reactionTimes = [300];

      const results = mod.getResults(state);
      expect(results[0].score).toBe(100); // 1st
      expect(results[1].score).toBe(50);  // 2nd
      expect(results[2].score).toBe(10);  // 3rd (floor of 10)
    });

    it("gives 100 points to solo player", () => {
      const { state } = mod.init(makePlayers(1));
      state.players.get("p1")!.reactionTimes = [250];

      const results = mod.getResults(state);
      expect(results[0].score).toBe(100);
    });

    it("scales scores for many players", () => {
      const players = makePlayers(8);
      const { state } = mod.init(players);
      for (let i = 0; i < 8; i++) {
        state.players.get(`p${i + 1}`)!.reactionTimes = [100 * (i + 1)];
      }

      const results = mod.getResults(state);
      expect(results[0].score).toBe(100); // 1st
      expect(results[7].score).toBe(10);  // last (floor)
      // Middle players should have differentiated scores
      expect(results[1].score).toBeGreaterThan(results[2].score);
    });

    it("includes false start count in stats", () => {
      const { state } = mod.init(makePlayers(1));
      state.players.get("p1")!.reactionTimes = [-1, 200, -1, 300];

      const results = mod.getResults(state);
      expect(results[0].stats!.falseStarts).toBe(2);
    });

    it("includes avgMs in stats", () => {
      const { state } = mod.init(makePlayers(1));
      state.players.get("p1")!.reactionTimes = [200, 400];

      const results = mod.getResults(state);
      expect(results[0].stats!.avgMs).toBe(300);
    });
  });

  describe("onPlayerDisconnect", () => {
    it("marks disconnected player as tapped with timeout time", () => {
      const { state } = mod.init(makePlayers(2));
      const updated = mod.onPlayerDisconnect(state, "p1");

      const p1 = updated.players.get("p1")!;
      expect(p1.tappedThisRound).toBe(true);
      expect(p1.reactionTimes).toEqual([3000]);
    });

    it("does nothing if player already tapped", () => {
      const { state } = mod.init(makePlayers(1));
      const p1 = state.players.get("p1")!;
      p1.tappedThisRound = true;
      p1.reactionTimes = [250];

      const updated = mod.onPlayerDisconnect(state, "p1");
      expect(updated.players.get("p1")!.reactionTimes).toEqual([250]);
    });

    it("does nothing for unknown player", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onPlayerDisconnect(state, "unknown");
      expect(updated).toBe(state);
    });
  });
});
