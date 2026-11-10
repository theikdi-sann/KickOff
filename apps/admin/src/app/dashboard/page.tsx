"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Megaphone,
  QrCode,
  ScanLine,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge, EmptyState, SectionTitle, Skeleton } from "@/components/ui";
import { useMatches, useAllZones, useMatchSalesSummaries } from "@/lib/queries/matches";
import { useNews } from "@/lib/queries/news";
import { useOrders, useOrdersAggregate } from "@/lib/queries/orders";
import { useScanStats } from "@/lib/queries/scan";
import { cn } from "@/lib/utils";
import { formatMatchDate, formatMatchTime, formatTHB } from "@kickoff/shared";

export default function DashboardPage() {
  const matchesQuery = useMatches();
  const zonesQuery = useAllZones();
  const salesQuery = useMatchSalesSummaries();
  const newsQuery = useNews();
  const ordersQuery = useOrders({ page: 1, perPage: 4, status: "all" });
  const aggregate = useOrdersAggregate();
  const scans = useScanStats();

  const now = new Date();
  const matches = matchesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const news = newsQuery.data ?? [];
  const sales = salesQuery.data ?? {};
  const recentOrders = ordersQuery.data?.items ?? [];

  const upcoming = matches
    .filter((match) => match.status === "upcoming")
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
  const next = upcoming[0];
  const nextZones = zones.filter((zone) => zone.matchId === next?.id);
  const capacity = nextZones.reduce((sum, zone) => sum + zone.rows.length * zone.seatsPerRow, 0);
  const sold = Math.min(capacity, next ? (sales[next.id]?.ticketsSold ?? 0) : 0);
  const available = Math.max(0, capacity - sold);
  const sellThrough = capacity ? Math.round((sold / capacity) * 100) : 0;
  const revenue = aggregate.data?.revenueSatang ?? 0;
  const ticketsSold = aggregate.data?.ticketsSold ?? 0;
  const pulse = [
    { label: "Paid", value: aggregate.data?.ordersPaid ?? 0 },
    { label: "Tickets", value: ticketsSold },
    { label: "Scans", value: scans.data?.total ?? 0 },
    { label: "Valid", value: scans.data?.valid ?? 0 },
  ];
  const pulseMax = Math.max(1, ...pulse.map((item) => item.value));

  const daysToMatch = next
    ? Math.max(0, Math.ceil((new Date(next.kickoffAt).getTime() - now.getTime()) / 86_400_000))
    : 0;

  const isLoading = matchesQuery.isLoading || zonesQuery.isLoading;
  const loadError =
    matchesQuery.error ??
    zonesQuery.error ??
    salesQuery.error ??
    newsQuery.error ??
    ordersQuery.error ??
    aggregate.error ??
    scans.error;

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-5 h-14 w-80" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="panel p-8 text-center">
        <h1 className="display text-3xl text-slate-900">Overview unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          {loadError instanceof Error ? loadError.message : "Could not load the matchday overview."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle
        eyebrow={now.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Bangkok",
        })}
        title="Matchday overview"
        description="Everything the club needs to run the next home fixture."
        action={
          <Link href="/dashboard/matches" className="btn-primary">
            <CalendarDays size={16} />
            Create fixture
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<CircleDollarSign size={17} />}
          label="Ticket revenue"
          value={formatTHB(revenue)}
          note="Paid orders, last 30 days"
          tone="green"
        />
        <StatCard
          icon={<Ticket size={17} />}
          label="Passes sold"
          value={String(ticketsSold)}
          note={`${sellThrough}% of next-match capacity`}
          tone="gold"
        />
        <StatCard
          icon={<CalendarDays size={17} />}
          label="Upcoming fixtures"
          value={String(upcoming.length)}
          note={next ? `Next in ${daysToMatch} days` : "No fixture scheduled"}
          tone="blue"
        />
        <StatCard
          icon={<QrCode size={17} />}
          label="Gate scans"
          value={String(scans.data?.valid ?? 0)}
          note={`${scans.data?.total ?? 0} scans, last 30 days`}
          tone="violet"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {next ? (
            <div className="relative overflow-hidden rounded-3xl bg-night p-5 text-white shadow-[0_18px_50px_rgba(7,19,13,0.22)] sm:p-6">
              <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/[0.06]" />
              <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-pitch/25 blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-gold">
                        Next home fixture
                      </p>
                    </div>
                    <h2 className="display mt-3 text-[38px] leading-9">
                      KickOff vs {next.opponent}
                    </h2>
                    <p className="mt-1 text-xs text-emerald-50/50">
                      {formatMatchDate(next.kickoffAt)} · {formatMatchTime(next.kickoffAt)} · {next.venue}
                    </p>
                  </div>
                  <div className="hidden rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-center sm:block">
                    <p className="display text-2xl leading-5 text-gold">{daysToMatch}</p>
                    <p className="mt-1 text-[8px] uppercase tracking-[0.12em] text-emerald-50/40">days away</p>
                  </div>
                </div>

                <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-emerald-50/45">
                      <span>Seat inventory sold</span>
                      <span>
                        {sold} / {capacity}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${sellThrough}%` }} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-50/40">
                      <Users size={11} />
                      {available} seats still available across {nextZones.length} zones
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/matches/${next.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-xs font-bold text-night transition hover:brightness-95">
                    Manage seating
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <EmptyState
                icon={<CalendarDays size={22} />}
                title="No upcoming fixture"
                description="Create a fixture to start configuring zones and selling seats."
                action={
                  <Link href="/dashboard/matches" className="btn-primary">
                    <CalendarDays size={15} />
                    Create fixture
                  </Link>
                }
              />
            </div>
          )}

          <div className="panel p-5">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="label text-pitch">Operations pulse</p>
                <h2 className="display mt-0.5 text-2xl text-slate-900">Last 30 days</h2>
              </div>
              <Badge tone="green">
                <TrendingUp size={10} />
                Live
              </Badge>
            </div>
            <div className="flex h-40 items-end gap-2 sm:gap-4">
              {pulse.map((bar, index) => (
                <div key={bar.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[10px] font-semibold text-slate-500">{bar.value}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-md transition-all",
                        index === 0 ? "bg-pitch" : "bg-emerald-100",
                      )}
                      style={{
                        height: `${Math.max(4, Math.round((bar.value / pulseMax) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400">
              <span>Paid orders · tickets · gate scans · valid entries</span>
              <span>Live from Supabase</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label text-pitch">Gate operations</p>
                <h2 className="display mt-0.5 text-2xl text-slate-900">Scanner ready</h2>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-night p-4 text-white">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-gold">
                <ScanLine size={21} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold">Gate 2 · North Stand</p>
                <p className="mt-0.5 text-[10px] text-emerald-50/45">
                  {scans.data?.total ?? 0} scans recorded
                </p>
              </div>
              <QrCode size={18} className="text-gold" />
            </div>
            <Link href="/dashboard/scan" className="btn-ghost mt-3 w-full">
              Open gate scanner
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="panel p-5">
            <p className="label text-pitch">Quick actions</p>
            <div className="mt-3 space-y-2">
              <QuickAction
                href="/dashboard/matches"
                icon={<CalendarDays size={15} />}
                label="Create a fixture"
                detail="Set kickoff and generate seating"
              />
              <QuickAction
                href="/dashboard/news"
                icon={<Megaphone size={15} />}
                label="Publish club news"
                detail={`${news.length} articles in the feed`}
              />
              <QuickAction
                href="/dashboard/scan"
                icon={<QrCode size={15} />}
                label="Validate a pass"
                detail="Camera or manual code entry"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-semibold text-emerald-800">Live Supabase data</p>
                <p className="mt-1 text-[11px] leading-5 text-emerald-700/75">
                  Fixtures, orders, tickets and scans are served by Supabase. Checkout and gate
                  admission are enforced by database RPCs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="label text-pitch">Recent activity</p>
              <h2 className="display mt-0.5 text-2xl text-slate-900">Latest orders</h2>
            </div>
            <Link href="/dashboard/tickets" className="text-[11px] font-semibold text-pitch">
              View all
            </Link>
          </div>
          {ordersQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Orders appear here as soon as supporters complete checkout."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[10px] font-bold text-pitch">
                    {order.seats.length}×
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">{order.matchLabel}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {order.id.slice(-6).toUpperCase()} · {order.seats[0]?.zoneName} ·{" "}
                      {formatMatchDate(order.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-slate-800">{formatTHB(order.amountSatang)}</p>
                  <Badge tone={order.status === "paid" ? "green" : "muted"}>{order.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="label text-pitch">Club feed</p>
              <h2 className="display mt-0.5 text-2xl text-slate-900">Published news</h2>
            </div>
            <Link href="/dashboard/news" className="text-[11px] font-semibold text-pitch">
              Manage
            </Link>
          </div>
          {newsQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <EmptyState
              title="No articles yet"
              description="Publish a club update to fill the supporter feed."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {news.slice(0, 3).map((article) => (
                <Link
                  key={article.id}
                  href="/dashboard/news"
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50">
                  <div
                    className="h-10 w-10 shrink-0 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${article.imageColors[0]}, ${article.imageColors[1]})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">{article.title}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {article.category} · {formatMatchDate(article.publishedAt)}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "green" | "gold" | "blue" | "violet";
}) {
  const tones = {
    green: "bg-emerald-50 text-pitch",
    gold: "bg-amber-50 text-amber-600",
    blue: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <div className={cn("grid h-9 w-9 place-items-center rounded-xl", tones[tone])}>{icon}</div>
        <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">30d</span>
      </div>
      <p className="display mt-3 text-[30px] leading-7 text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-[10px] text-slate-400">{note}</p>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-emerald-200 hover:bg-emerald-50/40">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-pitch">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-slate-800">{label}</p>
        <p className="truncate text-[9px] text-slate-400">{detail}</p>
      </div>
      <ChevronRight size={13} className="text-slate-300" />
    </Link>
  );
}
