"use client";

import { ArrowLeft, Download, Loader2, ReceiptText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, ConfirmDialog, useToast } from "@/components/ui";
import { invokeFunction } from "@/lib/functions";
import { useOrder, useRefund } from "@/lib/queries/orders";
import { formatFullDate, formatTHB } from "@kickoff/shared";

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const { data: order, isLoading, error } = useOrder(orderId);
  const refund = useRefund();
  const { toast } = useToast();

  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState(false);

  const handleRefund = async () => {
    if (!order) return;
    setActionError(null);
    try {
      await refund.mutateAsync({
        orderId: order.id,
        reason: reason.trim() || undefined,
        overrideUsedTickets: override,
      });
      toast({
        title: "Refund issued",
        description: `${formatTHB(order.amountSatang)} refunded for ${order.id}.`,
        tone: "green",
      });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Refund failed.");
    } finally {
      setConfirmingRefund(false);
    }
  };

  const openReceipt = async () => {
    if (!order) return;
    setActionError(null);
    setReceiptBusy(true);
    try {
      const result = await invokeFunction<{ url: string }>("receipt", {
        method: "POST",
        body: { orderId: order.id },
      });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not generate receipt.");
    } finally {
      setReceiptBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        Loading order…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Order not found."}
        </p>
        <Link href="/dashboard/tickets" className="btn-ghost mt-4 inline-flex">
          <ArrowLeft size={14} /> Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/tickets" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={13} /> Orders & passes
          </Link>
          <h1 className="display text-4xl leading-none text-slate-900">{order.id}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {order.holderName} · {order.holderEmail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={order.status === "paid" ? "green" : order.status === "pending" ? "gold" : "red"}>
            {order.status.toUpperCase()}
          </Badge>
          <button type="button" onClick={openReceipt} disabled={receiptBusy} className="btn-ghost">
            {receiptBusy ? <Loader2 size={14} className="animate-spin" /> : <ReceiptText size={14} />}
            Receipt PDF
          </button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-800">Seats</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {order.seats.map((seat) => (
              <div key={`${seat.seatId}-${seat.number}`} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {seat.zoneName} · Row {seat.row} · Seat {seat.number}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    ticket {seat.ticketId ?? "not issued"}
                  </p>
                </div>
                <span className="font-semibold text-slate-700">{formatTHB(seat.priceSatang)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Total</span>
            <span className="text-lg font-bold text-slate-900">{formatTHB(order.amountSatang)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5 text-sm">
            <h2 className="text-sm font-semibold text-slate-800">Payment</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Fixture" value={order.matchLabel} />
              <Row label="Created" value={formatFullDate(order.createdAt)} />
              <Row label="Paid" value={order.paidAt ? formatFullDate(order.paidAt) : "—"} />
              <Row label="Reference" value={order.paymentRef ?? "—"} />
            </dl>
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold text-slate-800">Refund</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Used tickets are non-refundable unless you tick the override. Every refund is audited.
            </p>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (optional)"
              className="input mt-3"
            />
            <label className="mt-3 flex items-start gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
                className="mt-0.5"
              />
              Override the used-ticket block (audited)
            </label>
            <button
              type="button"
              onClick={() => setConfirmingRefund(true)}
              disabled={refund.isPending || order.status !== "paid"}
              className="btn-primary mt-3 h-10 w-full disabled:opacity-50">
              {refund.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {order.status === "refunded" ? "Already refunded" : "Refund order"}
            </button>
            <button
              type="button"
              onClick={openReceipt}
              className="btn-ghost mt-2 h-10 w-full justify-center">
              <Download size={14} /> Download receipt
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingRefund}
        title="Refund this order?"
        description={`${formatTHB(order.amountSatang)} will be refunded through Stripe for ${order.id}. ${
          override
            ? "The used-ticket override is enabled and will be audited."
            : "Used tickets are non-refundable unless you enable the override."
        }`}
        confirmLabel="Refund order"
        busy={refund.isPending}
        onConfirm={() => void handleRefund()}
        onClose={() => setConfirmingRefund(false)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}
