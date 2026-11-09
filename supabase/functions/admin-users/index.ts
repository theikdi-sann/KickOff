import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody, validateQuery } from "../_shared/validate.ts";

const listQuerySchema = z.object({
  role: z.enum(["customer", "admin"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

const patchSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    role: z.enum(["customer", "admin"]).optional(),
    fullName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().max(32).nullable().optional(),
  })
  .refine(
    (value) => value.role !== undefined || value.fullName !== undefined || value.phone !== undefined,
    "Nothing to update",
  );

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: "customer" | "admin";
  phone: string | null;
  created_at: string;
};

function toDto(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    joinedAt: row.created_at,
  };
}

function idFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.indexOf("admin-users");
  const fromPath = index >= 0 ? parts[index + 1] : undefined;
  return fromPath ?? url.searchParams.get("id");
}

async function handler(request: Request): Promise<Response> {
  const context = await requireAdmin(request);
  const db = serviceClient();

  if (request.method === "GET") {
    const { role, page, perPage } = validateQuery(request, listQuerySchema);
    const from = (page - 1) * perPage;

    let query = db
      .from("profiles")
      .select("id,email,full_name,role,phone,created_at", { count: "exact" })
      .order("created_at", { ascending: true })
      .range(from, from + perPage - 1);
    if (role) query = query.eq("role", role);

    const { data, count, error } = await query;
    if (error) throw error;

    return ok(
      {
        items: ((data ?? []) as ProfileRow[]).map(toDto),
        page,
        perPage,
        total: count ?? 0,
      },
      request,
    );
  }

  // PATCH
  const body = await validateBody(request, patchSchema);
  const targetId = body.id ?? idFromRequest(request);
  if (!targetId) throw new AppError("validation", "Missing user id");

  if (targetId === context.user.id && body.role && body.role !== "admin") {
    throw new AppError("conflict", "You cannot demote your own account");
  }

  const { data: target, error: targetError } = await db
    .from("profiles")
    .select("id,email,full_name,role,phone,created_at")
    .eq("id", targetId)
    .maybeSingle<ProfileRow>();
  if (targetError) throw targetError;
  if (!target) throw new AppError("not_found", "User not found");

  if (target.role === "admin" && body.role === "customer") {
    const { count, error } = await db
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .eq("role", "admin");
    if (error) throw error;
    if ((count ?? 0) <= 1) throw new AppError("conflict", "At least one admin must remain");
  }

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.fullName !== undefined) patch.full_name = body.fullName;
  if (body.phone !== undefined) patch.phone = body.phone;

  const { data: updated, error: updateError } = await db
    .from("profiles")
    .update(patch)
    .eq("id", targetId)
    .select("id,email,full_name,role,phone,created_at")
    .single<ProfileRow>();
  if (updateError) throw updateError;

  await writeAudit(
    {
      actorId: context.user.id,
      action: "admin.user.update",
      entity: "profiles",
      entityId: targetId,
      metadata: patch,
    },
    db,
  );

  return ok(toDto(updated), request);
}

Deno.serve(serveJson(handler, ["GET", "PATCH"]));
