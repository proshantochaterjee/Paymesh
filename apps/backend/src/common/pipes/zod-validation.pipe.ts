import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates a request body/param against a Zod schema from
 * `packages/shared` (docs/API_SPECIFICATION.md "Conventions"). A failed
 * parse throws the raw `ZodError`, which `AllExceptionsFilter` maps to the
 * standard `400 VALIDATION_ERROR` response shape.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    return this.schema.parse(value);
  }
}
