"use client";

import { Loader2, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { useUsers, useUpdateUser } from "@/lib/queries/users";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@kickoff/shared";

type Filter = "all" | StaffRole;

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admins" },
  { value: "gatekeeper", label: "Gatekeepers" },
  { value: "customer", label: "Customers" },
];

const COUNT_LABELS: Record<Filter, string> = {
  all: "users",
  admin: "admins",
  gatekeeper: "gatekeepers",
  customer: "customers",
};

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "ADMIN",
  gatekeeper: "GATEKEEPER",
  customer: "CUSTOMER",
};

const ROLE_TONES: Record<StaffRole, "green" | "gold" | "muted"> = {
  admin: "green",
  gatekeeper: "gold",
  customer: "muted",
};

/** The roles an admin may assign — the same vocabulary the database accepts. */
const ASSIGNABLE_ROLES: StaffRole[] = ["customer", "gatekeeper", "admin"];

export default function UsersPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const { data: users, isLoading, error } = useUsers(filter === "all" ? undefined : filter);
  const updateUser = useUpdateUser();

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setCurrentUserId(data.user?.id ?? null);
      });
    return () => {
      active = false;
    };
  }, []);

  const changeRole = async (id: string, role: StaffRole) => {
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await updateUser.mutateAsync({ id, role });
      if (result.roleAppliesAtNextSignIn) {
        setActionNotice(
          role === "admin"
            ? "Role updated. They can sign in to the console now — an open session keeps its old role until it is refreshed."
            : role === "gatekeeper"
              ? "Role updated. A gatekeeper can scan passes and undo their own scans — an open session keeps its old role until it is refreshed."
              : "Role updated. An open session keeps its old access until it is refreshed.",
        );
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not update the user.");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-1 text-pitch">Access control</p>
          <h1 className="display text-4xl leading-none text-slate-900">USERS & ROLES</h1>
          <p className="mt-2 text-sm text-slate-500">
            Promote trusted staff to admins, or give gate staff a gatekeeper account. At least one
            admin always remains.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <Users size={15} />
          {users?.length ?? 0} {COUNT_LABELS[filter]}
        </div>
      </header>

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 font-semibold transition",
              filter === item.value
                ? "bg-pitch text-white"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            )}>
            {item.label}
          </button>
        ))}
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      {actionNotice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {actionNotice}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Loading users…
          </div>
        ) : error ? (
          <div className="px-5 py-10 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : "Could not load users."}
          </div>
        ) : !users || users.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No users in this view.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800">
                        {user.fullName || "Unnamed member"}
                        {isSelf ? <span className="ml-2 text-[10px] text-slate-400">(you)</span> : null}
                      </p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {new Date(user.joinedAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        timeZone: "Asia/Bangkok",
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <select
                        aria-label={`Role for ${user.fullName || user.email}`}
                        value={user.role}
                        disabled={isSelf || updateUser.isPending}
                        onChange={(event) => void changeRole(user.id, event.target.value as StaffRole)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40">
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-pitch" />
        Role changes are written to the audit log and require a service-side check; you cannot change
        your own role.
      </div>
    </div>
  );
}
