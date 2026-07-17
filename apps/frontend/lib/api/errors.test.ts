import { describe, expect, it } from "vitest";
import { ApiError, throwApiError } from "./errors";

describe("ApiError", () => {
  it("carries the backend's stable error code and details", () => {
    const err = new ApiError(
      { error: "INSUFFICIENT_TREASURY_BALANCE", message: "Not enough funds", details: { shortfall: "50.00" } },
      "fallback",
    );
    expect(err.code).toBe("INSUFFICIENT_TREASURY_BALANCE");
    expect(err.message).toBe("Not enough funds");
    expect(err.details).toEqual({ shortfall: "50.00" });
    expect(err.name).toBe("ApiError");
  });

  it("falls back to the provided message when the body has none", () => {
    const err = new ApiError(null, "Something went wrong");
    expect(err.message).toBe("Something went wrong");
    expect(err.code).toBeUndefined();
  });
});

describe("throwApiError", () => {
  it("parses a JSON error body and throws an ApiError", async () => {
    const res = new Response(JSON.stringify({ error: "SIMULATION_FAILED", message: "Bad inputs" }), { status: 502 });

    await expect(throwApiError(res, "fallback")).rejects.toMatchObject({
      name: "ApiError",
      code: "SIMULATION_FAILED",
      message: "Bad inputs",
    });
  });

  it("still throws a usable ApiError when the body isn't valid JSON", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", { status: 502 });

    await expect(throwApiError(res, "Request failed")).rejects.toMatchObject({
      name: "ApiError",
      message: "Request failed",
      code: undefined,
    });
  });
});
