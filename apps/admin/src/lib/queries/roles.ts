"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/functions";

export const CAPABILITIES = [
  "manage_staff",
  "operate_gate",
  "manage_matches",
  "manage_venues",
  "publish_news",
  "refund_orders",
  "read_audit",
  "manage_settings",
  "export_data",
  "view_reports",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface RoleDto {
  code: string;
  name: string;
  isSystem: boolean;
  active: boolean;
  sortOrder: number;
  capabilities: Capability[];
}

export interface RoleInput {
  code: string;
  name: string;
  capabilities: Capability[];
  active?: boolean;
}

export function useRoles() {
  return useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () =>
      (await invokeFunction<{ roles: RoleDto[] }>("admin-roles", { method: "GET" })).roles,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleInput) =>
      invokeFunction<{ roles: RoleDto[] }>("admin-roles", { method: "POST", body: { ...input } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleInput) =>
      invokeFunction<{ roles: RoleDto[] }>("admin-roles", { method: "PATCH", body: { ...input } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      invokeFunction<{ roles: RoleDto[] }>("admin-roles", { method: "DELETE", body: { code } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
}
