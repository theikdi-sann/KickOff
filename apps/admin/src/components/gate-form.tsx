"use client";

import { useState } from "react";
import { formatMatchDate, isGateFixtureOpen } from "@kickoff/shared";
import { useMatches } from "@/lib/queries/matches";
import { useTenantDisplay } from "@/lib/queries/tenant";
import { useVenues, useVenueLayout } from "@/lib/queries/venues";
import type { AdminGate, AdminGateInput } from "@/lib/queries/gates";

export const GATE_FORM_ID = "gate-form";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

function emptyForm(): AdminGateInput {
  return { id: "", name: "", venueId: "", venueZoneId: null, matchIds: [], active: true };
}

function formFrom(gate: AdminGate): AdminGateInput {
  return {
    id: gate.id,
    name: gate.name,
    venueId: gate.venueId,
    venueZoneId: gate.venueZoneId,
    matchIds: gate.matchIds,
    active: gate.active,
  };
}

interface GateFormProps {
  /** The gate being edited; omit to create a new one. */
  gate?: AdminGate | null;
  onSubmit: (input: AdminGateInput) => Promise<void> | void;
}

/**
 * One gate's fields. A gate is a physical turnstile at one stand of one
 * venue, and it admits the fixtures assigned to it — so the fixture list is
 * scoped to the gate's ground and the clock.
 */
export function GateForm({ gate, onSubmit }: GateFormProps) {
  const display = useTenantDisplay();
  const { data: matches } = useMatches();
  const { data: venues } = useVenues();
  const [form, setForm] = useState<AdminGateInput>(gate ? formFrom(gate) : emptyForm);
  const [error, setError] = useState<string | null>(null);
  const { data: venueZones } = useVenueLayout(form.venueId || undefined);

  const creating = gate === null || gate === undefined;

  // A gate is physical: the same turnstile serves today's match and the ones
  // after it, and only fixtures at its own ground may be ticked. Only
  // fixtures that are still scheduled or live may be ticked; everything
  // already assigned in the past stays in `form.matchIds` so saving the gate
  // never rewrites its history.
  const openMatches = (matches ?? []).filter(
    (match) => match.venueId === form.venueId && isGateFixtureOpen(match),
  );
  const openMatchIds = new Set(openMatches.map((match) => match.id));
  const historyMatchIds = form.matchIds.filter((id) => !openMatchIds.has(id));

  // A turnstile does not relocate: once a gate has admitted anything, its
  // ground is history. Create a new gate instead of rewriting the log.
  const venueLocked = gate ? gate.matchIds.length > 0 : false;

  const changeVenue = (venueId: string) => {
    setForm((current) => ({
      ...current,
      venueId,
      // A stand belongs to one ground, and a fixture belongs to one ground.
      venueZoneId: null,
      matchIds: current.matchIds.filter((id) =>
        (matches ?? []).some((match) => match.id === id && match.venueId === venueId),
      ),
    }));
  };

  const toggleMatch = (matchId: string) => {
    setForm((current) => ({
      ...current,
      matchIds: current.matchIds.includes(matchId)
        ? current.matchIds.filter((id) => id !== matchId)
        : [...current.matchIds, matchId],
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!ID_PATTERN.test(form.id)) {
      setError("Gate code must be 2–32 lowercase letters, numbers or dashes.");
      return;
    }
    if (form.name.trim().length === 0) {
      setError("Give the gate a name.");
      return;
    }
    if (form.venueId === "") {
      setError("Choose the venue this gate stands at.");
      return;
    }

    try {
      await onSubmit({ ...form, id: form.id.trim(), name: form.name.trim() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the gate.");
    }
  };

  return (
    <form id={GATE_FORM_ID} onSubmit={submit} className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <label className="block">
        <span className="label mb-1.5 block">Gate code</span>
        <input
          value={form.id}
          onChange={(event) =>
            setForm((current) => ({ ...current, id: event.target.value.toLowerCase() }))
          }
          disabled={!creating}
          placeholder="gate-2"
          className="input font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400"
        />
        <span className="mt-1 block text-[10px] text-slate-400">
          Lowercase letters, numbers and dashes. This is the id stored on every scan event.
        </span>
      </label>

      <label className="block">
        <span className="label mb-1.5 block">Display name</span>
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="East Gate"
          className="input"
        />
      </label>

      <label className="block">
        <span className="label mb-1.5 block">Venue</span>
        <select
          value={form.venueId}
          onChange={(event) => changeVenue(event.target.value)}
          disabled={venueLocked}
          className="input disabled:bg-slate-50 disabled:text-slate-400">
          <option value="">Choose a venue…</option>
          {(venues ?? []).map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
              {venue.city ? ` · ${venue.city}` : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[10px] text-slate-400">
          {venueLocked
            ? "This gate already has assignments, so its ground is fixed. Create a new gate to serve another venue."
            : "Where this turnstile physically stands."}
        </span>
      </label>

      <label className="block">
        <span className="label mb-1.5 block">Stand</span>
        <select
          value={form.venueZoneId ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              venueZoneId: event.target.value === "" ? null : event.target.value,
            }))
          }
          disabled={form.venueId === ""}
          className="input disabled:bg-slate-50 disabled:text-slate-400">
          <option value="">Whole ground</option>
          {(venueZones ?? []).map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[10px] text-slate-400">
          A pass for another stand is refused here — choose <em>Whole ground</em> only for an
          entrance that admits every stand.
        </span>
      </label>

      <div className="block">
        <span className="label mb-1.5 block">Current &amp; upcoming fixtures</span>
        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {form.venueId === "" ? (
            <p className="px-1 py-2 text-xs text-slate-400">
              Choose a venue first — only fixtures at that ground can be admitted.
            </p>
          ) : openMatches.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-400">
              No scheduled fixture at this venue — create one first.
            </p>
          ) : (
            openMatches.map((match) => (
              <label
                key={match.id}
                className="flex items-start gap-2 rounded-lg px-1 py-1 text-xs text-slate-600 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={form.matchIds.includes(match.id)}
                  onChange={() => toggleMatch(match.id)}
                  className="mt-0.5"
                />
                {match.opponent} · {formatMatchDate(match.kickoffAt, { timezone: display.timezone })} (
                {match.status})
              </label>
            ))
          )}
        </div>
        <span className="mt-1 block text-[10px] text-slate-400">
          A gate may admit several fixtures; a pass for anything else is rejected as the wrong
          fixture.
        </span>
        {historyMatchIds.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <span className="label mb-1 block text-[10px]">Past assignments (kept)</span>
            <ul className="space-y-0.5">
              {historyMatchIds.map((id) => {
                const match = (matches ?? []).find((candidate) => candidate.id === id);
                return (
                  <li key={id} className="px-1 text-[11px] text-slate-500">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked disabled className="mt-0.5" />
                      {match
                        ? `${match.opponent} · ${formatMatchDate(match.kickoffAt, { timezone: display.timezone })}`
                        : id}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) =>
            setForm((current) => ({ ...current, active: event.target.checked }))
          }
          className="mt-0.5"
        />
        Active — the scanner can use this gate
      </label>
    </form>
  );
}
