import { describe, expect, it } from "vitest";

import { hasAtLeastRole } from "./roles";

describe("hasAtLeastRole", () => {
  it("OWNER satisfies every minimum", () => {
    expect(hasAtLeastRole("OWNER", "OWNER")).toBe(true);
    expect(hasAtLeastRole("OWNER", "ADMIN")).toBe(true);
    expect(hasAtLeastRole("OWNER", "FINANCE")).toBe(true);
    expect(hasAtLeastRole("OWNER", "HR")).toBe(true);
    expect(hasAtLeastRole("OWNER", "VIEWER")).toBe(true);
  });

  it("ADMIN satisfies everything except OWNER", () => {
    expect(hasAtLeastRole("ADMIN", "OWNER")).toBe(false);
    expect(hasAtLeastRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasAtLeastRole("ADMIN", "FINANCE")).toBe(true);
    expect(hasAtLeastRole("ADMIN", "HR")).toBe(true);
    expect(hasAtLeastRole("ADMIN", "VIEWER")).toBe(true);
  });

  it("FINANCE and HR are incomparable (docs/PERMISSION_MODEL.md §1)", () => {
    expect(hasAtLeastRole("FINANCE", "HR")).toBe(false);
    expect(hasAtLeastRole("HR", "FINANCE")).toBe(false);
  });

  it("FINANCE and HR each satisfy their own minimum and VIEWER, not ADMIN/OWNER", () => {
    expect(hasAtLeastRole("FINANCE", "FINANCE")).toBe(true);
    expect(hasAtLeastRole("FINANCE", "VIEWER")).toBe(true);
    expect(hasAtLeastRole("FINANCE", "ADMIN")).toBe(false);
    expect(hasAtLeastRole("HR", "HR")).toBe(true);
    expect(hasAtLeastRole("HR", "VIEWER")).toBe(true);
    expect(hasAtLeastRole("HR", "ADMIN")).toBe(false);
  });

  it("VIEWER satisfies only VIEWER", () => {
    expect(hasAtLeastRole("VIEWER", "VIEWER")).toBe(true);
    expect(hasAtLeastRole("VIEWER", "HR")).toBe(false);
    expect(hasAtLeastRole("VIEWER", "FINANCE")).toBe(false);
    expect(hasAtLeastRole("VIEWER", "ADMIN")).toBe(false);
    expect(hasAtLeastRole("VIEWER", "OWNER")).toBe(false);
  });
});
