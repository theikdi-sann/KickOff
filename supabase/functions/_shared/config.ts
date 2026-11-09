import { z } from "zod";

/** Validated environment for every Edge Function invocation. */
const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Guardrail 14: test-mode keys only.
  STRIPE_SECRET_KEY: z
    .string()
    .refine((value) => value.startsWith("sk_test_"), "STRIPE_SECRET_KEY must be a test-mode key"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  TICKET_HMAC_KEY: z.string().min(32),
  METRICS_TOKEN: z.string().min(16),
  ADMIN_APP_URL: z.url(),
  MOBILE_DEEP_LINK: z.string().min(1),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parses and caches the environment. Throws on the first missing/invalid value. */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(Deno.env.toObject());
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Edge Function environment — ${detail}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: clears the cached environment so the next getEnv() re-reads it. */
export function resetEnvCache(): void {
  cached = null;
}

/** Test/health helper: for callers that only need the Supabase pair. */
export function getSupabaseEnv(): Pick<Env, "SUPABASE_URL" | "SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY"> {
  const env = getEnv();
  return {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
