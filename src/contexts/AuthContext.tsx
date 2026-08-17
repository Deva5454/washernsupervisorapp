import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { Profile, Role } from "../lib/types";

// No-login mode: there is no sign-in step at all. The app picks whichever
// washer/supervisor profile exists in Supabase and shows that person's
// view — switching between "Car Washer" and "Supervisor" is a plain local
// toggle (persisted in localStorage), not an authentication change. This
// means EVERY visitor with the app's URL sees and can edit that same
// data (Supabase RLS must be opened up to the anon key for this to work
// at all — see supabase_schema_no_auth.sql). Fine for a small internal
// single-team tool; not appropriate if different washers/supervisors
// need their own private accounts.
//
// A real Supabase Auth user (created in the dashboard) still has to
// exist for each role, because `profiles.id` is a foreign key into
// `auth.users` — the app just never asks anyone to sign into it.

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  role: Role;
  switchRole: (role: Role) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ROLE_KEY = "cleancar_active_role";

function initialRole(): Role {
  const stored = localStorage.getItem(ROLE_KEY);
  return stored === "supervisor" ? "supervisor" : "washer";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", role)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setProfile((data as Profile) ?? null);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  function switchRole(newRole: Role) {
    localStorage.setItem(ROLE_KEY, newRole);
    setRole(newRole);
  }

  async function signOut() {
    // Nothing to sign out of in no-login mode — kept so existing "Log
    // Out" buttons elsewhere don't need to change.
  }

  return (
    <AuthContext.Provider value={{ profile, loading, role, switchRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
