import { describe, expect, it } from "vitest";

import { clubGreeting } from "../greeting";

describe("clubGreeting", () => {
  it("uses the club timezone, not the device timezone", () => {
    // 00:00 UTC = 07:00 in Bangkok.
    expect(clubGreeting(new Date("2026-11-10T00:00:00Z"), "Asia/Bangkok")).toBe("Good morning");
  });

  it("returns the afternoon greeting at 06:00 UTC in Bangkok", () => {
    // 06:00 UTC = 13:00 in Bangkok.
    expect(clubGreeting(new Date("2026-11-10T06:00:00Z"), "Asia/Bangkok")).toBe("Good afternoon");
  });

  it("returns the evening greeting at 12:00 UTC in Bangkok", () => {
    // 12:00 UTC = 19:00 in Bangkok.
    expect(clubGreeting(new Date("2026-11-10T12:00:00Z"), "Asia/Bangkok")).toBe("Good evening");
  });

  it("returns the night greeting at 18:00 UTC in Bangkok", () => {
    // 18:00 UTC = 01:00 the next day in Bangkok.
    expect(clubGreeting(new Date("2026-11-10T18:00:00Z"), "Asia/Bangkok")).toBe("Good night");
  });

  it("greets by the club's clock — the same instant is night in Bangkok, afternoon in London", () => {
    // 16:00 UTC = 23:00 in Bangkok (night), 16:00 in London (afternoon).
    const instant = new Date("2026-11-10T16:00:00Z");
    expect(clubGreeting(instant, "Asia/Bangkok")).toBe("Good night");
    expect(clubGreeting(instant, "Europe/London")).toBe("Good afternoon");
  });
});
