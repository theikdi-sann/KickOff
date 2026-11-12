import { getEnv } from "../_shared/config.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { probeDepth, type ProbeDepth } from "../_shared/probe.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { stripeClient } from "../_shared/stripe.ts";

const startedAt = Date.now();

type CheckStatus = "ok" | "error";

/** The result of one dependency check. */
interface CheckResult {
  status: CheckStatus;
  message?: string;
}

/** The checks a readiness probe ran. */
interface ProbeChecks {
  database: CheckResult;
  /** Only present for a deep (token-authenticated) probe. */
  stripe?: CheckResult;
}

async function checkDatabase(): Promise<CheckResult> {
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

async function checkStripe(): Promise<CheckResult> {
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
    const env = getEnv();
    // The probe is reachable without a user JWT, so the expensive check
    // (a live Stripe API call) runs only for a caller that presents the
    // metrics token. An anonymous caller gets the cheap database check.
    const depth: ProbeDepth = probeDepth(request.headers.get("x-metrics-token"), env.METRICS_TOKEN);

    const database = await checkDatabase();
    const checks: ProbeChecks = { database };
    let ready = database.status === "ok";

    if (depth === "deep") {
      checks.stripe = await checkStripe();
      ready = ready && checks.stripe.status === "ok";
    }

    return ok(
      {
        status: ready ? "ready" : "degraded",
        depth,
        environment: Deno.env.get("DENO_ENV") ?? "production",
        checks,
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
      service: "kickoff-edge",
      projectRef: new URL(env.SUPABASE_URL).hostname.split(".")[0],
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    },
    request,
  );
}

logger.info("health.booting");
Deno.serve(serveJson(handler, ["GET"]));
