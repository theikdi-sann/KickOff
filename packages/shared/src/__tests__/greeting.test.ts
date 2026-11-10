import { describe, expect, it } from "vitest";

import { bangkokGreeting } from "../greeting";

describe("bangkokGreeting", () => {
  it("uses Asia/Bangkok, not the device timezone", () => {
    // 00:00 UTC = 07:00 in Bangkok.
    expect(bangkokGreeting(new Date("2026-11-10T00:00:00Z"))).toBe("Good morning");
  });

  it("returns the afternoon greeting at 06:00 UTC", () => {
    // 06:00 UTC = 13:00 in Bangkok.
    expect(bangkokGreeting(new Date("2026-11-10T06:00:00Z"))).toBe("Good afternoon");
  });

  it("returns the evening greeting at 12:00 UTC", () => {
    // 12:00 UTC = 19:00 in Bangkok.
    expect(bangkokGreeting(new Date("2026-11-10T12:00:00Z"))).toBe("Good evening");
  });

  it("returns the night greeting at 18:00 UTC", () => {
    // 18:00 UTC = 01:00 the next day in Bangkok.
    expect(bangkokGreeting(new Date("2026-11-10T18:00:00Z"))).toBe("Good night");
  });
});
