import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  // True only until the initial session has been resolved. Consumers gate on
  // this so a protected route never flashes the login form for a user who is in
  // fact already signed in (Supabase restores the session asynchronously).
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Wraps the app and owns the Supabase auth session.
 *
 * Session persistence is entirely Supabase's job (it stores/refreshes the
 * session itself) — we deliberately keep NO copy in localStorage/sessionStorage
 * (per 3.txt constraint). We only mirror the current session into React state so
 * components re-render on sign in / sign out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Resolve the session Supabase may have already restored from its own
    // storage, so `loading` can flip to false as soon as we know the answer.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Keep state in lockstep with every auth transition (sign in, sign out,
    // token refresh). onAuthStateChange also fires an initial event, but we
    // don't rely on it for the loading flag above.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // signIn / signOut await the call, throw on error, and let the caller surface
  // a human message (rule 11). We do not set state here — onAuthStateChange is
  // the single source of truth, so there is exactly one place session updates.
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
