import { isApiError, type ApiError, type ErrorCode } from '@xclub/shared';
import { supabase } from './supabase';

export type { ApiError, ErrorCode };

interface InvokeOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface ErrorEnvelope {
  error?: ApiError;
}

/**
 * Error thrown by the mobile API client. `status` is present for HTTP
 * responses; a network failure has no status and `code: "network"`.
 */
export class ApiClientError extends Error {
  readonly code: ErrorCode | 'network';
  readonly status?: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      code?: ErrorCode | 'network';
      status?: number;
      details?: unknown;
      requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = options.code ?? 'internal';
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
  }

  get retryable(): boolean {
    return this.status === undefined || this.status === 429 || this.status >= 500;
  }
}

/**
 * Single-flight refresh: concurrent 401s share one refresh request so a cold
 * start cannot stampede Supabase Auth and invalidate its own refresh token.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        return !error && Boolean(data.session);
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function isNetworkFailure(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError';
}

async function toApiError(error: unknown): Promise<ApiClientError> {
  const response = (error as { context?: Response } | null)?.context;
  const fallbackMessage =
    error instanceof Error && error.message ? error.message : 'The request could not be completed.';

  if (!response || isNetworkFailure(error)) {
    return new ApiClientError(
      isNetworkFailure(error) ? 'Check your connection and try again.' : fallbackMessage,
      { code: isNetworkFailure(error) ? 'network' : 'internal' },
    );
  }

  let body: ErrorEnvelope | null = null;
  try {
    body = (await response.clone().json()) as ErrorEnvelope;
  } catch {
    // Non-JSON error body — keep the original message and status.
  }

  const apiError = body?.error;
  if (apiError && isApiError(apiError)) {
    return new ApiClientError(apiError.message, {
      code: apiError.code,
      details: apiError.details,
      requestId: apiError.requestId,
      status: response.status,
    });
  }

  return new ApiClientError(fallbackMessage, { status: response.status });
}

async function invoke<T>(name: string, options: InvokeOptions): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, options);
  if (error) throw await toApiError(error);

  // Edge Functions answer with the shared `{ ok, data }` envelope.
  const envelope = data as { ok?: unknown; data?: T; error?: ApiError } | null;
  if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
    if (envelope.ok === true) return envelope.data as T;
    if (envelope.error && isApiError(envelope.error)) {
      throw new ApiClientError(envelope.error.message, {
        code: envelope.error.code,
        details: envelope.error.details,
        requestId: envelope.error.requestId,
        status: 200,
      });
    }
    throw new ApiClientError('The server returned an unexpected response.', { status: 200 });
  }

  return data as T;
}

/**
 * Typed Edge Function client with a single automatic session refresh on 401.
 * Every call unwraps the shared `{ ok, data }` envelope and throws
 * `ApiClientError` otherwise.
 */
export const api = {
  async call<T>(name: string, options: InvokeOptions = {}): Promise<T> {
    try {
      return await invoke<T>(name, options);
    } catch (error) {
      const apiError = error instanceof ApiClientError ? error : await toApiError(error);
      if (apiError.status !== 401) throw apiError;

      const refreshed = await refreshSessionOnce();
      if (!refreshed) throw apiError;
      return invoke<T>(name, options);
    }
  },

  post<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
    return api.call<T>(name, { method: 'POST', body });
  },

  get<T>(name: string): Promise<T> {
    return api.call<T>(name, { method: 'GET' });
  },
};

/** Type guard for screens that catch unknown values. */
export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

export function errorMessage(value: unknown): string {
  if (value instanceof ApiClientError) return value.message;
  if (value instanceof Error) return value.message;
  return 'Something went wrong. Please try again.';
}
