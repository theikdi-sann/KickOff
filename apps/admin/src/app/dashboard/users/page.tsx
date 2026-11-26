"use client";

import { Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { useCreateStaff, useUsers, useUpdateUser } from "@/lib/queries/users";
import { createClient } from "@/lib/supabase/client";
import { canEditRole, createStaffRoles, fanStatusLabel, roleDisplayName } from "@/lib/staff";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@kickoff/shared";
import { useRoles } from "@/lib/queries/roles";

type Filter = "all" | StaffRole | string;

const ROLE_TONES: Record<string, "green" | "gold" | "muted"> = {
  admin: "green",
  gatekeeper: "gold",
  customer: "muted",
};

function roleTone(role: string): "green" | "gold" | "muted" {
  return ROLE_TONES[role] ?? "gold";
}

function roleLabel(role: string, roles: Array<{ code: string; name: string }>): string {
  return roleDisplayName(role, roles);
}

export default function UsersPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const { data: users, isLoading, error } = useUsers(filter === "all" ? undefined : filter);
  const updateUser = useUpdateUser();
  const createStaff = useCreateStaff();
  const { data: roles } = useRoles();
  const roleList = roles ?? [];
  const roleChoices = createStaffRoles(roleList);
  const createRoles = createStaffRoles(roleList);
  const filterOptions = [{ value: "all", label: "All" }, { value: "customer", label: "Fans" }, ...roleList.map((role) => ({ value: role.code, label: role.name }))];

  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("");

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

  const changeRole = async (id: string, role: string) => {
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await updateUser.mutateAsync({ id, role });
      if (result.roleAppliesAtNextSignIn) {
        setActionNotice(
          "Role updated. An open session keeps the old permissions until its token is refreshed.",
        );
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not update the user.");
    }
  };

  const changeFanStatus = async (
    user: { id: string; fullName: string; email: string; fanStatus: "active" | "suspended" | "deleted" },
    status: "active" | "suspended" | "deleted",
  ) => {
    const name = user.fullName || user.email;
    const question =
      status === "deleted"
        ? `Soft-delete ${name}? They cannot sign in; the row stays for audit.`
        : status === "suspended"
          ? `Suspend ${name}? They cannot sign in until restored.`
          : `Restore ${name}? They can sign in again.`;
    if (!window.confirm(question)) return;
    setActionError(null);
    setActionNotice(null);
    try {
      await updateUser.mutateAsync({ id: user.id, fanStatus: status });
      setActionNotice(
        status === "deleted"
          ? `${name} was soft-deleted.`
          : status === "suspended"
            ? `${name} is suspended.`
            : `${name} is active again.`,
      );
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not update the fan.");
    }
  };

  const removeStaffAccess = async (id: string, name: string) => {    if (!window.confirm(`Remove staff access for ${name}? They become a fan and lose the console.`)) {
      return;
    }
    setActionError(null);
    setActionNotice(null);
    try {
      await updateUser.mutateAsync({ id, role: "customer" });
      setActionNotice(`${name} is now a fan. Their staff access was removed.`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not remove staff access.");
    }
  };

  const createAccount = async () => {    setActionError(null);
    setActionNotice(null);
    const role = createRole || createRoles[0]?.code;
    if (!role) {
      setActionError("Create a staff role first, then create the account.");
      return;
    }
    try {
      await createStaff.mutateAsync({
        email: createEmail,
        password: createPassword,
        fullName: createName || undefined,
        role,
      });
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      setCreateRole("");
      setShowCreate(false);
      setActionNotice(
        "Staff account created. Share the initial password with the staff member; they can change it from Security after signing in.",
      );
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not create the account.");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-1 text-pitch">Access control</p>
          <h1 className="display text-4xl leading-none text-slate-900">USERS & ROLES</h1>
          <p className="mt-2 text-sm text-slate-500">
            Create staff accounts with an initial password. Customer accounts cannot be promoted —
            create a staff account instead.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary h-10 px-3 text-xs"
            onClick={() => setShowCreate((current) => !current)}>
            <UserPlus size={15} />
            Create staff
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Users size={15} />
            {users?.length ?? 0} {filter === "all" ? "users" : filter === "customer" ? "fans" : `${filter}s`}
          </div>
        </div>
      </header>

      {showCreate ? (
        <section className="panel space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Create a staff account</h2>
            <p className="mt-1 text-xs text-slate-500">
              The staff member signs in with this e-mail and initial password, then changes the
              password from Security.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">
              Full name
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Nok Gatekeeper"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Staff email
              <input
                type="email"
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="staff@club.test"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Initial password
              <input
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Initial role
              <select
                value={createRole || createRoles[0]?.code || ""}
                onChange={(event) => setCreateRole(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {createRoles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary h-9 px-3 text-xs"
              disabled={createStaff.isPending}
              onClick={() => void createAccount()}>
              {createStaff.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Create account
            </button>
            <button
              type="button"
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600"
              onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs">
        {filterOptions.map((item) => (
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
                      <Badge tone={roleTone(user.role)}>
                        {user.role === "customer"
                          ? fanStatusLabel(user.fanStatus)
                          : roleLabel(user.role, roleList)}
                      </Badge>
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
                      {canEditRole(user.role) ? (
                        <div className="flex items-center justify-end gap-2">
                          <select
                            aria-label={`Role for ${user.fullName || user.email}`}
                            value={user.role}
                            disabled={isSelf || updateUser.isPending}
                            onChange={(event) => void changeRole(user.id, event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40">
                            {roleChoices.map((role) => (
                              <option key={role.code} value={role.code}>
                                {role.name.toUpperCase()}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isSelf || updateUser.isPending}
                            onClick={() => void removeStaffAccess(user.id, user.fullName || user.email)}
                            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition disabled:cursor-not-allowed disabled:opacity-40">
                            Remove staff
                          </button>
                        </div>
                      ) : user.fanStatus === "deleted" ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Deleted
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={updateUser.isPending}
                            onClick={() => void changeFanStatus(user, user.fanStatus === "suspended" ? "active" : "suspended")}
                            className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 transition disabled:cursor-not-allowed disabled:opacity-40">
                            {user.fanStatus === "suspended" ? "Restore" : "Suspend"}
                          </button>
                          <button
                            type="button"
                            disabled={updateUser.isPending}
                            onClick={() => void changeFanStatus(user, "deleted")}
                            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition disabled:cursor-not-allowed disabled:opacity-40">
                            Soft delete
                          </button>
                        </div>
                      )}
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
        Suspended fans cannot sign in until restored; soft-deleted fans keep their audit row but
        cannot sign in. Role changes are written to the audit log; you cannot change your own role.
      </div>
    </div>
  );
}
