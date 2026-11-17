import { assertEquals, assertThrows } from "@std/assert";

import { getEnv, resetEnvCache } from "../_shared/config.ts";

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TICKET_HMAC_KEY",
  "METRICS_TOKEN",
  "ADMIN_APP_URL",
  "MOBILE_DEEP_LINK",
  "ALLOWED_ORIGINS",
  "ALERT_WEBHOOK_URL",
] as const;

const original = new Map(KEYS.map((key) => [key, Deno.env.get(key)]));

function clearEnv(): void {
  for (const key of KEYS) Deno.env.delete(key);
  resetEnvCache();
}

function setValidEnv(): void {
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_123");
  Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_123");
  Deno.env.set("TICKET_HMAC_KEY", "x".repeat(40));
  Deno.env.set("METRICS_TOKEN", "m".repeat(20));
  Deno.env.set("ADMIN_APP_URL", "http://localhost:3000");
  Deno.env.set("MOBILE_DEEP_LINK", "kickoff://");
  resetEnvCache();
}

function restoreEnv(): void {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  resetEnvCache();
}

Deno.test("config", async (t) => {
  try {
    await t.step("fails fast when a secret is missing", () => {
      clearEnv();
      assertThrows(() => getEnv(), Error, "Invalid Edge Function environment");
    });

    await t.step("rejects a live Stripe key", () => {
      setValidEnv();
      Deno.env.set("STRIPE_SECRET_KEY", "sk_live_123");
      resetEnvCache();
      assertThrows(() => getEnv(), Error, "test-mode key");
    });

    await t.step("accepts a complete test-mode environment", () => {
      setValidEnv();
      const env = getEnv();
      assertEquals(env.STRIPE_SECRET_KEY, "sk_test_123");
      assertEquals(env.SUPABASE_URL, "http://127.0.0.1:54321");
    });

    await t.step("rejects an invalid URL", () => {
      setValidEnv();
      Deno.env.set("SUPABASE_URL", "not-a-url");
      resetEnvCache();
      assertThrows(() => getEnv(), Error);
    });

    await t.step("accepts an environment with no alert channel", () => {
      // The webhook is optional (C10.1): local runs and CI record without
      // shouting, and `setValidEnv` deliberately never sets one.
      setValidEnv();
      const env = getEnv();
      assertEquals(env.ALERT_WEBHOOK_URL, undefined);
    });

    await t.step("rejects an invalid alert webhook url", () => {
      setValidEnv();
      Deno.env.set("ALERT_WEBHOOK_URL", "not-a-url");
      resetEnvCache();
      assertThrows(() => getEnv(), Error, "ALERT_WEBHOOK_URL");
      Deno.env.delete("ALERT_WEBHOOK_URL");
      resetEnvCache();
    });
  } finally {
    restoreEnv();
  }
});
