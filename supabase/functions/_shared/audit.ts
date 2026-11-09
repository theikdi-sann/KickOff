import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "./errors.ts";
import { logger } from "./logger.ts";
import { serviceClient } from "./supabase.ts";

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Appends an immutable audit row. Throws if the write fails. */
export async function writeAudit(entry: AuditEntry, client?: SupabaseClient): Promise<void> {
  const db = client ?? serviceClient();
  const { error } = await db.from("audit_logs").insert({
    actor_id: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });

  if (error) {
    logger.error("audit.write_failed", {
      action: entry.action,
      entity: entry.entity,
      error: error.message,
    });
    throw new AppError("internal", "Could not write audit log");
  }
}
