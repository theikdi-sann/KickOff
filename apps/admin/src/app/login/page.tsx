"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail, QrCode, ShieldCheck, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { isAdminUser, needsMfa, signIn } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.includes("@") || password.length < 8) {
      setError("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const user = await signIn(email, password);
      if (!isAdminUser(user)) {
        await createClient().auth.signOut();
        throw new Error("This account does not have admin access.");
      }
      router.replace((await needsMfa()) ? "/login/mfa" : "/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-night p-10 lg:flex lg:flex-col">
        <div className="absolute -right-24 top-16 h-80 w-80 rounded-full border border-white/[0.06]" />
        <div className="absolute -right-8 top-32 h-52 w-52 rounded-full border border-white/[0.05]" />
        <div className="absolute -left-20 bottom-24 h-64 w-64 rounded-full bg-pitch/20 blur-3xl" />
        <div className="absolute inset-y-0 left-1/3 w-px bg-gradient-to-b from-transparent via-white/[0.05] to-transparent" />

        <div className="relative z-10">
          <Logo dark />
        </div>

        <div className="relative z-10 my-auto max-w-xl">
          <Badge tone="dark" className="mb-5 w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Admin operations · 2026/27
          </Badge>
          <h1 className="display text-[74px] leading-[0.9] tracking-tight text-white">
            MATCHDAY
            <br />
            RUNS ON
            <br />
            <span className="text-gold">XCLUB.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-emerald-50/55">
            Fixtures, seat inventory, news publishing, and gate validation in one operating system
            for the club.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-2">
            <MiniStat icon={<Ticket size={15} />} value="3,480" label="Passes issued" />
            <MiniStat icon={<QrCode size={15} />} value="1,204" label="Gate scans" />
            <MiniStat icon={<ShieldCheck size={15} />} value="99.8%" label="Valid entries" />
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-emerald-50/30">
          <span>XClub Arena · Bangkok</span>
          <span>Matchday operations</span>
        </div>
      </div>

      <div className="flex min-h-screen flex-col bg-[#F5F7F6]">
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <Logo />
          <Badge tone="green">Live</Badge>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
          <div className="mb-8">
            <p className="label mb-2 text-pitch">Staff access</p>
            <h2 className="display text-[46px] leading-[0.95] text-slate-900">
              SIGN IN TO
              <br />
              OPERATIONS.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Sign in with your club staff account. Admin access requires two-factor
              authentication when enabled for your profile.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label mb-1.5 block" htmlFor="email">
                Email address
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
                <Mail size={16} className="text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="admin@xclub.app"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label block" htmlFor="password">
                  Password
                </label>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-pitch"
                  onClick={() => setError("Password reset is handled by an administrator.")}>
                  Forgot password?
                </button>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
                <Lock size={16} className="text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-slate-400 transition hover:text-slate-700"
                  aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {DEMO_EMAIL && DEMO_PASSWORD ? (
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                    Demo credentials
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700/80">
                    {DEMO_EMAIL} · {DEMO_PASSWORD}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(DEMO_EMAIL);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-amber-700 shadow-sm">
                  Fill
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {error}
              </div>
            ) : null}

            <button type="submit" disabled={loading} className="btn-primary h-12 w-full">
              {loading ? "Signing in…" : "Sign in to dashboard"}
              {!loading ? <ArrowRight size={16} /> : null}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-pitch">
                <ShieldCheck size={17} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">Protected staff access</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Sessions use Supabase Auth with HTTP-only cookies. Admin accounts can enrol TOTP
                  from Security settings; non-admin accounts are refused.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-[9px] uppercase tracking-[0.14em] text-slate-400">
            XClub operations console · v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-gold">{icon}</div>
      <p className="display mt-2 text-2xl leading-6 text-white">{value}</p>
      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-50/35">
        {label}
      </p>
    </div>
  );
}
