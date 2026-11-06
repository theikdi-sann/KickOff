"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Megaphone,
  QrCode,
  Search,
  Ticket,
  Bell,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { useAdmin } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/matches", label: "Matches & seating", icon: CalendarDays },
  { href: "/dashboard/news", label: "News & results", icon: Megaphone },
  { href: "/dashboard/scan", label: "Gate scan", icon: QrCode },
  { href: "/dashboard/tickets", label: "Orders & passes", icon: Ticket },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/matches": "Matches & seating",
  "/dashboard/news": "News & results",
  "/dashboard/scan": "Gate validation",
  "/dashboard/tickets": "Orders & passes",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { hydrated, profile } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !profile) router.replace("/login");
  }, [hydrated, profile, router]);

  if (!hydrated || !profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F5F7F6]">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-pitch text-xl font-bold text-gold">
            X
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Loading operations…
          </p>
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}

function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut } = useAdmin();
  if (!profile) return null;
  const currentTitle =
    Object.entries(pageTitles)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? "Dashboard";

  return (
    <div className="min-h-screen bg-[#F5F7F6]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-night px-4 py-5 lg:flex">
        <div className="px-2">
          <Logo dark />
        </div>

        <div className="mt-8 px-2">
          <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-emerald-100/35">
            Operations
          </p>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                  active
                    ? "bg-pitch text-white shadow-[0_8px_24px_rgba(11,107,58,0.35)]"
                    : "text-emerald-50/60 hover:bg-white/5 hover:text-white",
                )}>
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                <span className="flex-1">{item.label}</span>
                {active ? <ChevronRight size={13} className="text-gold" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold text-xs font-bold text-night">
              {profile.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{profile.fullName}</p>
              <p className="truncate text-[10px] text-emerald-100/45">{profile.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[11px] font-medium text-emerald-50/60 transition hover:bg-white/5 hover:text-white">
            <LogOut size={13} />
            Sign out
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between px-2 pb-1">
          <Badge tone="dark">Mock data</Badge>
          <span className="text-[9px] text-emerald-100/30">v0.1.0</span>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#F5F7F6]/85 backdrop-blur-xl">
          <div className="flex h-[66px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-2 text-xs text-slate-400 md:flex">
              <span>XClub Arena</span>
              <ChevronRight size={12} />
              <span className="font-medium text-slate-700">{currentTitle}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 sm:flex">
                <Search size={14} />
                <span className="w-36">Search operations</span>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-400">
                  ⌘K
                </kbd>
              </div>
              <button
                type="button"
                className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500">
                <Bell size={16} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
              </button>
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Live demo
                </span>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-pitch text-[11px] font-bold text-white">
                {profile.initials}
              </div>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium",
                    active
                      ? "border-pitch bg-pitch text-white"
                      : "border-slate-200 bg-white text-slate-600",
                  )}>
                  <Icon size={13} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
