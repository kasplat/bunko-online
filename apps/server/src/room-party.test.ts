import { describe, it, expect } from "vitest";
import { sanitizeName, isValidClientMessage } from "./room-party.js";

describe("sanitizeName", () => {
  it("passes through a normal name", () => {
    expect(sanitizeName("Alice")).toBe("Alice");
  });

  it("strips special characters", () => {
    expect(sanitizeName("Al!ce@#$")).toBe("Alce");
  });

  it("preserves hyphens", () => {
    expect(sanitizeName("Mary-Jane")).toBe("Mary-Jane");
  });

  it("preserves underscores", () => {
    expect(sanitizeName("cool_player")).toBe("cool_player");
  });

  it("preserves spaces", () => {
    expect(sanitizeName("John Doe")).toBe("John Doe");
  });

  it("trims whitespace", () => {
    expect(sanitizeName("  Bob  ")).toBe("Bob");
  });

  it("truncates to 20 characters", () => {
    const long = "A".repeat(30);
    expect(sanitizeName(long)).toHaveLength(20);
  });

  it("returns empty string for all-special input", () => {
    expect(sanitizeName("!@#$%^&*()")).toBe("");
  });

  it("handles empty string", () => {
    expect(sanitizeName("")).toBe("");
  });
});

describe("isValidClientMessage", () => {
  it("rejects non-object values", () => {
    expect(isValidClientMessage(null)).toBe(false);
    expect(isValidClientMessage(undefined)).toBe(false);
    expect(isValidClientMessage("string")).toBe(false);
    expect(isValidClientMessage(42)).toBe(false);
  });

  it("rejects objects without type", () => {
    expect(isValidClientMessage({ foo: "bar" })).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(isValidClientMessage({ type: "c2s:unknown" })).toBe(false);
  });

  describe("c2s:select_game", () => {
    it("accepts valid select_game", () => {
      expect(
        isValidClientMessage({ type: "c2s:select_game", gameId: "type-racer" }),
      ).toBe(true);
    });

    it("rejects missing gameId", () => {
      expect(isValidClientMessage({ type: "c2s:select_game" })).toBe(false);
    });

    it("rejects non-string gameId", () => {
      expect(
        isValidClientMessage({ type: "c2s:select_game", gameId: 123 }),
      ).toBe(false);
    });
  });

  describe("c2s:ready", () => {
    it("accepts valid ready message", () => {
      expect(
        isValidClientMessage({ type: "c2s:ready", ready: true }),
      ).toBe(true);
      expect(
        isValidClientMessage({ type: "c2s:ready", ready: false }),
      ).toBe(true);
    });

    it("rejects non-boolean ready", () => {
      expect(
        isValidClientMessage({ type: "c2s:ready", ready: "yes" }),
      ).toBe(false);
    });
  });

  describe("c2s:start_game", () => {
    it("accepts valid start_game", () => {
      expect(isValidClientMessage({ type: "c2s:start_game" })).toBe(true);
    });
  });

  describe("c2s:leave_room", () => {
    it("accepts valid leave_room", () => {
      expect(isValidClientMessage({ type: "c2s:leave_room" })).toBe(true);
    });
  });

  describe("c2s:return_to_lobby", () => {
    it("accepts valid return_to_lobby", () => {
      expect(isValidClientMessage({ type: "c2s:return_to_lobby" })).toBe(true);
    });
  });

  describe("c2s:game_settings", () => {
    it("accepts valid game_settings", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_settings",
          gameId: "type-racer",
          settings: { passageLength: "short" },
        }),
      ).toBe(true);
    });

    it("rejects missing gameId", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_settings",
          settings: { passageLength: "short" },
        }),
      ).toBe(false);
    });

    it("rejects missing settings", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_settings",
          gameId: "type-racer",
        }),
      ).toBe(false);
    });

    it("rejects null settings", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_settings",
          gameId: "type-racer",
          settings: null,
        }),
      ).toBe(false);
    });

    it("rejects non-object settings", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_settings",
          gameId: "type-racer",
          settings: "not-an-object",
        }),
      ).toBe(false);
    });
  });

  describe("c2s:game_input", () => {
    it("accepts valid game_input", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_input",
          gameId: "type-racer",
          payload: { typed: "hello" },
        }),
      ).toBe(true);
    });

    it("rejects missing gameId", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_input",
          payload: { typed: "hello" },
        }),
      ).toBe(false);
    });

    it("rejects missing payload", () => {
      expect(
        isValidClientMessage({
          type: "c2s:game_input",
          gameId: "type-racer",
        }),
      ).toBe(false);
    });
  });
});
