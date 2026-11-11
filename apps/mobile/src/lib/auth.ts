import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AppProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'customer' | 'admin';
  phone?: string;
  initials: string;
  joinedAt: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: 'customer' | 'admin';
  phone: string | null;
  created_at: string;
}

export function initialsFor(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || 'KO'
  );
}

export function profileFromUser(user: User, row?: ProfileRow | null): AppProfile {
  const metadataName = user.user_metadata?.full_name;
  const fullName =
    row?.full_name ||
    (typeof metadataName === 'string' ? metadataName : '') ||
    user.email?.split('@')[0] ||
    'KickOff fan';
  const email = row?.email || user.email || '';

  return {
    id: user.id,
    email,
    fullName,
    role: row?.role ?? ((user.app_metadata as Record<string, unknown>)?.role === 'admin' ? 'admin' : 'customer'),
    phone: row?.phone ?? undefined,
    initials: initialsFor(fullName),
    joinedAt: row?.created_at ?? user.created_at,
  };
}

/** Loads the signed-in user's profile row (RLS: own row only). */
export async function loadProfile(user: User): Promise<AppProfile> {
  const { data } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,phone,created_at')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>();
  return profileFromUser(user, data);
}

export async function signIn(email: string, password: string): Promise<AppProfile> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Sign-in returned no user');
  return loadProfile(data.user);
}

/** Result of a sign-up attempt — never a silent dead-end. */
export type SignUpResult =
  | { status: 'signed-in'; profile: AppProfile }
  | { status: 'confirmation-required'; email: string };

export async function signUp(
  fullName: string,
  email: string,
  password: string,
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      // The confirmation email must open the app, not a browser pointed at
      // localhost. Hosted and local both allow-list this target.
      emailRedirectTo: 'kickoff://auth/callback',
    },
  });
  if (error) throw new Error(error.message);

  // Email confirmation enabled → no session yet: the caller shows the
  // link-only "check your email" screen. Never attempt a password sign-in
  // here — "Email not confirmed" would dead-end an account that was just
  // created successfully. Confirmation disabled (local/dev) → session is
  // returned → auto-login as before.
  if (!data.session) {
    return { status: 'confirmation-required', email: email.trim() };
  }
  if (!data.user) throw new Error('Sign-up returned no user');
  return { status: 'signed-in', profile: await loadProfile(data.user) };
}

/** Resends the signup confirmation link (link-only flow). */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: 'kickoff://auth/callback' },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/** Clears the local session without waiting on a network round-trip. */
export async function resetLocalSession(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'kickoff://reset-password',
  });
  if (error) throw new Error(error.message);
}

/**
 * Applies an emailed-link session (confirmation or recovery) to the client.
 * Shared by the reset-password and auth/callback deep-link routes.
 */
export async function applyLinkSession(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function updateProfile(input: {
  fullName?: string;
  phone?: string | null;
}): Promise<AppProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const patch: { full_name?: string; phone?: string | null } = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userData.user.id)
    .select('id,email,full_name,role,phone,created_at')
    .single<ProfileRow>();
  if (error) throw new Error(error.message);
  return profileFromUser(userData.user, data);
}
