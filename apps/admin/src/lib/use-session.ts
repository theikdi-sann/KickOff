"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isAdminUser } from "@/lib/auth";

export type SessionStatus = "loading" | "unauthenticated" | "mfa_required" | "authenticated";

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  isAdmin: boolean;
}

/** Session + MFA assurance for client components. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    user: null,
    isAdmin: false,
  });

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const refresh = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      const user = userData.user ?? null;
      if (!user) {
        setState({ status: "unauthenticated", user: null, isAdmin: false });
        return;
      }

      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      const requiresMfa = assurance?.nextLevel === "aal2" && assurance?.currentLevel !== "aal2";

      setState({
        status: requiresMfa ? "mfa_required" : "authenticated",
        user,
        isAdmin: isAdminUser(user),
      });
    };

    void refresh();

    const { data } = supabase.auth.onAuthStateChange(() => {
      // Defer: awaiting Supabase inside this callback can deadlock.
      setTimeout(() => void refresh(), 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** Redirects unauthenticated users to /login and MFA-pending users to /login/mfa. */
export function useSessionGuard(options: { requireAdmin?: boolean } = {}): SessionState {
  const session = useSession();
  const router = useRouter();
  const requireAdmin = options.requireAdmin ?? true;

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace("/login");
    } else if (session.status === "mfa_required") {
      router.replace("/login/mfa");
    } else if (session.status === "authenticated" && requireAdmin && !session.isAdmin) {
      router.replace("/login?error=not-admin");
    }
  }, [session.status, session.isAdmin, requireAdmin, router]);

  return session;
}

/** Signs out, then navigates to /login. */
export function useSignOut(): () => Promise<void> {
  const router = useRouter();
  return useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);
}
