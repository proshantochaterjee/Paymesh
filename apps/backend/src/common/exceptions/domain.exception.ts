import { HttpException } from "@nestjs/common";
import { API_ERROR_STATUS_MAP, type ApiErrorCode } from "@workforceos/shared";

/**
 * The typed exception every service throws for a business-rule failure
 * (docs/ERROR_HANDLING.md §1-2) — `code` is a stable, machine-matchable
 * string the frontend branches on; the HTTP status is derived from
 * `packages/shared`'s status map so it can never drift from the
 * documented category table.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ error: code, message, details }, API_ERROR_STATUS_MAP[code]);
  }
}
