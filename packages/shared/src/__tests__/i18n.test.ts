import { describe, expect, it } from "vitest";

import { en, type StringTable } from "../i18n/en";

function flatten(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, path ? `${path}.${key}` : key),
  );
}

describe("English string table", () => {
  it("carries the sections the app renders today", () => {
    expect(en.tabs).toEqual({ home: "Home", tickets: "Tickets", profile: "Profile" });
    expect(en.home.greetingTitle).toBe("Are you ready for match day?");
    expect(en.home.getTickets).toBe("Get tickets");
    expect(en.tickets.title).toBe("My tickets");
    expect(en.tickets.scanInstruction).toBe("SCAN AT THE GATE · ONE ENTRY ONLY");
    expect(en.checkout.title).toBe("Checkout");
    expect(en.settings.deleteAccount).toBe("Delete account");
  });

  it("is typed as a StringTable so a second locale must match its shape", () => {
    const table: StringTable = en;
    expect(flatten(table).length).toBeGreaterThan(20);
  });

  it("contains no blank copy", () => {
    for (const [key, value] of flatten(en)) {
      expect(value.trim(), `${key} must not be blank`).not.toBe("");
    }
  });
});
