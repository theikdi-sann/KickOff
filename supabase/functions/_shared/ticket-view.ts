import type { SupabaseClient } from "@supabase/supabase-js";

/** Subset of `TicketDto` needed by the gate scanner. Mirrors the mobile mapper. */
export interface TicketView {
  id: string;
  orderId: string;
  matchId: string;
  matchLabel: string;
  opponent: string;
  kickoffAt: string;
  venue: string;
  holder: string;
  zoneId: string;
  zoneName: string;
  row: string;
  number: number;
  seatLabel: string;
  priceSatang: number;
  status: "valid" | "used" | "void";
  issuedAt: string;
  usedAt: string | null;
  qrPayload: "";
}

interface TicketJoinRow {
  id: string;
  order_id: string;
  match_id: string;
  user_id: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  matches: { opponent: string; kickoff_at: string; venue: string } | null;
  seats: { row_label: string; number: number; zones: { name: string } | null } | null;
  order_seats: { price_satang: number } | null;
}

// `tickets` has two FK paths to `order_seats` (its own seat, and the reverse
// ticket_id link), so the embed must name the seat relationship explicitly.
const TICKET_SELECT =
  "id,order_id,match_id,user_id,status,issued_at,used_at,matches(opponent,kickoff_at,venue),seats(row_label,number,zones(name)),order_seats!tickets_order_seat_id_fkey(price_satang)";

const STATUSES = new Set(["valid", "used", "void"]);

export async function loadTicketView(
  db: SupabaseClient,
  ticketId: string,
): Promise<TicketView | null> {
  const { data, error } = await db
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("id", ticketId)
    .maybeSingle<TicketJoinRow>();
  if (error) throw error;
  if (!data) return null;

  // profiles.id references auth.users, not tickets, so PostgREST cannot embed
  // it. A second read is cheap and keeps RLS intact.
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("full_name,email")
    .eq("id", data.user_id)
    .maybeSingle<{ full_name: string; email: string }>();
  if (profileError) throw profileError;

  const seat = data.seats;
  const row = seat?.row_label ?? "";
  const number = seat?.number ?? 0;
  const holder = profile?.full_name || profile?.email || "KickOff fan";

  return {
    id: data.id,
    orderId: data.order_id,
    matchId: data.match_id,
    matchLabel: `KickOff vs ${data.matches?.opponent ?? "opponent"}`,
    opponent: data.matches?.opponent ?? "",
    kickoffAt: data.matches?.kickoff_at ?? "",
    venue: data.matches?.venue ?? "KickOff Arena",
    holder,
    zoneId: "",
    zoneName: seat?.zones?.name ?? "",
    row,
    number,
    seatLabel: `${row}${number}`,
    priceSatang: data.order_seats?.price_satang ?? 0,
    status: STATUSES.has(data.status) ? (data.status as TicketView["status"]) : "void",
    issuedAt: data.issued_at,
    usedAt: data.used_at,
    qrPayload: "",
  };
}
