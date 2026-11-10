"use client";

import { createClient } from "@/lib/supabase/client";

interface InvokeOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface ErrorEnvelope {
  error?: { message?: string; code?: string };
}

/** Error thrown by an Edge Function call, with enough detail to retry. */
export class EdgeFunctionError extends Error {
  override readonly name = "EdgeFunctionError";
  readonly status?: number;
  readonly code?: string;
  readonly network: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: string; network: boolean },
  ) {
    super(message);
    this.status = options.status;
    this.code = options.code;
    this.network = options.network;
  }
}

/**
 * Calls an Edge Function and unwraps the shared `{ ok, error }` envelope.
 * `functions.invoke` throws a generic FunctionsHttpError on non-2xx; this reads
 * the response body so callers get the real message.
 */
export async function invokeFunction<T>(name: string, options: InvokeOptions = {}): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke(name, options);
  if (!error) return data as T;

  const name_ = (error as { name?: string }).name ?? "";
  const network = name_ === "FunctionsFetchError" || name_ === "FunctionsRelayError";

  const response = (error as { context?: Response }).context;
  let message = error.message;
  let code: string | undefined;
  if (response && !network) {
    try {
      const payload = (await response.clone().json()) as ErrorEnvelope;
      message = payload.error?.message ?? message;
      code = payload.error?.code;
    } catch {
      // Non-JSON error body — keep the original message.
    }
  }

  throw new EdgeFunctionError(message, {
    status: response?.status,
    code,
    network,
  });
}
