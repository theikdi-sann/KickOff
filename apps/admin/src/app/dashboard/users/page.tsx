"use client";

import { Loader2, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { useUsers, useUpdateUser, type UserRole } from "@/lib/queries/users";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Filter = "all" | UserRole;

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admins" },
  { value: "customer", label: "Customers" },
];

export default function UsersPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const changeRole = async (id: string, role: UserRole) => {
    setActionError(null);
    try {
      await updateUser.mutateAsync({ id, role });
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
            Promote trusted staff to admins. At least one admin always remains.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <Users size={15} />
          {users?.length ?? 0} {filter === "all" ? "users" : filter === "admin" ? "admins" : "customers"}
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
                const promoting = user.role === "customer";
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
                      <Badge tone={user.role === "admin" ? "green" : "muted"}>
                        {user.role === "admin" ? "ADMIN" : "CUSTOMER"}
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
                      <button
                        type="button"
                        disabled={isSelf || updateUser.isPending}
                        onClick={() => changeRole(user.id, promoting ? "admin" : "customer")}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                          promoting
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "border-red-200 text-red-600 hover:bg-red-50",
                        )}>
                        {promoting ? <UserPlus size={13} /> : <UserMinus size={13} />}
                        {promoting ? "Promote" : "Demote"}
                      </button>
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
        Role changes are written to the audit log and require a service-side check; you cannot demote
        your own account.
      </div>
    </div>
  );
}
