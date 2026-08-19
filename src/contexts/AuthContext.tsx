import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { AttendanceRecord, Profile, Role } from "../lib/types";

// No-login mode: there is no sign-in step at all. The app picks whichever
// washer/supervisor profile exists in Supabase and shows that person's
// view — switching between "Car Washer" and "Supervisor" is a plain local
// toggle (persisted in localStorage), not an authentication change. This
// means EVERY visitor with the app's URL sees and can edit that same
// data (Supabase RLS must be opened up to the anon key for this to work
// at all — see supabase_schema.sql). Fine for a small internal
// single-team tool; not appropriate if different washers/supervisors
// need their own private accounts.
//
// A real Supabase Auth user (created in the dashboard) still has to
// exist for each role, because `profiles.id` is a foreign key into
// `auth.users`... actually it isn't anymore (see supabase_no_login_migration.sql)
// — profiles are plain rows now, nothing to sign into.
//
// This context also owns "is the active washer checked in right now,"
// since that has to be known app-wide (not just on the Home screen) to
// drive the GPS-loss auto-logout watcher below.

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  role: Role;
  switchRole: (role: Role) => void;
  signOut: () => Promise<void>;
  todayAttendance: AttendanceRecord | null;
  refreshAttendance: () => Promise<void>;
  gpsLostNotice: string | null;
  dismissGpsLostNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ROLE_KEY = "cleancar_active_role";

function initialRole(): Role {
  const stored = localStorage.getItem(ROLE_KEY);
  return stored === "supervisor" ? "supervisor" : "washer";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [gpsLostNotice, setGpsLostNotice] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

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

  // attendance.washer_id is a generic profile FK despite the column
  // name — both washers and supervisors punch in/out into the same
  // table (per-role separation isn't needed, "who" is already known
  // from the id).
  async function loadAttendance(profileId: string) {
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("washer_id", profileId)
      .eq("date", todayISO())
      .maybeSingle();
    setTodayAttendance((data as AttendanceRecord) ?? null);
  }

  async function refreshAttendance() {
    if (profile) await loadAttendance(profile.id);
  }

  useEffect(() => {
    if (profile) {
      loadAttendance(profile.id);
    } else {
      setTodayAttendance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // GPS-loss auto-logout: while checked in (present/late today, not
  // already logged out by a prior GPS loss), keep watching position. If
  // access is revoked mid-shift, mark the attendance row logged-out and
  // surface a real, visible notice — never a silent logout. Applies to
  // whichever role is currently checked in, washer or supervisor alike.
  useEffect(() => {
    const isCheckedIn =
      profile &&
      todayAttendance &&
      (todayAttendance.status === "present" || todayAttendance.status === "late") &&
      !todayAttendance.gps_lost_at &&
      !todayAttendance.check_out_time;

    function clearWatch() {
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    if (!isCheckedIn || !("geolocation" in navigator)) {
      clearWatch();
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      () => {
        // Position updates aren't otherwise used — this watch exists to
        // detect permission loss via its error callback below.
      },
      async (err) => {
        if (err.code !== err.PERMISSION_DENIED) return; // transient GPS errors aren't a logout
        clearWatch();
        try {
          await supabase
            .from("attendance")
            .update({ gps_lost_at: new Date().toISOString() })
            .eq("id", todayAttendance!.id);
        } catch (e) {
          console.error("Failed to record GPS loss", e);
        }
        setGpsLostNotice(
          "Your location was turned off, so you've been logged out. Turn location back on and check in again."
        );
        if (profile) await loadAttendance(profile.id);
      },
      { enableHighAccuracy: false, maximumAge: 60000 }
    );

    return clearWatch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile?.id,
    todayAttendance?.status,
    todayAttendance?.gps_lost_at,
    todayAttendance?.check_out_time,
  ]);

  function switchRole(next: Role) {
    localStorage.setItem(ROLE_KEY, next);
    setRole(next);
  }

  async function signOut() {
    // Nothing to sign out of in no-login mode — kept so existing "Log
    // Out" buttons elsewhere don't need to change.
  }

  function dismissGpsLostNotice() {
    setGpsLostNotice(null);
  }

  return (
    <AuthContext.Provider
      value={{
        profile,
        loading,
        role,
        switchRole,
        signOut,
        todayAttendance,
        refreshAttendance,
        gpsLostNotice,
        dismissGpsLostNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
