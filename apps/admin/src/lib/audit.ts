import type { Json } from '@kickoff/shared';
import { createClient } from '@/lib/supabase/client';

/**
 * The audit vocabulary.
 *
 * Every privileged change the staff console makes is recorded here, with one
 * name per action, so the trail can be read and queried without guessing how
 * the console spelled things.
 */
export const AUDIT_ACTIONS = {
  matchCreate: 'match.create',
  matchUpdate: 'match.update',
  matchDelete: 'match.delete',
  zoneCreate: 'zone.create',
  zoneUpdate: 'zone.update',
  zoneDelete: 'zone.delete',
  venueCreate: 'venue.create',
  venueDelete: 'venue.delete',
  gateCreate: 'gate.create',
  gateUpdate: 'gate.update',
  gateDelete: 'gate.delete',
  newsCreate: 'news.create',
  newsUpdate: 'news.update',
  newsDelete: 'news.delete',
  settingsUpdate: 'settings.update',
  ordersExport: 'orders.export',
  reschedule: 'reschedule',
} as const;

/** The name of a recorded action. */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** A privileged change recorded in `audit_logs`. */
export interface AuditEntry {
  /** What happened — one of `AUDIT_ACTIONS`. */
  action: AuditAction;
  /** The entity the change applies to, e.g. `matches`. */
  entity: string;
  /** The identifier of the affected row. */
  entityId?: string | null;
  /** Structured context: what changed, and why. */
  metadata?: Json;
}

export interface RescheduleAudit {
  matchId: string;
  /** Kick-off before the reschedule (ISO). */
  from: string;
  /** Kick-off after the reschedule (ISO). */
  to: string;
  /** Admin-supplied justification — required by the shared schema. */
  reason: string;
}

/**
 * Records a privileged change in `audit_logs`.
 *
 * The row carries who changed what, when and why.
 *
 * The write never fails the operation that produced the change: the fixture
 * was already created when the audit row is written, so throwing here would
 * tell the operator "not saved" for a change that *was* saved — and a retry
 * would create it twice. A failed write is reported instead (logged, and
 * returned as `false`), so the gap is diagnosable.
 *
 * Returns `true` when the row was written.
 */
export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const db = createClient();
    const { data: userData } = await db.auth.getUser();

    const { error } = await db.from('audit_logs').insert({
      actor_id: userData.user?.id ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });

    if (error) {
      console.error('audit write failed', {
        action: entry.action,
        entity: entry.entity,
        message: error.message,
      });
      return false;
    }
    return true;
  } catch (caught) {
    console.error('audit write failed', {
      action: entry.action,
      entity: entry.entity,
      message: caught instanceof Error ? caught.message : String(caught),
    });
    return false;
  }
}

/**
 * The names of the fields a patch touches — enough for an audit trail
 * without copying the whole row (which may hold personal data).
 */
export function changedFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).sort();
}

/**
 * Punch list #13: write the reschedule reason to audit_logs. Called by
 * `useUpdateMatch` right after a kickoff change — the row carries who moved
 * what, when, and why. Rules live in shared Zod; this only stores the proof.
 */
export async function recordReschedule({
  matchId,
  from,
  to,
  reason,
}: RescheduleAudit): Promise<boolean> {
  return recordAudit({
    action: AUDIT_ACTIONS.reschedule,
    entity: 'match',
    entityId: matchId,
    metadata: { from, to, reason },
  });
}
