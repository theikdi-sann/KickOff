"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "customer" | "admin";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  joinedAt: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
}

function toUser(row: ProfileRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    joinedAt: row.created_at,
  };
}

export function useUsers(role?: UserRole) {
  return useQuery({
    queryKey: ["admin-users", role ?? "all"],
    queryFn: async (): Promise<AdminUser[]> => {
      const supabase = createClient();
      let query = supabase
        .from("profiles")
        .select("id,email,full_name,role,phone,created_at")
        .order("created_at", { ascending: true });
      if (role) query = query.eq("role", role);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return ((data ?? []) as ProfileRow[]).map(toUser);
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; role?: UserRole }): Promise<AdminUser> => {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("admin-users", {
        method: "PATCH",
        body: input,
      });
      if (error) {
        const context = (error as { context?: { error?: { message?: string } } }).context;
        throw new Error(context?.error?.message ?? error.message);
      }
      return data as AdminUser;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
