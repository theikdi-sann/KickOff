"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type MatchNotificationKind = "kickoff" | "half_time" | "near_end" | "full_time";

export interface MatchNotification {
  id: string;
  matchId: string;
  kind: MatchNotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface NotificationRow {
  id: string;
  match_id: string;
  kind: MatchNotificationKind;
  title: string;
  body: string;
  created_at: string;
  match_notification_reads: Array<{ user_id: string }> | null;
  matches: { home_score: number | null; away_score: number | null } | null;
}

const RECENT_LIMIT = 20;
const REFRESH_MS = 30_000;

/**
 * The console bell. The clock (0058) writes the rows; this only reads them.
 * `match_notification_reads` is scoped to the caller by RLS, so any returned
 * read row is this admin's.
 */
export function useMatchNotifications(enabled = true) {
  return useQuery({
    queryKey: ["admin-match-notifications"],
    enabled,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<MatchNotification[]> => {
      const { data, error } = await createClient()
        .from("match_notifications")
        .select(
          "id,match_id,kind,title,body,created_at,match_notification_reads(user_id),matches(home_score,away_score)",
        )
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error) throw new Error(error.message);

      return ((data ?? []) as NotificationRow[]).map((row) => ({
        id: row.id,
        matchId: row.match_id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        // A full-time bell is not "handled" by clicking it: it stays unread
        // until the result exists, so the console cannot lose the task.
        read:
          (row.match_notification_reads ?? []).length > 0 &&
          !(row.kind === "full_time" && row.matches?.home_score == null),
      }));
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { data: userData, error: userError } = await createClient().auth.getUser();
      if (userError) throw new Error(userError.message);
      if (!userData.user) throw new Error("Sign in again to read the bell");

      const { error } = await createClient()
        .from("match_notification_reads")
        .upsert(
          { notification_id: notificationId, user_id: userData.user.id },
          { onConflict: "notification_id,user_id", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-match-notifications"] }),
  });
}
