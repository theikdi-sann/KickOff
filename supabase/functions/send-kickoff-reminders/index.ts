import { z } from "zod";

import { AppError } from "../_shared/errors.ts";
import { constantTimeEqual } from "../_shared/hmac.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({
  matchId: z.string().min(1).max(64).optional(),
  kickoffAt: z.string().optional(),
});

interface MatchRow {
  id: string;
  opponent: string;
  kickoff_at: string;
  venue: string;
}

interface TicketRow {
  user_id: string;
}

interface DeviceRow {
  token: string;
}

interface PushTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

function bangkokKickoff(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Scheduled by pg_cron. Protected by the shared `reminders_secret` value in
 * `app_settings`, sent as `x-cron-secret`; the function is deployed with
 * `verify_jwt=false` so the scheduler does not need a user session.
 */
async function handler(request: Request): Promise<Response> {
  await enforceRateLimit(request, "reminders", { maxHits: 12 });
  const db = serviceClient();

  const { data: secretRow, error: secretError } = await db
    .from("app_secrets")
    .select("value")
    .eq("key", "reminders_secret")
    .maybeSingle<{ value: string }>();
  if (secretError) throw secretError;

  const expected = secretRow?.value;
  const provided = request.headers.get("x-cron-secret");
  if (!expected || !provided || !constantTimeEqual(provided, expected)) {
    throw new AppError("unauthorized", "Invalid reminder scheduler secret");
  }

  const body = await validateBody(request, bodySchema);

  let match: MatchRow | null = null;
  if (body.matchId) {
    const { data, error } = await db
      .from("matches")
      .select("id,opponent,kickoff_at,venue")
      .eq("id", body.matchId)
      .maybeSingle<MatchRow>();
    if (error) throw error;
    match = data;
  } else {
    const soon = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("matches")
      .select("id,opponent,kickoff_at,venue")
      .eq("status", "upcoming")
      .gt("kickoff_at", new Date().toISOString())
      .lt("kickoff_at", soon)
      .order("kickoff_at", { ascending: true })
      .limit(1)
      .maybeSingle<MatchRow>();
    if (error) throw error;
    match = data;
  }

  if (!match) return ok({ sent: 0, reason: "no upcoming match" }, request);
  if (new Date(match.kickoff_at).getTime() <= Date.now()) {
    return ok({ sent: 0, reason: "match already started" }, request);
  }

  const { data: tickets, error: ticketError } = await db
    .from("tickets")
    .select("user_id")
    .eq("match_id", match.id)
    .eq("status", "valid");
  if (ticketError) throw ticketError;

  const userIds = [...new Set(((tickets ?? []) as TicketRow[]).map((row) => row.user_id))];
  if (userIds.length === 0) return ok({ sent: 0, reason: "no ticket holders" }, request);

  const { data: devices, error: deviceError } = await db
    .from("device_tokens")
    .select("token")
    .in("user_id", userIds);
  if (deviceError) throw deviceError;

  const tokens = ((devices ?? []) as DeviceRow[]).map((row) => row.token);
  if (tokens.length === 0) return ok({ sent: 0, reason: "no registered devices" }, request);

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title: "Matchday is coming",
    body: `XClub vs ${match!.opponent} · ${bangkokKickoff(match!.kickoff_at)} at ${match!.venue}. Have your pass ready.`,
    data: { url: "/(tabs)" },
  }));

  let sent = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const batch = messages.slice(index, index + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      logger.error("reminders.push_failed", { status: response.status });
      throw new AppError("internal", "Expo push service rejected the batch");
    }
    const result = (await response.json()) as { data?: PushTicket[] };
    sent += (result.data ?? []).filter((ticket) => ticket.status === "ok").length;
  }

  return ok({ sent, matchId: match.id, devices: tokens.length }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
