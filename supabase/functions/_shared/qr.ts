/**
 * QR v2 payload handling for Edge Functions.
 *
 * Mirrors `packages/shared/src/qr.ts`, which Supabase cannot deploy. Keep the
 * prefix, field set and canonical signing string byte-identical.
 */
import { verifyHmac } from "./hmac.ts";

export const QR_V2_PREFIX = "XCLUB-V2:";

const MAX_RAW_LENGTH = 4096;
const MAX_FIELD_LENGTH = 256;

export interface TicketQrPayloadV2 {
  v: 2;
  tid: string;
  mid: string;
  oid: string;
  n: string;
  sig: string;
}

export type ParsedQr =
  | { ok: true; payload: TicketQrPayloadV2 }
  | { ok: false; reason: string };

/** Canonical bytes signed by `ticket-qr` — must stay stable. */
export function ticketQrSigningPayload(
  payload: Pick<TicketQrPayloadV2, "tid" | "mid" | "oid" | "n">,
): string {
  return `v2|${payload.tid}|${payload.mid}|${payload.oid}|${payload.n}`;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of the raw scanned payload, hex encoded (stored in `scan_events.raw_hash`). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export function parseTicketQr(raw: string): ParsedQr {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: "Empty ticket payload" };
  if (value.length > MAX_RAW_LENGTH) return { ok: false, reason: "Ticket payload is too large" };
  if (!value.startsWith(QR_V2_PREFIX)) {
    return { ok: false, reason: "Not an XClub ticket QR code" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value.slice(QR_V2_PREFIX.length));
  } catch {
    return { ok: false, reason: "Ticket payload could not be read" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "Ticket payload is incomplete" };
  }

  const candidate = parsed as Partial<TicketQrPayloadV2>;
  if (candidate.v !== 2) return { ok: false, reason: "Unsupported ticket payload version" };

  for (const field of ["tid", "mid", "oid", "n", "sig"] as const) {
    const fieldValue = candidate[field];
    if (typeof fieldValue !== "string" || fieldValue.length === 0) {
      return { ok: false, reason: "Ticket payload is incomplete" };
    }
    if (fieldValue.length > MAX_FIELD_LENGTH) {
      return { ok: false, reason: "Ticket payload is incomplete" };
    }
  }

  return {
    ok: true,
    payload: {
      v: 2,
      tid: candidate.tid as string,
      mid: candidate.mid as string,
      oid: candidate.oid as string,
      n: candidate.n as string,
      sig: candidate.sig as string,
    },
  };
}

/** Parses the payload and verifies its HMAC signature. */
export async function verifyTicketQr(raw: string, secret: string): Promise<ParsedQr> {
  const parsed = parseTicketQr(raw);
  if (!parsed.ok) return parsed;

  const valid = await verifyHmac(
    ticketQrSigningPayload(parsed.payload),
    secret,
    parsed.payload.sig,
  );
  if (!valid) return { ok: false, reason: "Ticket signature is not valid" };
  return parsed;
}
