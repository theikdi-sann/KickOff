/** Stable machine-readable error codes shared by Edge Functions and both apps. */
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'payment_required'
  | 'internal';

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Field-level validation issues or other structured context. */
  details?: unknown;
  /** Correlates the response with Edge Function logs. */
  requestId?: string;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function apiOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function apiFail(
  code: ErrorCode,
  message: string,
  options: { details?: unknown; requestId?: string } = {},
): ApiResponse<never> {
  return { ok: false, error: { code, message, ...options } };
}

/** Narrows an unknown thrown value into the shared error shape. */
export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApiError>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
