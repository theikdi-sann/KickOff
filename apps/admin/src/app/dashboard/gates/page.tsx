"use client";

import { DoorOpen, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GateForm, GATE_FORM_ID } from "@/components/gate-form";
import { Badge, Modal, SectionTitle } from "@/components/ui";
import {
  useCreateGate,
  useDeleteGate,
  useGates,
  useUpdateGate,
  type AdminGate,
  type AdminGateInput,
} from "@/lib/queries/gates";
import { useTenantDisplay } from "@/lib/queries/tenant";
import { formatMatchDate } from "@kickoff/shared";

export default function GatesPage() {
  const display = useTenantDisplay();
  const { data: gates, isLoading, error } = useGates();
  const createGate = useCreateGate();
  const updateGate = useUpdateGate();
  const deleteGate = useDeleteGate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminGate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreate = () => {
    setActionError(null);
    setCreating(true);
  };

  const openEdit = (gate: AdminGate) => {
    setActionError(null);
    setEditing(gate);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = async (input: AdminGateInput) => {
    if (creating) {
      await createGate.mutateAsync(input);
    } else if (editing) {
      await updateGate.mutateAsync({
        id: editing.id,
        patch: {
          name: input.name,
          venueId: input.venueId,
          venueZoneId: input.venueZoneId,
          matchIds: input.matchIds,
          active: input.active,
        },
      });
    }
    close();
  };

  const remove = async (gate: AdminGate) => {
    if (!window.confirm(`Delete ${gate.name} (${gate.id})?`)) return;
    try {
      await deleteGate.mutateAsync(gate.id);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not delete the gate.");
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

      {actionError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
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
            <button
              type="submit"
              form={GATE_FORM_ID}
              disabled={busy}
              className="btn-primary">
              {busy ? "Saving…" : creating ? "Create gate" : "Save changes"}
            </button>
          </>
        }>
        <GateForm
          key={creating ? "new-gate" : (editing?.id ?? "edit-gate")}
          gate={editing}
          onSubmit={save}
        />
      </Modal>
    </div>
  );
}
