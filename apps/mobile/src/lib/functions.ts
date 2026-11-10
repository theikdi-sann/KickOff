import { api } from './api';

interface InvokeOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Backwards-compatible Edge Function helper. New code should use `api` directly
 * so it can inspect `ApiClientError` (status, retryability, request id).
 */
export async function invokeFunction<T>(
  name: string,
  options: InvokeOptions = {},
): Promise<T> {
  return api.call<T>(name, options);
}
