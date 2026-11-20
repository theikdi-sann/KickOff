"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, SectionTitle, useToast } from "@/components/ui";
import {
  CAPABILITIES,
  useCreateRole,
  useDeleteRole,
  useRoles,
  useUpdateRole,
  type Capability,
  type RoleInput,
} from "@/lib/queries/roles";

const empty: RoleInput = { code: "", name: "", capabilities: [], active: true };

export default function RolesPage() {
  const { data: roles, isLoading, error } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const { toast } = useToast();
  const [draft, setDraft] = useState<RoleInput>(empty);
  const [editing, setEditing] = useState<string | null>(null);

  const save = async () => {
    try {
      if (editing) await updateRole.mutateAsync({ ...draft, code: editing });
      else await createRole.mutateAsync(draft);
      setDraft(empty);
      setEditing(null);
      toast({ title: editing ? "Role updated" : "Role created", tone: "green" });
    } catch (caught) {
      toast({
        title: "Could not save the role",
        description: caught instanceof Error ? caught.message : "Try again.",
        tone: "red",
      });
    }
  };

  const remove = async (code: string) => {
    try {
      await deleteRole.mutateAsync(code);
      toast({ title: "Role deleted", description: code, tone: "amber" });
    } catch (caught) {
      toast({
        title: "Could not delete the role",
        description: caught instanceof Error ? caught.message : "Deactivate it instead.",
        tone: "red",
      });
    }
  };

  const toggle = (capability: Capability) =>
    setDraft((current) => ({
      ...current,
      capabilities: current.capabilities.includes(capability)
        ? current.capabilities.filter((entry) => entry !== capability)
        : [...current.capabilities, capability],
    }));

  return (
    <div>
      <SectionTitle
        eyebrow="Access"
        title="Staff roles"
        description="Define club roles as capability sets. Built-in admin and gatekeeper are immutable."
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading roles…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error.message}</p>
          ) : (
            <div className="space-y-2">
              {(roles ?? []).map((role) => (
                <div
                  key={role.code}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{role.name}</span>
                      <Badge tone={role.active ? "green" : "muted"}>
                        {role.active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                      {role.isSystem ? <Badge tone="gold">BUILT-IN</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{role.capabilities.join(" · ")}</p>
                  </div>
                  {!role.isSystem ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditing(role.code);
                          setDraft({
                            code: role.code,
                            name: role.name,
                            capabilities: role.capabilities,
                            active: role.active,
                          });
                        }}>
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${role.name}`}
                        className="btn-danger"
                        onClick={() => void remove(role.code)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {editing ? `Edit ${editing}` : "New role"}
          </h3>
          <label className="block text-xs text-slate-500">
            Code
            <input
              value={draft.code}
              disabled={Boolean(editing)}
              onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              placeholder="box_office"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Display name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Box Office"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {CAPABILITIES.map((capability) => (
              <label key={capability} className="flex items-center gap-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.capabilities.includes(capability)}
                  onChange={() => toggle(capability)}
                />
                {capability.replaceAll("_", " ")}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={createRole.isPending || updateRole.isPending}
            onClick={() => void save()}>
            {editing ? <Save size={15} /> : <Plus size={15} />}
            {editing ? "Save role" : "Create role"}
          </button>
        </div>
      </div>
    </div>
  );
}
