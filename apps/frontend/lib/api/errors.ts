/**
 * Every backend error body is `{ error: ApiErrorCode, message: string,
 * details?: unknown }` (apps/backend/src/common/exceptions/domain.exception.ts).
 * `ApiError.code` carries the machine-matchable `error` field so callers
 * (useSignAndSubmit's `formatError`) can branch on the stable code instead
 * of pattern-matching the human-readable `message` string, which can
 * change wording without warning.
 */
export class ApiError extends Error {
  code?: string;
  details?: unknown;

  constructor(body: { error?: string; message?: string; details?: unknown } | null, fallbackMessage: string) {
    super(body?.message || fallbackMessage);
    this.name = "ApiError";
    this.code = body?.error;
    this.details = body?.details;
  }
}

/** Parses a failed `Response`'s JSON error body and throws an `ApiError` carrying its code. */
export async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new ApiError(body, fallbackMessage);
}
