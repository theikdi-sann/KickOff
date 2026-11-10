import type { Metadata } from "next";
import { DashboardOverview } from "./overview";

/**
 * P11-20: the overview reads live Supabase data on every visit, so the route
 * is forced dynamic. Route segment config only applies from a Server
 * Component in Next 16 — the interactive view itself stays a client component
 * in `overview.tsx`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overview",
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
