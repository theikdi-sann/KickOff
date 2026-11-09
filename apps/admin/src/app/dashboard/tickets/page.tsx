"use client";

import { Download, QrCode, RotateCcw, Search, Ticket, Wallet } from "lucide-react";
import { useState } from "react";
import { Badge, SectionTitle } from "@/components/ui";
import { useAdmin } from "@/lib/store";
import { cn } from "@/lib/utils";
import { formatMatchDate, formatShortDate, formatTHB } from "@xclub/shared";

type Filter = "all" | "valid" | "used";

export default function TicketsPage() {
  const { orders, tickets, usedTicketIds, resetDemo } = useAdmin();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const revenue = orders.filter((order) => order.status === "paid").reduce((sum, order) => sum + order.amountSatang, 0);
  const filteredTickets = tickets
    .filter((ticket) => (filter === "all" ? true : ticket.status === filter))
    .filter((ticket) =>
      `${ticket.holder} ${ticket.matchLabel} ${ticket.id}`.toLowerCase().includes(query.toLowerCase()),
    );

  const exportCsv = () => {
    const rows = [
      ["Order", "Match", "Seats", "Amount THB", "Status", "Created"],
      ...orders.map((order) => [
        order.id,
        order.matchLabel,
        String(order.seats.length),
        (order.amountSatang / 100).toFixed(2),
        order.status,
        order.createdAt,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xclub-orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Commerce"
        title="Orders & passes"
        description="Review mock purchases, ticket status, and gate scan state."
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportCsv} className="btn-ghost">
              <Download size={15} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset all mock admin data to the seeded demo?")) resetDemo();
              }}
              className="btn-primary">
              <RotateCcw size={15} />
              Reset demo
            </button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Wallet size={16} />} label="Revenue" value={formatTHB(revenue)} />
        <Stat icon={<Ticket size={16} />} label="Orders" value={String(orders.length)} />
        <Stat icon={<QrCode size={16} />} label="Passes issued" value={String(tickets.length)} />
        <Stat icon={<QrCode size={16} />} label="Scanned" value={`${usedTicketIds.length}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="label text-pitch">Orders</p>
              <h2 className="display mt-0.5 text-2xl text-slate-900">Purchase history</h2>
            </div>
            <Badge tone="green">{orders.length} records</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[9px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Match</th>
                  <th className="px-3 py-2.5 font-semibold">Seats</th>
                  <th className="px-3 py-2.5 font-semibold">Amount</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="text-xs transition hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{order.id.slice(-6).toUpperCase()}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{formatShortDate(order.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-700">{order.matchLabel}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{order.paymentRef}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{order.seats.length}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{formatTHB(order.amountSatang)}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={order.status === "paid" ? "green" : "muted"}>{order.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="label text-pitch">Pass registry</p>
            <h2 className="display mt-0.5 text-2xl text-slate-900">Ticket status</h2>
            <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
              {(["all", "valid", "used"] as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-[10px] font-semibold capitalize transition",
                    filter === value ? "bg-white text-pitch shadow-sm" : "text-slate-500",
                  )}>
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="border-b border-slate-100 px-4 py-2.5">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
              <Search size={12} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pass or holder"
                className="w-full bg-transparent text-[11px] outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="flex items-center gap-3 px-5 py-3">
                <div
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    ticket.status === "valid" ? "bg-emerald-50 text-pitch" : "bg-slate-100 text-slate-400",
                  )}>
                  <QrCode size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate-800">{ticket.holder}</p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-400">
                    {ticket.zoneName} {ticket.seatLabel} · {formatMatchDate(ticket.kickoffAt)}
                  </p>
                </div>
                <Badge tone={ticket.status === "used" ? "muted" : "green"}>{ticket.status}</Badge>
              </div>
            ))}
            {filteredTickets.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-slate-400">No passes match the filter.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-[11px] leading-5 text-slate-500">
        <span className="font-semibold text-slate-700">Note:</span> purchases made in the mobile mock
        are stored on the device, so this admin table only shows the seeded/validated admin records.
        The shared Supabase data source unifies both apps in Phase B.
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-pitch">{icon}</div>
      <div>
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <p className="mt-0.5 text-base font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
