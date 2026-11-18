"use client";

import { useState } from "react";
import {
  adminCreateMatchSchema,
  adminRescheduleSchema,
  majorToMinorUnits,
  type MatchDto,
  brand,
} from "@kickoff/shared";
import type { AdminMatchInput } from "@/lib/queries/matches";
import { useGates } from "@/lib/queries/gates";
import { useSettings } from "@/lib/queries/settings";
import { useCreateVenue, useVenueLayout, useVenues } from "@/lib/queries/venues";

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

export function MatchForm({ initial, submitting = false, onSubmit }: MatchFormProps) {
  const isCreate = !initial?.id;
  const venuesQuery = useVenues();
  const gatesQuery = useGates();
  const settings = useSettings();
  const createVenue = useCreateVenue();
  const venues = venuesQuery.data ?? [];
  const gates = gatesQuery.data ?? [];
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
  const [venueId, setVenueId] = useState<string | null>(null);
  const [gateIds, setGateIds] = useState<string[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [addingVenue, setAddingVenue] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: "", city: "" });
  const [venueError, setVenueError] = useState<string | null>(null);

  const homeVenue = venues.find((venue) => venue.isHome);
  const awayVenues = venues.filter((venue) => !venue.isHome);
  const defaultVenue = values.homeAway === "home" ? homeVenue : awayVenues[0];
  const selectedVenue = venues.find((venue) => venue.id === venueId) ?? defaultVenue;
  const layoutQuery = useVenueLayout(isCreate ? selectedVenue?.id : undefined);
  const venueZones = layoutQuery.data ?? [];
  const venueGates = gates.filter(
    (gate) => gate.active && gate.venueId === selectedVenue?.id,
  );
  const effectiveGateIds = gateIds ?? venueGates.map((gate) => gate.id);

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
  const originalIso = initial?.id && !Number.isNaN(storedMs) ? new Date(storedMs).toISOString() : null;
  const kickoffChanged = Boolean(initial?.id) && kickoffIso !== "" && kickoffIso !== originalIso;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = adminCreateMatchSchema.safeParse({
      ...values,
      venue: isCreate ? (selectedVenue?.name ?? "") : values.venue,
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

    if (isCreate) {
      if (!selectedVenue) {
        setFormError(
          values.homeAway === "home"
            ? "Add the club's home venue before creating a fixture."
            : "Choose or add an away venue before creating a fixture.",
        );
        return;
      }
      if (venueZones.length === 0) {
        setFormError("Add at least one zone to this venue before creating a fixture.");
        return;
      }
      if (venueGates.length === 0) {
        setFormError("Add at least one gate to this venue before creating a fixture.");
        return;
      }
    }

    setErrors({});
    try {
      const zonePrices = Object.fromEntries(
        venueZones.map((zone) => [
          zone.id,
          majorToMinorUnits(
            Number(prices[zone.id] ?? zone.defaultPriceMinorUnits / 100),
            "THB",
          ),
        ]),
      );
      const payload: AdminMatchInput = {
        ...(parsed.data as AdminMatchInput),
        ...(isCreate
          ? {
              venueId: selectedVenue?.id,
              gateIds: effectiveGateIds,
              zonePrices,
            }
          : {}),
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
        {!isCreate ? (
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
        ) : null}
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
            onChange={(event) => {
              set("homeAway")(event.target.value);
              setVenueId(null);
              setGateIds(null);
              setPrices({});
            }}
            className="input">
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </Field>

        {isCreate ? (
          <>
            <Field label="Venue" error={errors.venue}>
              <select
                value={selectedVenue?.id ?? ""}
                onChange={(event) => {
                  setVenueId(event.target.value || null);
                  setGateIds(null);
                  setPrices({});
                }}
                className="input">
                {selectedVenue ? null : <option value="">Choose a venue…</option>}
                {(values.homeAway === "home"
                  ? homeVenue
                    ? [homeVenue]
                    : []
                  : awayVenues
                ).map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.isHome ? " · Home" : ""}
                    {venue.capacity > 0 ? ` · ${venue.capacity} seats` : ""}
                  </option>
                ))}
              </select>
            </Field>

            {values.homeAway === "away" ? (
              <div className="sm:col-span-2">
                {addingVenue ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={newVenue.name}
                        onChange={(event) =>
                          setNewVenue((current) => ({ ...current, name: event.target.value }))
                        }
                        className="input"
                        placeholder="Away ground name"
                      />
                      <input
                        value={newVenue.city}
                        onChange={(event) =>
                          setNewVenue((current) => ({ ...current, city: event.target.value }))
                        }
                        className="input"
                        placeholder="City"
                      />
                    </div>
                    {venueError ? (
                      <p className="mt-2 text-[11px] text-red-600">{venueError}</p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={createVenue.isPending}
                        onClick={async () => {
                          setVenueError(null);
                          if (!newVenue.name.trim()) {
                            setVenueError("Give the away venue a name.");
                            return;
                          }
                          try {
                            const created = await createVenue.mutateAsync({
                              name: newVenue.name,
                              city: newVenue.city,
                              isHome: false,
                            });
                            setVenueId(created.id);
                            setGateIds(null);
                            setPrices({});
                            setAddingVenue(false);
                            setNewVenue({ name: "", city: "" });
                          } catch (caught) {
                            setVenueError(
                              caught instanceof Error
                                ? caught.message
                                : "Could not add the venue.",
                            );
                          }
                        }}
                        className="btn-primary px-3 py-2 text-[11px]">
                        {createVenue.isPending ? "Saving…" : "Add venue"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingVenue(false)}
                        className="btn-ghost px-3 py-2 text-[11px]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingVenue(true)}
                    className="btn-ghost px-3 py-2 text-[11px]">
                    Add away venue
                  </button>
                )}
              </div>
            ) : null}

            {selectedVenue && venueZones.length > 0 ? (
              <div className="sm:col-span-2">
                <span className="label mb-1.5 block">Prices for this fixture</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {venueZones.map((zone) => (
                    <label key={zone.id} className="block text-[11px] text-slate-600">
                      {zone.name}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={prices[zone.id] ?? String(zone.defaultPriceMinorUnits / 100)}
                        onChange={(event) =>
                          setPrices((current) => ({ ...current, [zone.id]: event.target.value }))
                        }
                        className="input mt-1"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedVenue ? (
              <div className="sm:col-span-2">
                <span className="label mb-1.5 block">Gates for this fixture</span>
                {venueGates.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    This venue has no active gate. Add one on the Gates page before selling.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 p-3">
                    {venueGates.map((gate) => (
                      <label key={gate.id} className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={effectiveGateIds.includes(gate.id)}
                          onChange={() =>
                            setGateIds(
                              effectiveGateIds.includes(gate.id)
                                ? effectiveGateIds.filter((id) => id !== gate.id)
                                : [...effectiveGateIds, gate.id],
                            )
                          }
                        />
                        {gate.name} ({gate.id})
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : null}
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
