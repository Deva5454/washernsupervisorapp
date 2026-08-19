import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Package, MessageSquare, Camera, Check, MapPin } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { uploadPhoto } from "../../lib/uploadPhoto";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Home() {
  const { profile, todayAttendance, refreshAttendance } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [doneJobs, setDoneJobs] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);

  // Check-in verification flow state
  const [checkingInOpen, setCheckingInOpen] = useState(false);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLocating, setGpsLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const [jobsRes, payoutsRes] = await Promise.all([
          supabase.from("jobs").select("status").eq("washer_id", profile!.id).eq("job_date", today),
          supabase
            .from("payouts")
            .select("amount")
            .eq("washer_id", profile!.id)
            .gte("payout_date", weekAgo)
            .lte("payout_date", today),
        ]);

        if (jobsRes.error) throw jobsRes.error;
        if (payoutsRes.error) throw payoutsRes.error;
        if (cancelled) return;

        const jobs = jobsRes.data ?? [];
        setTotalJobs(jobs.length);
        setDoneJobs(jobs.filter((j) => j.status === "done").length);
        const sum = (payoutsRes.data ?? []).reduce((acc, p) => acc + Number(p.amount), 0);
        setWeekTotal(sum);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load your dashboard. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  function openCheckIn() {
    setCheckingInOpen(true);
    setSelfieFile(null);
    setSelfiePreview(null);
    setGps(null);
    setGpsError(null);
    requestGps();
  }

  function requestGps() {
    if (!("geolocation" in navigator)) {
      setGpsError("This browser doesn't support location — can't verify check-in.");
      return;
    }
    setGpsLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLocating(false);
      },
      (err) => {
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — turn on location access and try again."
            : "Could not get your location. Try again."
        );
        setGpsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function onSelfieSelected(file: File) {
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
  }

  async function confirmCheckIn() {
    if (!profile || !selfieFile || !gps) return;
    setSubmitting(true);
    setError(null);
    try {
      const selfieUrl = await uploadPhoto(selfieFile, `attendance/${profile.id}`);
      const today = new Date().toISOString().slice(0, 10);
      // Upsert, not insert: attendance has one row per washer per day, so
      // re-checking in later the same day (e.g. after a GPS-loss
      // auto-logout) updates that same row rather than violating the
      // unique constraint. gps_lost_at is explicitly cleared here — this
      // check-in is exactly what un-logs-them-out.
      const { error } = await supabase.from("attendance").upsert(
        {
          washer_id: profile.id,
          date: today,
          status: "present",
          check_in_time: new Date().toISOString(),
          selfie_url: selfieUrl,
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          gps_lost_at: null,
        },
        { onConflict: "washer_id,date" }
      );
      if (error) throw error;
      await refreshAttendance();
      setCheckingInOpen(false);
    } catch (err) {
      console.error(err);
      setError("Check-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!profile) return null;

  if (loading) {
    return <div className="px-4 pt-6 text-center text-gray-400">Loading…</div>;
  }

  const isCheckedIn =
    (todayAttendance?.status === "present" || todayAttendance?.status === "late") &&
    !todayAttendance?.gps_lost_at;
  const canConfirm = !!selfieFile && !!gps && !submitting;

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-lg">
            {initialsOf(profile.full_name)}
          </div>
        )}
        <div>
          <p className="text-gray-500">{getGreeting()}</p>
          <h1 className="text-2xl font-extrabold text-gray-900">{profile.full_name}</h1>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>
      )}

      <div className="rounded-2xl bg-gray-100 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isCheckedIn ? "bg-green-500" : "bg-gray-400"}`} />
            <span className="font-bold text-gray-900">
              {isCheckedIn ? "Checked in" : "Not checked in"}
            </span>
          </div>
          {!isCheckedIn && !checkingInOpen && (
            <button
              onClick={openCheckIn}
              className="rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 shrink-0"
            >
              Check In
            </button>
          )}
        </div>

        {/* Check-in verification: real selfie + real GPS, required before
            the attendance record is written. */}
        {checkingInOpen && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => selfieInputRef.current?.click()}
                className="h-16 w-16 rounded-2xl border-2 border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden shrink-0 relative"
              >
                {selfiePreview ? (
                  <>
                    <img src={selfiePreview} alt="Selfie" className="absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  </>
                ) : (
                  <Camera className="h-5 w-5 text-gray-400" />
                )}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Selfie in uniform</p>
                <p className="text-xs text-gray-500">{selfieFile ? "Captured" : "Tap to take a photo"}</p>
              </div>
              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onSelfieSelected(file);
                }}
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <MapPin className={`h-4 w-4 ${gps ? "text-blue-600" : "text-gray-400"}`} />
              {gpsLocating && <span className="text-gray-500">Getting your location…</span>}
              {!gpsLocating && gps && <span className="text-blue-600 font-medium">Location confirmed</span>}
              {!gpsLocating && gpsError && (
                <span className="text-red-600 font-medium">{gpsError}</span>
              )}
              {!gpsLocating && gpsError && (
                <button onClick={requestGps} className="text-blue-600 font-bold underline ml-1">
                  Retry
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCheckingInOpen(false)}
                className="flex-1 rounded-xl border border-gray-300 text-gray-700 font-bold py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={confirmCheckIn}
                disabled={!canConfirm}
                className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-2.5"
              >
                {submitting ? "Checking in…" : "Confirm Check-In"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 text-white px-5 py-6">
        <p className="text-xs font-bold tracking-widest text-blue-400 uppercase">Today</p>
        <p className="text-3xl font-extrabold mt-1">
          {doneJobs} of {totalJobs} washes done
        </p>
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-sm text-white/60">Last 7 days earnings</span>
          <span className="text-lg font-bold">₹{weekTotal.toLocaleString("en-IN")}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link
          to="/washer/jobs"
          className="rounded-2xl border border-gray-200 bg-white py-5 flex flex-col items-center gap-2"
        >
          <CalendarDays className="w-5 h-5 text-gray-700" />
          <span className="text-sm font-bold text-gray-900">Jobs</span>
        </Link>
        <Link
          to="/washer/stock"
          className="rounded-2xl border border-gray-200 bg-white py-5 flex flex-col items-center gap-2"
        >
          <Package className="w-5 h-5 text-gray-700" />
          <span className="text-sm font-bold text-gray-900">Stock</span>
        </Link>
        <Link
          to="/washer/more"
          className="rounded-2xl border border-gray-200 bg-white py-5 flex flex-col items-center gap-2"
        >
          <MessageSquare className="w-5 h-5 text-gray-700" />
          <span className="text-sm font-bold text-gray-900">Requests</span>
        </Link>
      </div>
    </div>
  );
}
