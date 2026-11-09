import { describe, expect, it } from "vitest";

import { formatTHB } from "../theme";

describe("formatTHB smoke", () => {
  it("formats integer baht amounts without decimals", () => {
    expect(formatTHB(150000)).toBe("฿1,500");
  });

  it("formats fractional baht amounts with two decimals", () => {
    expect(formatTHB(155050)).toBe("฿1550.50");
  });
});
