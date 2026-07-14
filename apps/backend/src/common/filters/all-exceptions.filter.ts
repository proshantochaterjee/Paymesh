import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

import { DomainException } from "../exceptions/domain.exception";

interface ErrorResponseBody {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Maps every thrown value to the standard shape in
 * docs/ERROR_HANDLING.md §1. Never leaks internal detail (stack traces,
 * SQL, file paths) to the client, even for a genuinely unexpected error —
 * those are logged server-side with full detail instead (§7).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainException) {
      response.status(exception.getStatus()).json({
        error: exception.code,
        message: exception.message,
        details: exception.details,
      } satisfies ErrorResponseBody);
      return;
    }

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: exception.issues,
      } satisfies ErrorResponseBody);
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        error: httpStatusToGenericErrorCode(exception.getStatus()),
        message: exception.message,
      } satisfies ErrorResponseBody);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: "INTERNAL_ERROR",
      message: "Something went wrong, our team has been notified.",
    } satisfies ErrorResponseBody);
  }
}

/**
 * Fallback mapping for framework-thrown `HttpException`s (guards, built-in
 * pipes) that don't carry a specific `ApiErrorCode` — business-rule
 * failures should throw `DomainException` with a real code instead of
 * relying on this generic bucket.
 */
function httpStatusToGenericErrorCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_ERROR";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHENTICATED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN_ROLE";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    default:
      return "INTERNAL_ERROR";
  }
}
