"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StaffRole } from "@kickoff/shared";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";

/** Built-in codes keep their union; custom codes are strings. */
export type AdminRole = StaffRole | string;

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  /** REQ-26 — a fan is active, suspended or soft-deleted. */
  fanStatus: "active" | "suspended" | "deleted";
  phone: string | null;
  joinedAt: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
}

interface MembershipRow {
  id: string;
  staff_role: string;
}

function toUser(row: ProfileRow, role: string, fanStatus: AdminUser["fanStatus"] = "active"): AdminUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role,
    fanStatus,
    phone: row.phone,
    joinedAt: row.created_at,
  };
}

export function useUsers(role?: string) {
  return useQuery({
    queryKey: ["admin-users", role ?? "all"],
    queryFn: async (): Promise<AdminUser[]> => {
      const supabase = createClient();

      // A person's role is their membership at this club — a profile row
      // belongs to no club of its own, and the legacy `profiles.role` column
      // goes with 0048. Both reads are scoped by RLS to the console's club.
      const [profiles, memberships, fans] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,full_name,phone,created_at")
          .order("created_at", { ascending: true }),
        supabase.from("staff_members").select("id,staff_role"),
        supabase.from("fans").select("id,status"),
      ]);

      if (profiles.error) throw new Error(profiles.error.message);
      if (memberships.error) throw new Error(memberships.error.message);
      // A hosted project that has not applied 0073 yet has no `fans.status`.
      // Keep the page readable (all fans active) until the migration lands;
      // the fan actions themselves still require the updated function.
      let fanRows: Array<{ id: string; status?: AdminUser["fanStatus"] }> = (fans.data ?? []) as Array<{
        id: string;
        status?: AdminUser["fanStatus"];
      }>;
      if (fans.error) {
        const legacy = await supabase.from("fans").select("id");
        if (legacy.error) throw new Error(fans.error.message);
        fanRows = (legacy.data ?? []) as Array<{ id: string }>;
      }

      const roles = new Map(
        ((memberships.data ?? []) as MembershipRow[]).map((membership) => [
          membership.id,
          membership.staff_role,
        ]),
      );
      const statuses = new Map(
        fanRows.map((fan) => [fan.id, fan.status ?? "active"]),
      );

      const users = ((profiles.data ?? []) as ProfileRow[]).map((row) =>
        toUser(row, roles.get(row.id) ?? "customer", statuses.get(row.id) ?? "active"),
      );

      return role ? users.filter((user) => user.role === role) : users;
    },
  });
}

/** The result of a role change — the function also updates the JWT claim. */
export interface AdminUserUpdate extends AdminUser {
  /** True when the new role reaches the user's session only at the next sign-in. */
  roleAppliesAtNextSignIn: boolean;
  /** True when the stored role actually changed. */
  roleChanged: boolean;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      role?: string;
      fanStatus?: AdminUser["fanStatus"];
    }): Promise<AdminUserUpdate> => {
      return invokeFunction<AdminUserUpdate>("admin-users", {
        method: "PATCH",
        body: input,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

/** The initial password the administrator hands to the new staff member. */
export interface CreateStaffInput {
  email: string;
  password: string;
  fullName?: string;
  role: string;
}

export interface CreateStaffResult {
  user: AdminUser;
  roleChanged: boolean;
  roleAppliesAtNextSignIn: boolean;
}

/**
 * RBAC-9 — staff accounts are created by an admin, not promoted from a
 * customer. The function creates the auth user, profile, membership and claim.
 */
export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateStaffInput): Promise<CreateStaffResult> =>
      invokeFunction<CreateStaffResult>("admin-users", {
        method: "POST",
        body: { ...input },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
