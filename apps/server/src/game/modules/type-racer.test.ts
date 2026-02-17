import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TypeRacerModule } from "./type-racer.js";
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

describe("TypeRacerModule", () => {
  let mod: TypeRacerModule;

  beforeEach(() => {
    mod = new TypeRacerModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("metadata", () => {
    it("has correct game properties", () => {
      expect(mod.gameId).toBe("type-racer");
      const meta = GAME_META["type-racer"];
      expect(meta.minPlayers).toBe(1);
      expect(meta.maxPlayers).toBe(10);
      expect(meta.timing.mode).toBe("turnbased");
      expect(meta.timing.maxDurationSecs).toBe(60);
    });
  });

  describe("init", () => {
    it("creates state for all players", () => {
      const players = makePlayers(3);
      const { state, config } = mod.init(players);

      expect(state.players.size).toBe(3);
      expect(state.text.length).toBeGreaterThan(0);
      expect(state.durationSecs).toBe(60);
      expect(config.text).toBe(state.text);
      expect(config.durationSecs).toBe(60);
    });

    it("initializes players with empty progress", () => {
      const { state } = mod.init(makePlayers(2));
      const p1 = state.players.get("p1")!;

      expect(p1.typed).toBe("");
      expect(p1.wpm).toBe(0);
      expect(p1.finished).toBe(false);
      expect(p1.finishTime).toBeNull();
    });

    it("works for a single player", () => {
      const { state } = mod.init(makePlayers(1));
      expect(state.players.size).toBe(1);
    });

    it("uses short passages when passageLength is 'short'", () => {
      const { state } = mod.init(makePlayers(1), { passageLength: "short" });
      // Short passages are single sentences (< 50 chars)
      expect(state.text.length).toBeLessThan(60);
    });

    it("uses long passages when passageLength is 'long'", () => {
      const { state } = mod.init(makePlayers(1), { passageLength: "long" });
      // Long passages are multiple sentences (> 100 chars)
      expect(state.text.length).toBeGreaterThan(100);
    });

    it("defaults to medium passages when passageLength is missing", () => {
      const { state: withSettings } = mod.init(makePlayers(1), {});
      const { state: noSettings } = mod.init(makePlayers(1));
      // Both should pick from medium passages (60-100 chars range)
      expect(withSettings.text.length).toBeGreaterThan(40);
      expect(noSettings.text.length).toBeGreaterThan(40);
    });

    it("uses custom time limit from settings", () => {
      const { state, config } = mod.init(makePlayers(1), { timeLimit: 30 });
      expect(state.durationSecs).toBe(30);
      expect(config.durationSecs).toBe(30);
    });

    it("clamps time limit to minimum 15 seconds", () => {
      const { state } = mod.init(makePlayers(1), { timeLimit: 5 });
      expect(state.durationSecs).toBe(15);
    });

    it("clamps time limit to maximum 300 seconds", () => {
      const { state } = mod.init(makePlayers(1), { timeLimit: 999 });
      expect(state.durationSecs).toBe(300);
    });

    it("defaults to GAME_META duration when timeLimit is not a number", () => {
      const { state } = mod.init(makePlayers(1), { timeLimit: "invalid" });
      expect(state.durationSecs).toBe(60);
    });

    it("falls back to medium for invalid passageLength", () => {
      const { state } = mod.init(makePlayers(1), { passageLength: "huge" });
      // Should use medium passages (same range as default)
      expect(state.text.length).toBeGreaterThan(40);
    });
  });

  describe("onInput", () => {
    it("updates typed text for valid prefix input", () => {
      const { state } = mod.init(makePlayers(1));
      const prefix = state.text.slice(0, 5);

      const updated = mod.onInput(state, "p1", { typed: prefix });
      expect(updated.players.get("p1")!.typed).toBe(prefix);
    });

    it("rejects input that is not a prefix of the target text", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "p1", { typed: "ZZZZZ" });
      expect(updated.players.get("p1")!.typed).toBe("");
    });

    it("rejects input longer than the target text", () => {
      const { state } = mod.init(makePlayers(1));
      const tooLong = state.text + "extra";
      const updated = mod.onInput(state, "p1", { typed: tooLong });
      expect(updated.players.get("p1")!.typed).toBe("");
    });

    it("rejects invalid input shape", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "p1", { foo: "bar" });
      expect(updated.players.get("p1")!.typed).toBe("");
    });

    it("rejects input from nonexistent player", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onInput(state, "unknown", { typed: "a" });
      expect(updated).toBe(state); // unchanged
    });

    it("rejects input from finished player", () => {
      const { state } = mod.init(makePlayers(1));
      // Finish the player first
      vi.advanceTimersByTime(5000);
      const finished = mod.onInput(state, "p1", { typed: state.text });
      expect(finished.players.get("p1")!.finished).toBe(true);

      // Further input should be ignored
      const after = mod.onInput(finished, "p1", { typed: "" });
      expect(after.players.get("p1")!.typed).toBe(state.text);
    });

    it("marks player as finished when full text is typed", () => {
      const { state } = mod.init(makePlayers(1));
      vi.advanceTimersByTime(10000);

      const updated = mod.onInput(state, "p1", { typed: state.text });
      const p1 = updated.players.get("p1")!;

      expect(p1.finished).toBe(true);
      expect(p1.finishTime).not.toBeNull();
    });

    it("calculates WPM based on elapsed time", () => {
      const { state } = mod.init(makePlayers(1));
      // Advance 30 seconds
      vi.advanceTimersByTime(30000);

      // Type a prefix with some words
      const words = state.text.split(/\s+/);
      const firstThreeWords = words.slice(0, 3).join(" ");
      // Make sure it's actually a prefix
      if (state.text.startsWith(firstThreeWords)) {
        const updated = mod.onInput(state, "p1", { typed: firstThreeWords });
        // 3 words in 0.5 minutes = 6 WPM
        expect(updated.players.get("p1")!.wpm).toBe(6);
      }
    });
  });

  describe("serialize", () => {
    it("returns player progress and timing info", () => {
      const { state } = mod.init(makePlayers(2));
      const { data, isDelta } = mod.serialize(state, null);

      expect(isDelta).toBe(false);
      expect(data.text).toBe(state.text);
      expect(data.players).toHaveLength(2);
      expect(data.durationSecs).toBe(60);
      expect(data.players[0]).toEqual(
        expect.objectContaining({
          id: "p1",
          progress: 0,
          wpm: 0,
          finished: false,
        }),
      );
    });

    it("calculates progress as fraction of text typed", () => {
      const { state } = mod.init(makePlayers(1));
      const half = state.text.slice(0, Math.floor(state.text.length / 2));
      vi.advanceTimersByTime(5000);
      const updated = mod.onInput(state, "p1", { typed: half });

      const { data } = mod.serialize(updated, null);
      const expectedProgress = half.length / state.text.length;
      expect(data.players[0].progress).toBeCloseTo(expectedProgress, 5);
    });
  });

  describe("isGameOver", () => {
    it("returns false when game is in progress", () => {
      const { state } = mod.init(makePlayers(2));
      expect(mod.isGameOver(state)).toBe(false);
    });

    it("returns true when all players finish", () => {
      const { state } = mod.init(makePlayers(2));
      vi.advanceTimersByTime(5000);

      let updated = mod.onInput(state, "p1", { typed: state.text });
      updated = mod.onInput(updated, "p2", { typed: state.text });

      expect(mod.isGameOver(updated)).toBe(true);
    });

    it("returns true when time expires", () => {
      const { state } = mod.init(makePlayers(1));
      vi.advanceTimersByTime(61000); // past 60s

      expect(mod.isGameOver(state)).toBe(true);
    });

    it("returns false just before timeout", () => {
      const { state } = mod.init(makePlayers(1));
      vi.advanceTimersByTime(59000);

      expect(mod.isGameOver(state)).toBe(false);
    });
  });

  describe("getResults", () => {
    it("ranks finished players by finish time", () => {
      const { state } = mod.init(makePlayers(2));

      vi.advanceTimersByTime(5000);
      let updated = mod.onInput(state, "p1", { typed: state.text });
      vi.advanceTimersByTime(3000);
      updated = mod.onInput(updated, "p2", { typed: state.text });

      const results = mod.getResults(updated);
      expect(results[0].playerId).toBe("p1");
      expect(results[0].rank).toBe(1);
      expect(results[1].playerId).toBe("p2");
      expect(results[1].rank).toBe(2);
    });

    it("ranks finished players above unfinished", () => {
      const { state } = mod.init(makePlayers(2));
      vi.advanceTimersByTime(5000);

      const updated = mod.onInput(state, "p1", { typed: state.text });
      const results = mod.getResults(updated);

      expect(results[0].playerId).toBe("p1");
      expect(results[1].playerId).toBe("p2");
    });

    it("scores finished players with descending points", () => {
      const { state } = mod.init(makePlayers(3));
      vi.advanceTimersByTime(5000);

      let updated = mod.onInput(state, "p1", { typed: state.text });
      vi.advanceTimersByTime(1000);
      updated = mod.onInput(updated, "p2", { typed: state.text });
      vi.advanceTimersByTime(1000);
      updated = mod.onInput(updated, "p3", { typed: state.text });

      const results = mod.getResults(updated);
      expect(results[0].score).toBe(100); // 1st place
      expect(results[1].score).toBe(80); // 2nd place
      expect(results[2].score).toBe(60); // 3rd place
    });

    it("gives minimum 10 points to finished players", () => {
      // With 6+ players, later places would go below 10 without the floor
      const players = makePlayers(6);
      const { state } = mod.init(players);
      vi.advanceTimersByTime(5000);

      let updated = state;
      for (let i = 0; i < 6; i++) {
        updated = mod.onInput(updated, `p${i + 1}`, { typed: state.text });
        vi.advanceTimersByTime(500);
      }

      const results = mod.getResults(updated);
      expect(results[5].score).toBe(10); // floor of 10
    });

    it("scores unfinished players based on progress", () => {
      const { state } = mod.init(makePlayers(1));
      const half = state.text.slice(0, Math.floor(state.text.length / 2));
      vi.advanceTimersByTime(5000);
      const updated = mod.onInput(state, "p1", { typed: half });

      const results = mod.getResults(updated);
      const expectedScore = Math.round(
        (half.length / state.text.length) * 50,
      );
      expect(results[0].score).toBe(expectedScore);
    });

    it("includes wpm and progress in stats", () => {
      const { state } = mod.init(makePlayers(1));
      vi.advanceTimersByTime(5000);
      const updated = mod.onInput(state, "p1", { typed: state.text });

      const results = mod.getResults(updated);
      expect(results[0].stats).toHaveProperty("wpm");
      expect(results[0].stats).toHaveProperty("progress");
      expect(results[0].stats!.progress).toBe(1);
    });

    it("ranks unfinished players by progress", () => {
      const { state } = mod.init(makePlayers(2));
      vi.advanceTimersByTime(5000);

      const longer = state.text.slice(0, 20);
      const shorter = state.text.slice(0, 5);
      let updated = mod.onInput(state, "p1", { typed: shorter });
      updated = mod.onInput(updated, "p2", { typed: longer });

      const results = mod.getResults(updated);
      expect(results[0].playerId).toBe("p2"); // more progress = higher rank
      expect(results[1].playerId).toBe("p1");
    });
  });

  describe("onPlayerDisconnect", () => {
    it("marks disconnected player as finished", () => {
      const { state } = mod.init(makePlayers(2));
      const updated = mod.onPlayerDisconnect(state, "p1");

      expect(updated.players.get("p1")!.finished).toBe(true);
    });

    it("does nothing for unknown player", () => {
      const { state } = mod.init(makePlayers(1));
      const updated = mod.onPlayerDisconnect(state, "unknown");
      expect(updated).toBe(state);
    });
  });
});
