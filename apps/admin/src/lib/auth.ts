"use client";

import type { User } from "@supabase/supabase-js";
import { identify, reset, track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

export function isAdminUser(user: User | null | undefined): boolean {
  const metadata = user?.app_metadata as Record<string, unknown> | undefined;
  return metadata?.role === "admin";
}

export async function signIn(email: string, password: string): Promise<User> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign-in returned no user");
  identify(data.user.id, { email: data.user.email ?? "", role: "admin" });
  track("admin_signed_in");
  return data.user;
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  reset();
}

export async function getSession(): Promise<User | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** Ensures the current session belongs to an admin (throws otherwise). */
export async function requireAdmin(): Promise<User> {
  const user = await getSession();
  if (!user) throw new Error("Not signed in");
  if (!isAdminUser(user)) throw new Error("Admin access required");
  return user;
}

/** True when the account still needs a TOTP challenge (aal1 → aal2). */
export async function needsMfa(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
