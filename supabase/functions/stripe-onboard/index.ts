import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requirePlatformAdmin } from "../_shared/auth.ts";
import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { createAccountLink, createExpressAccount } from "../_shared/stripe.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

// ADR-004 §3 + ADR-003 — the club onboarding half of C9: a platform
// operator picks a club, and this creates (or resumes) that club's Stripe
// Express account and hands back the hosted link its owner completes.
//
// The Stripe key is test-mode only (D-08, enforced by config.ts), so this
// whole flow runs against test accounts until the deployment swaps the key.
const bodySchema = z.object({
  tenantId: z.string().uuid(),
  // ISO-3166-1 alpha-2: the country decides which onboarding fields Stripe
  // asks for. Anything else is refused here, not passed through to Stripe.
  country: z.string().regex(/^[A-Z]{2}$/, "country must be an ISO-3166 alpha-2 code"),
});

async function handler(request: Request): Promise<Response> {
  const context = await requirePlatformAdmin(request);
  const body = await validateBody(request, bodySchema);

  const db = serviceClient();
  const { data: club, error } = await db
    .from("tenants")
    .select("id, slug, stripe_account_id")
    .eq("id", body.tenantId)
    .eq("status", "active")
    // A tombstone (0052) is not a club: onboarding one would create a
    // Stripe account for a club that no longer exists.
    .is("erased_at", null)
    .maybeSingle<{ id: string; slug: string; stripe_account_id: string | null }>();
  if (error) throw error;
  if (!club) throw new AppError("not_found", "Club not found");

  // Create once, resume forever: an already-onboarded club keeps its account
  // (a second account would split its payouts and its webhook identity). The
  // idempotency key is the tenant, so a double-click cannot create two.
  const stripeAccountId = club.stripe_account_id ??
    (await createExpressAccount(
      {
        type: "express",
        country: body.country,
        capabilities: { transfers: { requested: true } },
        metadata: { tenant_id: club.id, slug: club.slug },
      },
      { idempotencyKey: `onboard-${club.id}` },
    )).id;

  if (stripeAccountId !== club.stripe_account_id) {
    const { error: saveError } = await db
      .from("tenants")
      .update({ stripe_account_id: stripeAccountId })
      .eq("id", club.id);
    if (saveError) throw saveError;
  }

  // Both exits land back on the console's platform page, which announces
  // what happened from the `onboarding` parameter (the same tab, not a
  // popup — the return is a full navigation from Stripe).
  const platformUrl = `${getEnv().ADMIN_APP_URL.replace(/\/$/, "")}/dashboard/platform`;
  const link = await createAccountLink({
    account: stripeAccountId,
    refresh_url: `${platformUrl}?onboarding=refresh`,
    return_url: `${platformUrl}?onboarding=complete`,
    type: "account_onboarding",
  });

  await writeAudit(
    {
      actorId: context.user.id,
      action: "tenant.onboarded",
      entity: "tenants",
      entityId: club.id,
      metadata: { stripeAccountId, country: body.country, reused: club.stripe_account_id !== null },
    },
    db,
  );

  return ok({ url: link.url, stripeAccountId }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
