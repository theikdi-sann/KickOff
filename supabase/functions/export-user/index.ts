import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { isAdmin, requireUser } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { buildUserExport } from "../_shared/export.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({
  userId: z.string().min(1).max(64).optional(),
});

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  const body = await validateBody(request, bodySchema);
  const targetId = body.userId ?? context.user.id;

  if (targetId !== context.user.id && !isAdmin(context.user)) {
    throw new AppError("forbidden", "You can only export your own account");
  }

  const db = serviceClient();

  // The subject's own rows across every club (docs/PRIVACY.md — the schedule
  // of record). The service role reads by `user_id` so an admin may export on
  // a fan's behalf; every table below is in USER_EXPORT_TABLES.
  const profile = await db
    .from("profiles")
    .select("id,email,full_name,phone,created_at,updated_at")
    .eq("id", targetId)
    .maybeSingle();
  if (profile.error) throw profile.error;

  const [fans, orders, tickets, seatHolds, deviceTokens] = await Promise.all([
    // `fans.id` *is* the profile id (ADR-001: a fan is a 1—1 projection of the
    // profile) — there is no `user_id` column to filter on.
    db.from("fans").select("*").eq("id", targetId),
    db
      .from("orders")
      .select(
        "id,tenant_id,match_id,user_id,status,currency,amount_minor_units,application_fee_amount,stripe_session_id,payment_intent_id,payment_ref,paid_at,created_at,updated_at",
      )
      .eq("user_id", targetId),
    db
      .from("tickets")
      .select("id,tenant_id,order_id,order_seat_id,match_id,seat_id,user_id,status,issued_at,used_at,created_at")
      .eq("user_id", targetId),
    db
      .from("seat_holds")
      .select("id,tenant_id,user_id,seat_id,released_at,created_at")
      .eq("user_id", targetId),
    db.from("device_tokens").select("id,user_id,platform,token,created_at").eq("user_id", targetId),
  ]);
  for (const result of [fans, orders, tickets, seatHolds, deviceTokens]) {
    if (result.error) throw result.error;
  }

  // A seat line belongs to the buyer's orders, not to the fan directly.
  const orderIds = (orders.data ?? []).map((order) => order.id);
  const orderSeats = orderIds.length
    ? await db
        .from("order_seats")
        .select("id,order_id,seat_id,ticket_id,created_at")
        .in("order_id", orderIds)
    : { data: [], error: null };
  if (orderSeats.error) throw orderSeats.error;

  const document = buildUserExport(targetId, {
    profiles: profile.data ? [profile.data] : [],
    fans: fans.data ?? [],
    orders: orders.data ?? [],
    order_seats: orderSeats.data ?? [],
    tickets: tickets.data ?? [],
    seat_holds: seatHolds.data ?? [],
    device_tokens: deviceTokens.data ?? [],
  });

  await writeAudit(
    {
      actorId: context.user.id,
      action: "account.export",
      entity: "profiles",
      entityId: targetId,
      metadata: { self: targetId === context.user.id, counts: document.counts },
    },
    db,
  );

  return ok({ export: document }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
