import { describe, expect, it } from "vitest";

import {
  decimalAmountSchema,
  paginationQuerySchema,
  stellarAddressSchema,
  stellarContractAddressSchema,
} from "./primitives";

const VALID_ACCOUNT = "G" + "A".repeat(55);
const VALID_CONTRACT = "C" + "A".repeat(55);

describe("stellarAddressSchema", () => {
  it("accepts a well-formed G... address", () => {
    expect(stellarAddressSchema.safeParse(VALID_ACCOUNT).success).toBe(true);
  });

  it("rejects wrong prefix, wrong length, and lowercase", () => {
    expect(stellarAddressSchema.safeParse(VALID_CONTRACT).success).toBe(false);
    expect(stellarAddressSchema.safeParse("GABC123").success).toBe(false);
    expect(stellarAddressSchema.safeParse(VALID_ACCOUNT.toLowerCase()).success).toBe(false);
  });
});

describe("stellarContractAddressSchema", () => {
  it("accepts a well-formed C... address and rejects a G... address", () => {
    expect(stellarContractAddressSchema.safeParse(VALID_CONTRACT).success).toBe(true);
    expect(stellarContractAddressSchema.safeParse(VALID_ACCOUNT).success).toBe(false);
  });
});

describe("decimalAmountSchema", () => {
  it("accepts positive decimals with up to 7 fractional digits", () => {
    expect(decimalAmountSchema.safeParse("12500.0000000").success).toBe(true);
    expect(decimalAmountSchema.safeParse("1").success).toBe(true);
  });

  it("rejects zero, negative, and over-precise values", () => {
    expect(decimalAmountSchema.safeParse("0").success).toBe(false);
    expect(decimalAmountSchema.safeParse("-5").success).toBe(false);
    expect(decimalAmountSchema.safeParse("1.12345678").success).toBe(false);
  });
});

describe("paginationQuerySchema", () => {
  it("defaults page/pageSize and coerces numeric strings", () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it("rejects pageSize over the max", () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
