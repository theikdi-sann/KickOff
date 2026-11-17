// GAP-09.2 — the fan data export (subject access).
//
// `docs/PRIVACY.md` is the schedule of record. The export covers exactly the
// subject's own tables in its inventory; the registry below is what the
// contract test (scripts/tests/export.test.mjs, EX-1) holds the function to.
// A table the fan populates joins the inventory and this registry in the same
// change — a table that exists but is not exported is a fan right silently
// denied.

/** The tables that carry the subject's own data, in export order. */
export const USER_EXPORT_TABLES = [
  "profiles",
  "fans",
  "orders",
  "order_seats",
  "tickets",
  "seat_holds",
  "device_tokens",
] as const;

export type UserExportTable = (typeof USER_EXPORT_TABLES)[number];

export type UserExportData = Record<UserExportTable, unknown>;

export interface UserExport {
  /** When the export was generated (ISO 8601). */
  generatedAt: string;
  /** The subject the export belongs to (`profiles.id`). */
  subject: string;
  /** Row count per table — the summary a fan can check the detail against. */
  counts: Record<UserExportTable, number>;
  /** The data itself, keyed by table. */
  data: UserExportData;
}

/**
 * Builds the export document. Pure: the function fetches, this shapes — so
 * the document's shape is testable without a database.
 */
export function buildUserExport(
  subject: string,
  data: UserExportData,
  now: () => string = () => new Date().toISOString(),
): UserExport {
  const counts = Object.fromEntries(
    USER_EXPORT_TABLES.map((table) => [table, Array.isArray(data[table]) ? data[table].length : 0]),
  ) as Record<UserExportTable, number>;

  return { generatedAt: now(), subject, counts, data };
}
