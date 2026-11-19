"use client";

import { DoorOpen, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Modal, SectionTitle } from "@/components/ui";
import {
  useCreateGate,
  useDeleteGate,
  useGates,
  useUpdateGate,
  type AdminGate,
  type AdminGateInput,
} from "@/lib/queries/gates";
import { useMatches } from "@/lib/queries/matches";
import { useTenantDisplay } from "@/lib/queries/tenant";
import { useVenues, useVenueLayout } from "@/lib/queries/venues";
import { formatMatchDate, isGateFixtureOpen } from "@kickoff/shared";

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

export default function GatesPage() {
  const display = useTenantDisplay();
  const { data: gates, isLoading, error } = useGates();
  const { data: matches } = useMatches();
  const { data: venues } = useVenues();
  const createGate = useCreateGate();
  const updateGate = useUpdateGate();
  const deleteGate = useDeleteGate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminGate | null>(null);
  const [form, setForm] = useState<AdminGateInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: venueZones } = useVenueLayout(form.venueId || undefined);

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
  const venueLocked = editing !== null && editing.matchIds.length > 0;

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

  const openCreate = () => {
    setForm(emptyForm());
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (gate: AdminGate) => {
    setForm(formFrom(gate));
    setFormError(null);
    setEditing(gate);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const toggleMatch = (matchId: string) => {
    setForm((current) => ({
      ...current,
      matchIds: current.matchIds.includes(matchId)
        ? current.matchIds.filter((id) => id !== matchId)
        : [...current.matchIds, matchId],
    }));
  };

  const submit = async () => {
    setFormError(null);
    if (!ID_PATTERN.test(form.id)) {
      setFormError("Gate code must be 2–32 lowercase letters, numbers or dashes.");
      return;
    }
    if (form.name.trim().length === 0) {
      setFormError("Give the gate a name.");
      return;
    }
    if (form.venueId === "") {
      setFormError("Choose the venue this gate stands at.");
      return;
    }

    try {
      if (creating) {
        await createGate.mutateAsync({ ...form, id: form.id.trim(), name: form.name.trim() });
      } else if (editing) {
        await updateGate.mutateAsync({
          id: editing.id,
          patch: {
            name: form.name.trim(),
            venueId: form.venueId,
            venueZoneId: form.venueZoneId,
            matchIds: form.matchIds,
            active: form.active,
          },
        });
      }
      close();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the gate.");
    }
  };

  const remove = async (gate: AdminGate) => {
    if (!window.confirm(`Delete ${gate.name} (${gate.id})?`)) return;
    try {
      await deleteGate.mutateAsync(gate.id);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not delete the gate.");
    }
  };

  const busy = createGate.isPending || updateGate.isPending;

  return (
    <div>
      <SectionTitle
        eyebrow="Gate operations"
        title="Gates"
        description="Each gate is a turnstile at one stand of a venue. Assign every fixture it should admit — the scanner reads this list, so a pass for anything else is rejected as the wrong fixture or the wrong stand."
        action={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/scan" className="btn-ghost">
              <QrCode size={15} />
              Open scanner
            </Link>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus size={16} />
              New gate
            </button>
          </div>
        }
      />

      {formError && !creating && !editing ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Loading gates…</div>
        ) : error ? (
          <div className="px-5 py-12 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : "Could not load gates."}
          </div>
        ) : (gates ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-pitch">
              <DoorOpen size={22} />
            </div>
            <p className="text-sm font-semibold text-slate-800">No gates yet</p>
            <p className="max-w-sm text-xs text-slate-500">
              Add the stadium entrances so the scanner can admit supporters against the right
              fixture.
            </p>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus size={15} />
              Add the first gate
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Gate</th>
                  <th className="px-4 py-3 font-semibold">Venue</th>
                  <th className="px-4 py-3 font-semibold">Assigned fixtures</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(gates ?? []).map((gate) => (
                  <tr key={gate.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800">{gate.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{gate.id}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      <span className="block">{gate.venueName ?? gate.venueId}</span>
                      <span className="block text-[10px] text-slate-400">
                        {gate.venueZoneName ?? "Whole ground"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {gate.currentMatchLabels.length === 0 ? (
                        <span className="text-amber-600">No fixture today</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {gate.currentMatchLabels.slice(0, 3).map((label, index) => (
                            <li key={gate.currentMatchIds[index]} className="font-medium text-slate-700">
                              {label}
                            </li>
                          ))}
                          {gate.currentMatchLabels.length > 3 ? (
                            <li className="text-[10px] text-slate-400">
                              +{gate.currentMatchLabels.length - 3} more
                            </li>
                          ) : null}
                        </ul>
                      )}
                      {gate.matchIds.length > gate.currentMatchIds.length ? (
                        <span className="mt-1 block text-[10px] text-slate-400">
                          {gate.matchIds.length - gate.currentMatchIds.length} past assignment
                          {gate.matchIds.length - gate.currentMatchIds.length === 1 ? "" : "s"} kept
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={gate.active ? "green" : "muted"}>
                        {gate.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {formatMatchDate(gate.updatedAt, { timezone: display.timezone })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(gate)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50">
                          <Pencil size={11} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(gate)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-400"
                          aria-label={`Delete ${gate.name}`}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={creating || editing !== null}
        onClose={close}
        title={creating ? "New gate" : "Edit gate"}
        description="A gate stands at one stand of one venue and admits every fixture assigned to it. Each scan is recorded against this code."
        footer={
          <>
            <button type="button" onClick={close} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary">
              {busy ? "Saving…" : creating ? "Create gate" : "Save changes"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </div>
          ) : null}

          <label className="block">
            <span className="label mb-1.5 block">Gate code</span>
            <input
              value={form.id}
              onChange={(event) => setForm({ ...form, id: event.target.value.toLowerCase() })}
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
              onChange={(event) => setForm({ ...form, name: event.target.value })}
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
                setForm({
                  ...form,
                  venueZoneId: event.target.value === "" ? null : event.target.value,
                })
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
                    {match.opponent} · {formatMatchDate(match.kickoffAt, { timezone: display.timezone })} ({match.status})
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
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
              className="mt-0.5"
            />
            Active — the scanner can use this gate
          </label>
        </div>
      </Modal>
    </div>
  );
}
