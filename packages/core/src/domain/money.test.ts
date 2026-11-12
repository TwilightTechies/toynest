import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatMoney(59900)).toBe("₹599");
    expect(formatMoney(0)).toBe("₹0");
  });

  it("uses Indian digit grouping (lakhs)", () => {
    expect(formatMoney(149900)).toBe("₹1,499");
    expect(formatMoney(12499900)).toBe("₹1,24,999");
  });

  it("shows paise when the amount is not whole rupees", () => {
    expect(formatMoney(59950)).toBe("₹599.50");
    expect(formatMoney(5)).toBe("₹0.05");
  });
});
