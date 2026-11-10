"use client";

import { QrCode, RefreshCw, ShieldAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function ScanError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message =
    error instanceof Error && error.message
      ? error.message
      : "The gate scanner hit an unexpected error.";

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="panel w-full max-w-lg p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert size={22} />
        </div>
        <h1 className="display mt-4 text-3xl text-slate-900">Scanner offline</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Scans already queued offline stay on this device and will replay when the scanner
          reconnects. Do not start a second browser session at the same gate.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => retry()} className="btn-primary">
            <RefreshCw size={15} />
            Reload scanner
          </button>
          <Link href="/dashboard/scan" className="btn-ghost">
            <QrCode size={15} />
            Back to scanner
          </Link>
          <Link href="/dashboard/tickets" className="btn-ghost">
            <Undo2 size={15} />
            Orders &amp; passes
          </Link>
        </div>
      </div>
    </div>
  );
}
