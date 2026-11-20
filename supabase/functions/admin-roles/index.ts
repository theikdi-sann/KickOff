import { z } from "zod";

import { requireCapability, type AuthContext } from "../_shared/auth.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { STAFF_CAPABILITIES, type Capability } from "../_shared/roles.ts";
import { validateBody } from "../_shared/validate.ts";

const roleSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  name: z.string().trim().min(1).max(80),
  capabilities: z.array(z.enum(STAFF_CAPABILITIES)).min(1),
  active: z.boolean().optional(),
});

const deleteSchema = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) });

interface RoleRow {
  code: string;
  name: string;
  is_system: boolean;
  active: boolean;
  sort_order: number;
  staff_role_capabilities: Array<{ capability: Capability }>;
}

function toDto(row: RoleRow) {
  return {
    code: row.code,
    name: row.name,
    isSystem: row.is_system,
    active: row.active,
    sortOrder: row.sort_order,
    capabilities: row.staff_role_capabilities.map((entry) => entry.capability),
  };
}

async function listRoles(context: AuthContext) {
  const { data, error } = await context.client
    .from("staff_roles")
    .select("code,name,is_system,active,sort_order,staff_role_capabilities(capability)")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as RoleRow[]).map(toDto);
}

async function handler(request: Request): Promise<Response> {
  const context = await requireCapability(request, "manage_staff");

  if (request.method === "GET") {
    return ok({ roles: await listRoles(context) }, request);
  }

  const body = await validateBody(request, request.method === "DELETE" ? deleteSchema : roleSchema);
  const code = (body as { code: string }).code;

  if (request.method === "POST") {
    const input = body as z.infer<typeof roleSchema>;
    const { error } = await context.client.rpc("admin_create_role", {
      p_code: code,
      p_name: input.name,
      p_capabilities: input.capabilities,
    });
    if (error) throw error;
  } else if (request.method === "PATCH") {
    const input = body as z.infer<typeof roleSchema>;
    const { error } = await context.client.rpc("admin_update_role", {
      p_code: code,
      p_name: input.name,
      p_capabilities: input.capabilities,
      p_active: input.active ?? true,
    });
    if (error) throw error;
  } else {
    const { error } = await context.client.rpc("admin_delete_role", { p_code: code });
    if (error) throw error;
  }

  return ok({ roles: await listRoles(context) }, request);
}

Deno.serve(serveJson(handler, ["GET", "POST", "PATCH", "DELETE"]));
