"use client";

import { AlertTriangle, LayoutDashboard, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
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
      : "An unexpected error interrupted the dashboard.";

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="panel w-full max-w-md p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle size={22} />
        </div>
        <h1 className="display mt-4 text-3xl text-slate-900">Operations paused</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => retry()} className="btn-primary">
            <RefreshCw size={15} />
            Try again
          </button>
          <Link href="/dashboard" className="btn-ghost">
            <LayoutDashboard size={15} />
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
