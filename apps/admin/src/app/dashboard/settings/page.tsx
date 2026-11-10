"use client";

import {
  BellRing,
  Building2,
  DoorOpen,
  KeyRound,
  Loader2,
  Save,
  Settings2,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useState } from "react";
import { Badge, SectionTitle, Skeleton, useToast } from "@/components/ui";
import { useGates } from "@/lib/queries/gates";
import {
  useSettings,
  useUpdateSettings,
  type ClubSettings,
  type SettingsPatch,
} from "@/lib/queries/settings";

const TIMEZONES = ["Asia/Bangkok", "Asia/Singapore", "UTC"];

function clampInt(raw: string, min: number, max: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export default function SettingsPage() {
  const settings = useSettings();
  const gates = useGates();

  if (settings.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (settings.error || !settings.data) {
    return (
      <div className="panel p-8 text-center">
        <h1 className="display text-3xl text-slate-900">Settings unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          {settings.error instanceof Error
            ? settings.error.message
            : "Could not load club settings from Supabase."}
        </p>
      </div>
    );
  }

  return (
    <SettingsForm
      key={settings.data.updatedAt ?? "default"}
      settings={settings.data}
      gateCount={(gates.data ?? []).filter((gate) => gate.active).length}
    />
  );
}

function SettingsForm({ settings, gateCount }: { settings: ClubSettings; gateCount: number }) {
  const update = useUpdateSettings();
  const { toast } = useToast();
  const [values, setValues] = useState({
    clubName: settings.clubName,
    clubTimezone: settings.clubTimezone,
    maxSeatsPerOrder: String(settings.maxSeatsPerOrder),
    seatHoldTtlSeconds: String(settings.seatHoldTtlSeconds),
    kickoffLockMinutes: String(settings.kickoffLockMinutes),
    gateUndoSeconds: String(settings.gateUndoSeconds),
    notificationsEnabled: settings.notificationsEnabled,
  });

  const set = <K extends keyof typeof values,>(key: K, value: (typeof values)[K]) =>
    setValues((current) => {
      const next = { ...current };
      next[key] = value;
      return next;
    });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const patch: SettingsPatch = {
      clubName: values.clubName.trim() || settings.clubName,
      clubTimezone: values.clubTimezone,
      maxSeatsPerOrder: clampInt(values.maxSeatsPerOrder, 1, 8),
      seatHoldTtlSeconds: clampInt(values.seatHoldTtlSeconds, 60, 3600),
      kickoffLockMinutes: clampInt(values.kickoffLockMinutes, 0, 240),
      gateUndoSeconds: clampInt(values.gateUndoSeconds, 0, 600),
      notificationsEnabled: values.notificationsEnabled,
    };

    try {
      await update.mutateAsync(patch);
      toast({
        title: "Settings saved",
        description: "Club configuration is now live for every admin.",
        tone: "green",
      });
    } catch (caught) {
      toast({
        title: "Could not save settings",
        description: caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "red",
      });
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="Club configuration"
        title="Settings"
        description="Operational defaults stored for the admin console, checkout, and gate scanner."
        action={
          <Badge tone="muted">
            <Settings2 size={11} />
            {settings.currency.toUpperCase()}
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="panel p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Club profile</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Shown on receipts and used to format fixture times.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label mb-1.5 block">Club name</span>
                <input
                  value={values.clubName}
                  onChange={(event) => set("clubName", event.target.value)}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Timezone</span>
                <select
                  value={values.clubTimezone}
                  onChange={(event) => set("clubTimezone", event.target.value)}
                  className="input">
                  {TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
                <Timer size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Sales &amp; holds</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Stored centrally so every admin sees the same values. Server-side safety limits still apply.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label mb-1.5 block">Max seats per order</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={values.maxSeatsPerOrder}
                  onChange={(event) => set("maxSeatsPerOrder", event.target.value)}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Hold TTL (seconds)</span>
                <input
                  type="number"
                  min={60}
                  max={3600}
                  value={values.seatHoldTtlSeconds}
                  onChange={(event) => set("seatHoldTtlSeconds", event.target.value)}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Kick-off lock (minutes)</span>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={values.kickoffLockMinutes}
                  onChange={(event) => set("kickoffLockMinutes", event.target.value)}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Gate undo window (seconds)</span>
                <input
                  type="number"
                  min={0}
                  max={600}
                  value={values.gateUndoSeconds}
                  onChange={(event) => set("gateUndoSeconds", event.target.value)}
                  className="input"
                />
              </label>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
                  <BellRing size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Send kick-off reminders and matchday updates to supporters.
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={values.notificationsEnabled}
                  onChange={(event) => set("notificationsEnabled", event.target.checked)}
                  className="h-4 w-4"
                />
                {values.notificationsEnabled ? "On" : "Off"}
              </label>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="submit" disabled={update.isPending} className="btn-primary">
              {update.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              Save settings
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label text-pitch">Gate operations</p>
                <h2 className="display mt-0.5 text-2xl text-slate-900">Active gates</h2>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
                <DoorOpen size={18} />
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">{gateCount}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Configured entrances. Each gate admits exactly one fixture.
            </p>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label text-pitch">Ticket security</p>
                <h2 className="display mt-0.5 text-2xl text-slate-900">QR key version</h2>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-pitch">
                <KeyRound size={18} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge tone="green">
                <ShieldCheck size={11} />
                {settings.qrKeyVersion}
              </Badge>
              <span className="text-[11px] text-slate-400">read-only</span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Signing keys live in Edge Function secrets. Rotation requires a coordinated deploy;
              clients never hold the HMAC key.
            </p>
            <a
              href="https://supabase.com/docs/guides/functions/secrets"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost mt-3 w-full">
              <KeyRound size={14} />
              Key-rotation runbook
            </a>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-5 text-amber-800">
            <span className="font-semibold">Security note:</span> notification changes and QR key
            versions are recorded with the admin actor. QR signing keys are never displayed in the
            browser.
          </section>
        </div>
      </div>
    </div>
  );
}
