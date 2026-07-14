import { describe, expect, it } from "vitest";

import { decimalToStroops, stroopsToDecimal } from "./amount.js";

describe("decimalToStroops", () => {
  it("converts a whole-number amount", () => {
    expect(decimalToStroops("50")).toBe(500_000_000n);
  });

  it("converts a fractional amount with full 7 decimals", () => {
    expect(decimalToStroops("12500.1234567")).toBe(125_001_234_567n);
  });

  it("pads a short fraction to 7 decimals", () => {
    expect(decimalToStroops("1.5")).toBe(15_000_000n);
  });
});

describe("stroopsToDecimal", () => {
  it("converts a whole-number amount", () => {
    expect(stroopsToDecimal(500_000_000n)).toBe("50");
  });

  it("converts a fractional amount, trimming trailing zeros", () => {
    expect(stroopsToDecimal(15_000_000n)).toBe("1.5");
  });

  it("round-trips through decimalToStroops", () => {
    expect(stroopsToDecimal(decimalToStroops("12500.1234567"))).toBe("12500.1234567");
  });

  it("handles zero", () => {
    expect(stroopsToDecimal(0n)).toBe("0");
  });
});
