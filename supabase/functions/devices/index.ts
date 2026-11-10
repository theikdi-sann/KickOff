import { z } from "zod";

import { requireUser } from "../_shared/auth.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z
  .object({
    token: z.string().min(1).max(512).optional(),
    platform: z.enum(["ios", "android", "web"]).optional(),
    all: z.boolean().optional(),
  })
  .refine(
    (value) => value.all === true || (Boolean(value.token) && value.token!.length > 0),
    "Provide a token or all=true",
  );

const postSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(["ios", "android", "web"]),
});

interface DeviceRow {
  token: string;
  platform: "ios" | "android" | "web";
  created_at: string;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  await enforceRateLimit(request, "devices", { maxHits: 60 });
  const db = serviceClient();

  if (request.method === "GET") {
    const { data, error } = await db
      .from("device_tokens")
      .select("token,platform,created_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return ok(
      {
        devices: ((data ?? []) as DeviceRow[]).map((row) => ({
          token: row.token,
          platform: row.platform,
          createdAt: row.created_at,
        })),
      },
      request,
    );
  }

  if (request.method === "POST") {
    const body = await validateBody(request, postSchema);
    // A push token is globally unique; re-registering it moves it to this user.
    const { error } = await db.from("device_tokens").upsert(
      {
        user_id: context.user.id,
        token: body.token,
        platform: body.platform,
      },
      { onConflict: "token" },
    );
    if (error) throw error;
    return ok({ registered: true }, request);
  }

  // DELETE — remove one token or every token for the caller.
  const body = await validateBody(request, bodySchema);
  let query = db.from("device_tokens").delete().eq("user_id", context.user.id);
  if (!body.all && body.token) query = query.eq("token", body.token);
  const { error } = await query;
  if (error) throw error;
  return ok({ removed: true }, request);
}

Deno.serve(serveJson(handler, ["GET", "POST", "DELETE"]));
