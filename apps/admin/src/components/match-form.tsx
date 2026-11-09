"use client";

import { useState } from "react";
import { adminCreateMatchSchema, type MatchDto } from "@xclub/shared";
import type { AdminMatchInput } from "@/lib/queries/matches";

const DEFAULT_COLORS: [string, string] = ["#0B6B3A", "#052E1A"];
const DEFAULT_ACCENT = "#F4C430";

interface MatchFormProps {
  initial?: Partial<MatchDto>;
  submitting?: boolean;
  onSubmit: (input: AdminMatchInput) => Promise<void> | void;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export function MatchForm({ initial, submitting = false, onSubmit }: MatchFormProps) {
  const [values, setValues] = useState({
    opponent: initial?.opponent ?? "",
    opponentShort: initial?.opponentShort ?? "",
    kickoffAt: toLocalInput(initial?.kickoffAt),
    venue: initial?.venue ?? "XClub Arena",
    competition: initial?.competition ?? "Thai Premier League",
    homeAway: initial?.homeAway ?? "home",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = adminCreateMatchSchema.safeParse({
      ...values,
      kickoffAt: values.kickoffAt ? new Date(values.kickoffAt).toISOString() : "",
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

    setErrors({});
    try {
      await onSubmit(parsed.data as AdminMatchInput);
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
        <Field label="Venue" error={errors.venue}>
          <input
            value={values.venue}
            onChange={(event) => set("venue")(event.target.value)}
            className="input"
          />
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

      <button type="submit" disabled={submitting} className="btn-primary h-11 px-5 disabled:opacity-60">
        {submitting ? "Saving…" : initial?.id ? "Save changes" : "Create fixture"}
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
