import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { isAdmin, requireUser } from "../_shared/auth.ts";
import { PLATFORM_DISPLAY } from "../_shared/display.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { localeFromTag, translate, type AppLocale } from "../_shared/i18n.ts";
import { formatMoney } from "../_shared/money.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({ orderId: z.string().min(1).max(64) });

interface ReceiptSeat {
  seatId: string;
  ticketId: string | null;
  zoneName: string;
  row: string;
  number: number;
  priceMinorUnits: number;
}

interface ReceiptRow {
  order_id: string;
  user_id: string;
  tenant_id: string;
  amount_minor_units: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  payment_ref: string | null;
  holder: string;
  holder_email: string;
  opponent: string;
  kickoff_at: string;
  venue: string;
  seats: ReceiptSeat[];
}

function longDate(iso: string, timezone: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(iso));
}

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  const { orderId } = await validateBody(request, bodySchema);
  const db = serviceClient();

  const { data: receipt, error } = await db
    .from("order_receipt_view")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle<ReceiptRow>();
  if (error || !receipt) throw error ?? new AppError("not_found", "Order not found");

  if (receipt.user_id !== context.user.id && !isAdmin(context.user)) {
    throw new AppError("forbidden", "You can only download your own receipt");
  }
  if (receipt.status !== "paid" && receipt.status !== "refunded") {
    throw new AppError("conflict", "Receipts are available for paid orders only");
  }

  // The club says where it lives: every wall-clock time on the receipt —
  // kickoff and payment — renders in the club's zone (C8.2d). The platform
  // default is the defensive fallback; the foreign key makes it unreachable.
  const { data: club, error: clubError } = await db
    .from("tenants")
    .select("timezone, locale")
    .eq("id", receipt.tenant_id)
    .maybeSingle<{ timezone: string; locale: string }>();
  if (clubError) throw clubError;
  const timezone = club?.timezone ?? PLATFORM_DISPLAY.timezone;
  // The receipt is the fan's copy of the club's document: it is spelled in
  // the club's language and the club's date conventions (C10.2).
  const locale = localeFromTag(club?.locale ?? PLATFORM_DISPLAY.locale);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.04, 0.42, 0.23);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.35, 0.4, 0.47);

  let y = 790;
  page.drawText("KICKOFF", { x: 48, y, size: 26, font: bold, color: green });
  page.drawText(translate(locale, "Matchday receipt"), { x: 48, y: y - 20, size: 11, font, color: muted });
  page.drawText(
    receipt.status === "refunded" ? translate(locale, "REFUNDED") : translate(locale, "PAID"),
    {
    x: 470,
    y,
    size: 12,
    font: bold,
    color: receipt.status === "refunded" ? rgb(0.7, 0.2, 0.1) : green,
  });

  y -= 58;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: rgb(0.88, 0.9, 0.92) });

  const rows: Array<[string, string]> = [
    [translate(locale, "Order"), receipt.order_id],
    [translate(locale, "Holder"), `${receipt.holder} · ${receipt.holder_email}`],
    [
      translate(locale, "Fixture"),
      translate(locale, "KickOff vs {opponent}", { opponent: receipt.opponent }),
    ],
    [translate(locale, "Kick-off"), longDate(receipt.kickoff_at, timezone, locale)],
    [translate(locale, "Venue"), receipt.venue],
    [
      translate(locale, "Paid"),
      receipt.paid_at ? longDate(receipt.paid_at, timezone, locale) : "—",
    ],
    [translate(locale, "Payment ref"), receipt.payment_ref ?? "—"],
  ];

  y -= 26;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 48, y, size: 9, font: bold, color: muted });
    page.drawText(value, { x: 150, y, size: 10, font, color: ink });
    y -= 20;
  }

  y -= 12;
  page.drawText(translate(locale, "Seats"), { x: 48, y, size: 11, font: bold, color: ink });
  y -= 20;
  for (const seat of receipt.seats) {
    page.drawText(`${seat.zoneName} · Row ${seat.row} · Seat ${seat.number}`, {
      x: 56,
      y,
      size: 10,
      font,
      color: ink,
    });
    page.drawText(formatMoney(seat.priceMinorUnits, receipt.currency, locale), {
      x: 430,
      y,
      size: 10,
      font,
      color: ink,
    });
    y -= 18;
  }

  const vat = Math.round((receipt.amount_minor_units * 7) / 107);
  const net = receipt.amount_minor_units - vat;

  y -= 10;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: rgb(0.88, 0.9, 0.92) });
  y -= 24;
  page.drawText(translate(locale, "Net"), { x: 360, y, size: 10, font, color: muted });
  page.drawText(formatMoney(net, receipt.currency, locale), { x: 450, y, size: 10, font, color: ink });
  y -= 18;
  page.drawText(translate(locale, "VAT 7% (included)"), { x: 360, y, size: 10, font, color: muted });
  page.drawText(formatMoney(vat, receipt.currency, locale), { x: 450, y, size: 10, font, color: ink });
  y -= 22;
  page.drawText(translate(locale, "Total"), { x: 360, y, size: 12, font: bold, color: ink });
  page.drawText(formatMoney(receipt.amount_minor_units, receipt.currency, locale), {
    x: 450,
    y,
    size: 12,
    font: bold,
    color: green,
  });

  y -= 54;
  page.drawText(
    translate(
      locale,
      "Prices include Thai VAT (7%). This receipt is proof of purchase, not a tax invoice.",
    ),
    { x: 48, y, size: 8, font, color: muted },
  );
  page.drawText("KickOff Arena · Bangkok · kickoff.app", { x: 48, y: y - 14, size: 8, font, color: muted });

  const bytes = await pdf.save();
  const path = `${receipt.user_id}/${receipt.order_id}.pdf`;

  const { error: uploadError } = await db.storage
    .from("receipts")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;

  const { data: signed, error: signError } = await db.storage
    .from("receipts")
    .createSignedUrl(path, 3600);
  if (signError || !signed) throw signError ?? new AppError("internal", "Could not sign receipt URL");

  return ok({ url: signed.signedUrl, path, expiresIn: 3600 }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
