"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  QrCode,
  RotateCcw,
  Search,
  Ticket,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, ConfirmDialog, SectionTitle, useToast } from "@/components/ui";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/export";
import {
  useOrders,
  useOrdersAggregate,
  useRefund,
  type AdminOrder,
  type OrdersFilter,
} from "@/lib/queries/orders";
import { useOrderScanUsage, useScanStats } from "@/lib/queries/scan";
import { formatShortDate, formatTHB } from "@kickoff/shared";

const PAGE_SIZE = 10;
const STATUS_OPTIONS: Array<OrdersFilter["status"]> = [
  "all",
  "paid",
  "pending",
  "refunded",
  "cancelled",
  "failed",
];

const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
  { key: "order", label: "Order" },
  { key: "holder", label: "Holder" },
  { key: "email", label: "Email" },
  { key: "match", label: "Match" },
  { key: "seats", label: "Seats" },
  { key: "amount", label: "Amount THB" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
];

function toneFor(status: string): "green" | "red" | "gold" | "muted" {
  if (status === "paid") return "green";
  if (status === "refunded" || status === "cancelled" || status === "failed") return "red";
  if (status === "pending") return "gold";
  return "muted";
}

export default function TicketsPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrdersFilter["status"]>("all");
  const [page, setPage] = useState(1);
  const [refunding, setRefunding] = useState<AdminOrder | null>(null);

  const { data, isLoading, error } = useOrders({
    search: query,
    status,
    page,
    perPage: PAGE_SIZE,
  });
  const aggregate = useOrdersAggregate();
  const scans = useScanStats();
  const refund = useRefund();

  const orders = data?.items ?? [];
  const usage = useOrderScanUsage(orders.map((order) => order.id));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = () => {
    const rows = orders.map((order: AdminOrder) => ({
      order: order.id,
      holder: order.holderName,
      email: order.holderEmail,
      match: order.matchLabel,
      seats: order.seats.map((seat) => `${seat.zoneName} ${seat.row}${seat.number}`).join(" | "),
      amount: (order.amountSatang / 100).toFixed(2),
      status: order.status,
      created: order.createdAt,
    }));
    downloadCsv(`kickoff-orders-${status}-p${page}.csv`, toCsv(rows, CSV_COLUMNS));
  };

  const handleRefund = async () => {
    if (!refunding) return;
    try {
      await refund.mutateAsync({
        orderId: refunding.id,
        reason: "Refunded from orders list",
      });
      toast({
        title: "Refund issued",
        description: `${refunding.id} was refunded through Stripe.`,
        tone: "green",
      });
    } catch (caught) {
      toast({
        title: "Refund failed",
        description: caught instanceof Error ? caught.message : "Try again from the order detail page.",
        tone: "red",
      });
    } finally {
      setRefunding(null);
    }
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Commerce"
        title="Orders & passes"
        description="Live orders from Supabase. Open an order for seats, payment reference, refunds and receipts."
        action={
          <button type="button" onClick={exportCsv} className="btn-ghost">
            <Download size={15} />
            Export CSV
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Wallet size={16} />} label="Revenue" value={formatTHB(aggregate.data?.revenueSatang ?? 0)} />
        <Stat icon={<Ticket size={16} />} label="Paid orders" value={String(aggregate.data?.ordersPaid ?? 0)} />
        <Stat icon={<Ticket size={16} />} label="Tickets sold" value={String(aggregate.data?.ticketsSold ?? 0)} />
        <Stat icon={<QrCode size={16} />} label="Gate scans" value={String(scans.data?.total ?? 0)} />
      </div>

      <div className="panel mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search order id or payment ref"
              className="w-full bg-transparent outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrdersFilter["status"]);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All statuses" : option}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">{total} orders</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Loading orders…
          </div>
        ) : error ? (
          <div className="px-5 py-10 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : "Could not load orders."}
          </div>
        ) : orders.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No orders match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Holder</th>
                  <th className="px-4 py-3 font-semibold">Match</th>
                  <th className="px-4 py-3 font-semibold">Seats</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/tickets/${order.id}`} className="font-semibold text-pitch hover:underline">
                        {order.id}
                      </Link>
                      <p className="text-[10px] text-slate-400">{order.paymentRef ?? "no payment ref"}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-semibold text-slate-700">{order.holderName || "—"}</p>
                      <p className="text-[10px] text-slate-400">{order.holderEmail}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{order.matchLabel}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {order.seats.map((seat) => `${seat.row}${seat.number}`).join(", ")}
                      <p className="text-[10px] text-slate-400">
                        {usage.data?.[order.id]?.used ?? 0}/{order.seats.length} scanned
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-800">
                      {formatTHB(order.amountSatang)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={toneFor(order.status)}>{order.status.toUpperCase()}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{formatShortDate(order.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setRefunding(order)}
                        disabled={order.status !== "paid"}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                        <RotateCcw size={11} />
                        Refund
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
              className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={refunding !== null}
        title="Refund this order?"
        description={
          refunding
            ? `${formatTHB(refunding.amountSatang)} will be refunded through Stripe for ${refunding.id}. Used tickets are non-refundable; use the order detail page to override with an audit reason.`
            : undefined
        }
        confirmLabel="Refund order"
        busy={refund.isPending}
        onConfirm={() => void handleRefund()}
        onClose={() => setRefunding(null)}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">{icon}</div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
