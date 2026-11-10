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
import { formatMatchDate, formatMatchTime } from "@kickoff/shared";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

function emptyForm(): AdminGateInput {
  return { id: "", name: "", matchId: null, active: true };
}

function formFrom(gate: AdminGate): AdminGateInput {
  return {
    id: gate.id,
    name: gate.name,
    matchId: gate.matchId,
    active: gate.active,
  };
}

export default function GatesPage() {
  const { data: gates, isLoading, error } = useGates();
  const { data: matches } = useMatches();
  const createGate = useCreateGate();
  const updateGate = useUpdateGate();
  const deleteGate = useDeleteGate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminGate | null>(null);
  const [form, setForm] = useState<AdminGateInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

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

    try {
      if (creating) {
        await createGate.mutateAsync({ ...form, id: form.id.trim(), name: form.name.trim() });
      } else if (editing) {
        await updateGate.mutateAsync({
          id: editing.id,
          patch: { name: form.name.trim(), matchId: form.matchId, active: form.active },
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
        description="Each gate admits one fixture. The scanner reads this assignment, so a pass for another match is rejected as the wrong fixture."
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
                  <th className="px-4 py-3 font-semibold">Assigned fixture</th>
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
                      {gate.matchId ? (
                        <>
                          <p className="font-medium text-slate-700">{gate.matchLabel}</p>
                          {gate.kickoffAt ? (
                            <p className="text-[10px] text-slate-400">
                              {formatMatchDate(gate.kickoffAt)} · {formatMatchTime(gate.kickoffAt)}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-amber-600">No fixture assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={gate.active ? "green" : "muted"}>
                        {gate.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {formatMatchDate(gate.updatedAt)}
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
                          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
        description="A gate admits exactly one fixture and records every scan against this code."
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
            <span className="label mb-1.5 block">Assigned fixture</span>
            <select
              value={form.matchId ?? ""}
              onChange={(event) =>
                setForm({ ...form, matchId: event.target.value === "" ? null : event.target.value })
              }
              className="input">
              <option value="">No fixture assigned</option>
              {(matches ?? []).map((match) => (
                <option key={match.id} value={match.id}>
                  {match.opponent} · {formatMatchDate(match.kickoffAt)} ({match.status})
                </option>
              ))}
            </select>
          </label>

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
