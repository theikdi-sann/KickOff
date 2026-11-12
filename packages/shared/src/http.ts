import type { ErrorCode } from './error-codes';

/**
 * The shared error shape. The code vocabulary itself lives in
 * `./error-codes` — one source for both apps and the Edge Functions.
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Field-level validation issues or other structured context. */
  details?: unknown;
  /** Correlates the response with Edge Function logs. */
  requestId?: string;
}

/** Narrows an unknown thrown value into the shared error shape. */
export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApiError>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
