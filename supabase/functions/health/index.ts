import { getEnv } from "../_shared/config.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { stripeClient } from "../_shared/stripe.ts";

const startedAt = Date.now();

type CheckStatus = "ok" | "error";

async function checkDatabase(): Promise<{ status: CheckStatus; message?: string }> {
  try {
    const { error } = await serviceClient()
      .from("matches")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    return error ? { status: "error", message: error.message } : { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "unknown" };
  }
}

async function checkStripe(): Promise<{ status: CheckStatus; message?: string }> {
  try {
    await stripeClient().balance.retrieve();
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "unknown" };
  }
}

async function handler(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (pathname.endsWith("/ready")) {
    const [database, stripe] = await Promise.all([checkDatabase(), checkStripe()]);
    const ready = database.status === "ok" && stripe.status === "ok";

    return ok(
      {
        status: ready ? "ready" : "degraded",
        environment: Deno.env.get("DENO_ENV") ?? "production",
        checks: { database, stripe },
        checkedAt: new Date().toISOString(),
      },
      request,
      ready ? 200 : 503,
    );
  }

  const env = getEnv();
  return ok(
    {
      status: "ok",
      service: "xclub-edge",
      projectRef: new URL(env.SUPABASE_URL).hostname.split(".")[0],
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    },
    request,
  );
}

logger.info("health.booting");
Deno.serve(serveJson(handler, ["GET"]));
