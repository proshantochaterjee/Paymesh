import type { ApiErrorCode } from "../constants/api-errors.js";

/** docs/ERROR_HANDLING.md §1 */
export interface ApiErrorResponse {
  error: ApiErrorCode;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

/** docs/API_SPECIFICATION.md "Every 'intent' endpoint follows the same shape" */
export interface IntentResponse {
  intentId: string;
  unsignedXdr: string;
  expiresAt: string;
}

export interface IntentSubmitResponse {
  status: "submitted";
  stellarTxHash: string;
}
