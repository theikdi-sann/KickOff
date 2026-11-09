import { z } from "zod";

/**
 * Error codes are duplicated from `packages/shared/src/http.ts` because Supabase
 * deploys only `supabase/functions/**`. Keep the two unions in sync.
 */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "payment_required"
  | "internal";

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  rate_limited: 429,
  payment_required: 402,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.details = options.details;
  }
}

export interface MappedError {
  error: ApiError;
  status: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPostgrestError(value: unknown): value is { code: string; message: string; details?: string } {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

/** PostgreSQL SQLSTATE → public error code. */
const PG_CODE_MAP: Record<string, ErrorCode> = {
  "23505": "conflict", // unique_violation
  "23503": "conflict", // foreign_key_violation
  "23514": "validation", // check_violation
  "22023": "validation", // invalid_parameter_value
  "42501": "forbidden", // insufficient_privilege
  P0002: "not_found", // no_data_found
  P0001: "conflict", // raise_exception
};

function fromZod(error: z.ZodError): MappedError {
  return {
    status: 422,
    error: {
      code: "validation",
      message: "Request validation failed",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  };
}

function fromPostgrest(error: { code: string; message: string }): MappedError {
  const code = PG_CODE_MAP[error.code] ?? "internal";
  const message = code === "internal" ? "Database request failed" : error.message;
  return { status: STATUS_BY_CODE[code], error: { code, message } };
}

function fromStripe(error: Record<string, unknown>): MappedError {
  const type = typeof error.type === "string" ? error.type : "";
  if (type === "StripeCardError") {
    return {
      status: 402,
      error: {
        code: "payment_required",
        message: typeof error.message === "string" ? error.message : "Card was declined",
      },
    };
  }
  return { status: 500, error: { code: "internal", message: "Payment provider error" } };
}

/** Converts anything thrown by a handler into a safe API error + HTTP status. */
export function toApiError(thrown: unknown, requestId?: string): MappedError {
  const withRequestId = (mapped: MappedError): MappedError =>
    requestId ? { ...mapped, error: { ...mapped.error, requestId } } : mapped;

  if (thrown instanceof AppError) {
    return withRequestId({
      status: thrown.status,
      error: {
        code: thrown.code,
        message: thrown.message,
        ...(thrown.details === undefined ? {} : { details: thrown.details }),
      },
    });
  }

  if (thrown instanceof z.ZodError) return withRequestId(fromZod(thrown));

  if (isPostgrestError(thrown)) return withRequestId(fromPostgrest(thrown));

  if (isRecord(thrown) && typeof thrown.type === "string" && thrown.type.startsWith("Stripe")) {
    return withRequestId(fromStripe(thrown));
  }

  return withRequestId({ status: 500, error: { code: "internal", message: "Internal server error" } });
}
