import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainException } from "../exceptions/domain.exception";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function createHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter();

  it("maps a DomainException to its code/status/details", () => {
    const { host, status, json } = createHost();
    filter.catch(new DomainException("ORGANIZATION_NOT_FOUND", "No such org.", { orgId: "1" }), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: "ORGANIZATION_NOT_FOUND",
      message: "No such org.",
      details: { orgId: "1" },
    });
  });

  it("maps a ZodError to 400 VALIDATION_ERROR with issues as details", () => {
    const { host, status, json } = createHost();
    const result = z.object({ name: z.string() }).safeParse({});
    filter.catch(result.error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "VALIDATION_ERROR", details: expect.any(Array) }),
    );
  });

  it("maps a generic HttpException by status", () => {
    const { host, status, json } = createHost();
    filter.catch(new ForbiddenException("nope"), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "FORBIDDEN_ROLE", message: "nope" });
  });

  it("maps BadRequestException to VALIDATION_ERROR", () => {
    const { host, status, json } = createHost();
    filter.catch(new BadRequestException("bad"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: "VALIDATION_ERROR", message: "bad" });
  });

  it("never leaks internal detail for an unexpected error", () => {
    const { host, status, json } = createHost();
    filter.catch(new Error("db connection string leaked: postgres://..."), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: "INTERNAL_ERROR",
      message: "Something went wrong, our team has been notified.",
    });
  });
});
