import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({ name: z.string().min(1) });
  const pipe = new ZodValidationPipe(schema);

  it("returns the parsed value when valid", () => {
    expect(pipe.transform({ name: "Acme" })).toEqual({ name: "Acme" });
  });

  it("throws ZodError when invalid", () => {
    expect(() => pipe.transform({ name: "" })).toThrow(ZodError);
  });
});
