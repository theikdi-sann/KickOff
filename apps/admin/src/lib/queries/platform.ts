"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@kickoff/shared";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";

/**
 * The cross-club console's data access (ADR-004 §3) — one module, because
 * every platform write is a guarded RPC (0054) and the call sites must not
 * grow their own spelling of `set_tenant_status`.
 */
export type PlatformTenant =
  Database["public"]["Functions"]["platform_tenants"]["Returns"][number];

export type TenantStatus = "active" | "suspended";

/** The registry: every club, suspended included — restoring one is the job. */
export function usePlatformTenants() {
  return useQuery({
    queryKey: ["platform-tenants"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await createClient().rpc("platform_tenants");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Suspend or restore a club — the database audits the change (0054). */
export function useSetTenantStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantId: string; status: TenantStatus }) => {
      const { error } = await createClient().rpc("set_tenant_status", {
        p_tenant_id: input.tenantId,
        p_status: input.status,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
  });
}

/** The platform fee in basis points (0…10000) — the database audits it. */
export function useSetApplicationFeeBps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantId: string; feeBps: number }) => {
      const { error } = await createClient().rpc("set_application_fee_bps", {
        p_tenant_id: input.tenantId,
        p_fee_bps: input.feeBps,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
  });
}

/** Provision a new club — `provision_tenant` validates every argument. */
export function useProvisionTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; currency: string }) => {
      const { data, error } = await createClient().rpc("provision_tenant", {
        p_name: input.name,
        p_slug: input.slug,
        p_currency: input.currency,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
  });
}

export interface StripeOnboardResult {
  /** The Stripe-hosted link the club's owner completes. */
  url: string;
  stripeAccountId: string;
}

/**
 * Create (or resume) the club's Express account and get its onboarding link.
 * The account is written to the club row by the function, so the registry is
 * refreshed alongside the mutation that opened it.
 */
export function useStripeOnboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantId: string; country: string }) =>
      invokeFunction<StripeOnboardResult>("stripe-onboard", {
        method: "POST",
        body: { tenantId: input.tenantId, country: input.country },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
  });
}
