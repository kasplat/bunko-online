import { describe, it, expect } from "vitest";
import { generateRoomCode } from "./room-code.js";

describe("generateRoomCode", () => {
  it("returns a 4-character string", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
  });

  it("only contains uppercase letters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z]+$/);
    }
  });

  it("excludes confusing characters O, I, L", () => {
    const codes = Array.from({ length: 200 }, () => generateRoomCode());
    const allChars = codes.join("");
    expect(allChars).not.toContain("O");
    expect(allChars).not.toContain("I");
    expect(allChars).not.toContain("L");
  });

  it("produces different codes (not all identical)", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateRoomCode()),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
