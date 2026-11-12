"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CLUB_NAME,
  CLUB_TIMEZONE,
  CURRENCY,
  GATE_UNDO_SECONDS,
  KICKOFF_LOCK_MINUTES,
  MAX_SEATS_PER_ORDER,
  QR_VERSION,
  SEAT_HOLD_TTL_SECONDS,
  type Database,
  type Json,
} from "@kickoff/shared";
import { createClient } from "@/lib/supabase/client";

type SettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];
type SettingsInsert = Database["public"]["Tables"]["app_settings"]["Insert"];

export interface ClubSettings {
  clubName: string;
  clubTimezone: string;
  currency: string;
  maxSeatsPerOrder: number;
  seatHoldTtlSeconds: number;
  kickoffLockMinutes: number;
  gateUndoSeconds: number;
  notificationsEnabled: boolean;
  qrKeyVersion: string;
  updatedAt: string | null;
}

export interface SettingsPatch {
  clubName?: string;
  clubTimezone?: string;
  maxSeatsPerOrder?: number;
  seatHoldTtlSeconds?: number;
  kickoffLockMinutes?: number;
  gateUndoSeconds?: number;
  notificationsEnabled?: boolean;
  qrKeyVersion?: string;
}

/**
 * Fallbacks used when a setting row is missing. The values come from
 * `@kickoff/shared` so the TypeScript defaults and the SQL defaults in
 * `supabase/migrations` cannot drift apart (the hygiene contract asserts it).
 */
const DEFAULTS: Omit<ClubSettings, "updatedAt"> = {
  clubName: CLUB_NAME,
  clubTimezone: CLUB_TIMEZONE,
  currency: CURRENCY,
  maxSeatsPerOrder: MAX_SEATS_PER_ORDER,
  seatHoldTtlSeconds: SEAT_HOLD_TTL_SECONDS,
  kickoffLockMinutes: KICKOFF_LOCK_MINUTES,
  gateUndoSeconds: GATE_UNDO_SECONDS,
  notificationsEnabled: true,
  qrKeyVersion: `v${QR_VERSION}`,
};

function valueFor(rows: SettingsRow[], key: string): Json | undefined {
  return rows.find((row) => row.key === key)?.value;
}

function asString(value: Json | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: Json | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: Json | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mapSettings(rows: SettingsRow[]): ClubSettings {
  const updatedAt =
    rows
      .map((row) => row.updated_at)
      .sort()
      .at(-1) ?? null;

  return {
    clubName: asString(valueFor(rows, "club_name"), DEFAULTS.clubName),
    clubTimezone: asString(valueFor(rows, "club_timezone"), DEFAULTS.clubTimezone),
    currency: asString(valueFor(rows, "currency"), DEFAULTS.currency),
    maxSeatsPerOrder: asNumber(
      valueFor(rows, "max_seats_per_order"),
      DEFAULTS.maxSeatsPerOrder,
    ),
    seatHoldTtlSeconds: asNumber(
      valueFor(rows, "seat_hold_ttl_seconds"),
      DEFAULTS.seatHoldTtlSeconds,
    ),
    kickoffLockMinutes: asNumber(
      valueFor(rows, "kickoff_lock_minutes"),
      DEFAULTS.kickoffLockMinutes,
    ),
    gateUndoSeconds: asNumber(valueFor(rows, "gate_undo_seconds"), DEFAULTS.gateUndoSeconds),
    notificationsEnabled: asBoolean(
      valueFor(rows, "notifications_enabled"),
      DEFAULTS.notificationsEnabled,
    ),
    qrKeyVersion: asString(valueFor(rows, "qr_key_version"), DEFAULTS.qrKeyVersion),
    updatedAt,
  };
}

function pushValue(
  rows: SettingsInsert[],
  key: string,
  value: NonNullable<Json> | undefined,
): void {
  if (value !== undefined) rows.push({ key, value });
}

export function useSettings() {
  return useQuery({
    queryKey: ["admin-settings"],
    queryFn: async (): Promise<ClubSettings> => {
      const { data, error } = await createClient()
        .from("app_settings")
        .select("key,value,updated_at,updated_by")
        .order("key");
      if (error) throw new Error(error.message);
      return mapSettings((data ?? []) as SettingsRow[]);
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SettingsPatch) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const updatedBy = userData.user?.id ?? null;

      const rows: SettingsInsert[] = [];
      pushValue(rows, "club_name", input.clubName);
      pushValue(rows, "club_timezone", input.clubTimezone);
      pushValue(rows, "max_seats_per_order", input.maxSeatsPerOrder);
      pushValue(rows, "seat_hold_ttl_seconds", input.seatHoldTtlSeconds);
      pushValue(rows, "kickoff_lock_minutes", input.kickoffLockMinutes);
      pushValue(rows, "gate_undo_seconds", input.gateUndoSeconds);
      pushValue(rows, "notifications_enabled", input.notificationsEnabled);
      pushValue(rows, "qr_key_version", input.qrKeyVersion);

      if (rows.length === 0) return;

      const { error } = await supabase
        .from("app_settings")
        .upsert(
          rows.map((row) => ({ ...row, updated_by: updatedBy })),
          { onConflict: "key" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
  });
}
