"use client";

import { useState } from "react";
import {
  adminCreateMatchSchema,
  adminRescheduleSchema,
  type MatchDto,
  brand,
} from "@kickoff/shared";
import type { AdminMatchInput } from "@/lib/queries/matches";
import { useSettings } from "@/lib/queries/settings";
import { useVenues } from "@/lib/queries/venues";

const DEFAULT_COLORS: [string, string] = [brand.primary, brand.primaryDark];
const DEFAULT_ACCENT = brand.accent;

interface MatchFormProps {
  initial?: Partial<MatchDto>;
  submitting?: boolean;
  onSubmit: (input: AdminMatchInput) => Promise<void> | void;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // `<input type="datetime-local">` expects wall-clock time. Using
  // `toISOString()` would render UTC and shift the kickoff on save.
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Editing an existing fixture: match details and a venue pick. Creating a
 * fixture — with its ground, stands and gates — belongs to
 * `CreateFixtureForm`, which keeps the whole draft in one dialog.
 */
export function MatchForm({ initial, submitting = false, onSubmit }: MatchFormProps) {
  const venuesQuery = useVenues();
  const settings = useSettings();
  const venues = venuesQuery.data ?? [];
  const [values, setValues] = useState({
    opponent: initial?.opponent ?? "",
    opponentShort: initial?.opponentShort ?? "",
    kickoffAt: toLocalInput(initial?.kickoffAt),
    venue: initial?.venue ?? venues[0]?.name ?? "KickOff Arena",
    competition: initial?.competition ?? "Thai Premier League",
    homeAway: initial?.homeAway ?? "home",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  // RS-7: editing a fixture and moving its kickoff = a reschedule — the
  // shared rules (future / lock window / never earlier / ≤10 days) apply and
  // a reason becomes mandatory. Compare ISO instants (RS-7b): the raw
  // datetime-local string drops seconds, so a stored kickoff with seconds
  // would look unchanged while the submitted value still moves the fixture.
  const kickoffIso = values.kickoffAt ? new Date(values.kickoffAt).toISOString() : "";
  const storedKickoff = initial?.kickoffAt;
  const storedMs = storedKickoff ? new Date(storedKickoff).getTime() : Number.NaN;
  const originalIso =
    initial?.id && !Number.isNaN(storedMs) ? new Date(storedMs).toISOString() : null;
  const kickoffChanged = Boolean(initial?.id) && kickoffIso !== "" && kickoffIso !== originalIso;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = adminCreateMatchSchema.safeParse({
      ...values,
      kickoffAt: kickoffIso,
      posterColors: initial?.posterColors ?? DEFAULT_COLORS,
      accent: initial?.accent ?? DEFAULT_ACCENT,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join(".") || "form"] = issue.message;
      }
      setErrors(next);
      return;
    }

    let reason: string | undefined;
    if (kickoffChanged) {
      const reschedule = adminRescheduleSchema({
        currentKickoffAt: initial?.kickoffAt ?? kickoffIso,
        now: new Date().toISOString(),
        lockMinutes: settings.data?.kickoffLockMinutes ?? 15,
        status: initial?.status,
      }).safeParse({ kickoffAt: kickoffIso, reason: values.reason });

      if (!reschedule.success) {
        const next: Record<string, string> = {};
        for (const issue of reschedule.error.issues) {
          next[issue.path.join(".") || "form"] = issue.message;
        }
        setErrors(next);
        return;
      }
      reason = reschedule.data.reason;
    }

    setErrors({});
    try {
      const payload: AdminMatchInput = {
        ...(parsed.data as AdminMatchInput),
      };
      await onSubmit(reason !== undefined ? { ...payload, reason } : payload);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the match.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opponent" error={errors.opponent}>
          <input
            value={values.opponent}
            onChange={(event) => set("opponent")(event.target.value)}
            className="input"
            placeholder="Bangkok Rovers"
          />
        </Field>
        <Field label="Short code" error={errors.opponentShort}>
          <input
            value={values.opponentShort}
            onChange={(event) => set("opponentShort")(event.target.value.toUpperCase())}
            maxLength={8}
            className="input"
            placeholder="BKR"
          />
        </Field>
        <Field label="Kick-off" error={errors.kickoffAt}>
          <input
            type="datetime-local"
            value={values.kickoffAt}
            onChange={(event) => set("kickoffAt")(event.target.value)}
            className="input"
          />
        </Field>
        {kickoffChanged ? (
          // RS-7: moving the kickoff demands the justification that ends up
          // in audit_logs — same rules, same messages, as the shared schema.
          <div className="sm:col-span-2">
            <Field label="Reason" error={errors.reason}>
              <input
                value={values.reason}
                onChange={(event) => set("reason")(event.target.value)}
                className="input"
                placeholder="TV broadcast request"
                maxLength={400}
              />
            </Field>
          </div>
        ) : null}
        <Field label="Venue" error={errors.venue}>
          <select
            value={values.venue}
            onChange={(event) => set("venue")(event.target.value)}
            className="input">
            {/* Keep an editing fixture's venue selectable even if the row was
                deleted since the form loaded — the option stays truthful. */}
            {venues.length > 0 && !venues.some((venue) => venue.name === values.venue) ? (
              <option value={values.venue}>{values.venue}</option>
            ) : null}
            {venues.map((venue) => (
              <option key={venue.id} value={venue.name}>
                {venue.name}
                {venue.city ? ` · ${venue.city}` : ""}
              </option>
            ))}
            {venues.length === 0 ? <option value={values.venue}>{values.venue}</option> : null}
          </select>
        </Field>
        <Field label="Competition" error={errors.competition}>
          <input
            value={values.competition}
            onChange={(event) => set("competition")(event.target.value)}
            className="input"
          />
        </Field>
        <Field label="Home / away" error={errors.homeAway}>
          <select
            value={values.homeAway}
            onChange={(event) => set("homeAway")(event.target.value)}
            className="input">
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </Field>
      </div>

      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary h-11 px-5 disabled:opacity-60">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-red-600">{error}</span> : null}
    </label>
  );
}
