import { createClient } from '@/lib/supabase/client';

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
 * Punch list #13: write the reschedule reason to audit_logs. Called by
 * `useUpdateMatch` right after a kickoff change — the row carries who moved
 * what, when, and why. Rules live in shared Zod; this only stores the proof.
 */
export async function recordReschedule({ matchId, from, to, reason }: RescheduleAudit): Promise<void> {
  const db = createClient();
  const { data: userData } = await db.auth.getUser();

  const { error } = await db.from('audit_logs').insert({
    actor_id: userData.user?.id ?? null,
    action: 'reschedule',
    entity: 'match',
    entity_id: matchId,
    metadata: { from, to, reason },
  });
  if (error) throw new Error(error.message);
}
