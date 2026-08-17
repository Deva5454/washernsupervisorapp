import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  demoError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Demo-mode auto sign-in: if set, the app signs itself in as this one fixed
// account on load instead of showing the login form. This is meant for
// showing the app off (single shared account, no per-user distinction) —
// not for real multi-washer/supervisor staff use. Leave both unset in a
// real deployment to require normal per-user sign-in.
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD;
export const DEMO_MODE = !!(DEMO_EMAIL && DEMO_PASSWORD);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoError, setDemoError] = useState<string | null>(null);

  async function loadProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();

      if (!data.session && DEMO_MODE) {
        const { error } = await supabase.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });
        if (error) {
          // Falls back to the normal login screen with this error shown,
          // rather than looping or showing a blank app — most likely cause
          // is the demo account not having been created in Supabase yet.
          setDemoError(`Demo sign-in failed: ${error.message}`);
          setLoading(false);
          return;
        }
        const { data: afterSignIn } = await supabase.auth.getSession();
        setSession(afterSignIn.session);
        if (afterSignIn.session) await loadProfile(afterSignIn.session.user.id);
        setLoading(false);
        return;
      }

      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    }
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, demoError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
