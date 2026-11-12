import { z } from 'zod';

/**
 * The refund request body.
 *
 * This file is the **canonical** definition. Supabase deploys only
 * `supabase/functions/**`, so the Edge Function cannot import it; instead,
 * `scripts/sync-edge-schemas.mjs` generates `supabase/functions/_shared/refund.ts`
 * from this file, and `scripts/tests/schema-usage.test.mjs` fails if the copy
 * drifts. Keep this module free of relative imports so the copy stays valid.
 */
export const refundOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  reason: z.string().max(400).optional(),
  overrideUsedTickets: z.boolean().default(false),
});

export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
