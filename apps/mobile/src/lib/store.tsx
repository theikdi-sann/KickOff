import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  bindClubToSession,
  loadProfile,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  type AppProfile,
  type SignUpResult,
} from './auth';
import { supabase } from './supabase';

interface AppContextValue {
  hydrated: boolean;
  profile: AppProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user) {
        setProfile(await loadProfile(data.user));
        // A session restored from a previous run may predate the club claim
        // (signed in before C9, or bound to a different club's build):
        // bind again — non-blocking, and idempotent on the server.
        void bindClubToSession(data.user);
      }
      if (active) setHydrated(true);
    };

    void hydrate();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer Supabase calls out of the auth callback to avoid deadlocks.
      setTimeout(() => {
        if (!active) return;
        if (!session?.user) {
          setProfile(null);
          return;
        }
        // A fresh sign-in binds the session to this build's club; a token
        // refresh deliberately does not re-bind (the claim it would write is
        // already the one the refresh is carrying).
        if (event === 'SIGNED_IN') void bindClubToSession(session.user);
        void loadProfile(session.user).then((next) => {
          if (active) setProfile(next);
        });
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setProfile(await authSignIn(email, password));
  }, []);

  const signInDemo = useCallback(async () => {
    const email = process.env.EXPO_PUBLIC_DEMO_EMAIL;
    const password = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
    if (!email || !password) {
      throw new Error('Demo sign-in is not configured.');
    }
    setProfile(await authSignIn(email, password));
  }, []);

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    const result = await authSignUp(fullName, email, password);
    // Only a returned session establishes the profile; a pending email
    // confirmation must leave the user signed out to verify via the link.
    if (result.status === 'signed-in') setProfile(result.profile);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setProfile(null);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ hydrated, profile, signIn, signInDemo, signUp, signOut }),
    [hydrated, profile, signIn, signInDemo, signUp, signOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
