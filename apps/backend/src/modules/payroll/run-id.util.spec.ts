import { describe, expect, it } from "vitest";

import { deriveChunkRunId } from "./run-id.util";

describe("deriveChunkRunId", () => {
  it("is deterministic for the same payrollRunId + chunkIndex", () => {
    expect(deriveChunkRunId("run1", 0)).toBe(deriveChunkRunId("run1", 0));
  });

  it("differs across chunk indices for the same run", () => {
    expect(deriveChunkRunId("run1", 0)).not.toBe(deriveChunkRunId("run1", 1));
  });

  it("differs across different payrollRunIds for the same chunk index", () => {
    expect(deriveChunkRunId("run1", 0)).not.toBe(deriveChunkRunId("run2", 0));
  });

  it("returns a value within the u64 range", () => {
    const id = deriveChunkRunId("some-cuid-like-id", 3);
    expect(id).toBeGreaterThanOrEqual(0n);
    expect(id).toBeLessThanOrEqual(2n ** 64n - 1n);
  });
});
