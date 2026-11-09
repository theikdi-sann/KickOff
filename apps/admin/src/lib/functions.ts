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

/**
 * Calls an Edge Function and unwraps the shared `{ ok, error }` envelope.
 * `functions.invoke` throws a generic FunctionsHttpError on non-2xx; this reads
 * the response body so callers get the real message.
 */
export async function invokeFunction<T>(name: string, options: InvokeOptions = {}): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke(name, options);
  if (!error) return data as T;

  const response = (error as { context?: Response }).context;
  let message = error.message;
  if (response) {
    try {
      const payload = (await response.clone().json()) as ErrorEnvelope;
      message = payload.error?.message ?? message;
    } catch {
      // Non-JSON error body — keep the original message.
    }
  }
  throw new Error(message);
}
