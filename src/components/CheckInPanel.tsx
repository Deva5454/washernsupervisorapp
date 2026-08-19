import { useRef, useState } from "react";
import { Camera, Check, MapPin } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { uploadPhoto } from "../lib/uploadPhoto";

/**
 * Punch in / punch out, shared by both Washer Home and Supervisor
 * Dashboard — same real selfie + GPS verification for either role.
 * Reads/writes the shared todayAttendance from AuthContext so the
 * GPS-loss auto-logout watcher there stays in sync regardless of which
 * screen is open.
 */
export function CheckInPanel() {
  const { profile, todayAttendance, refreshAttendance } = useAuth();

  const [checkingInOpen, setCheckingInOpen] = useState(false);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLocating, setGpsLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  function openCheckIn() {
    setCheckingInOpen(true);
    setSelfieFile(null);
    setSelfiePreview(null);
    setGps(null);
    setGpsError(null);
    setError(null);
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
      // Upsert, not insert: attendance has one row per person per day, so
      // re-checking in later the same day (e.g. after a GPS-loss
      // auto-logout) updates that same row rather than violating the
      // unique constraint. gps_lost_at/check_out_time are explicitly
      // cleared here — this check-in starts a fresh shift.
      const { error } = await supabase.from("attendance").upsert(
        {
          washer_id: profile.id,
          date: today,
          status: "present",
          check_in_time: new Date().toISOString(),
          check_out_time: null,
          selfie_url: selfieUrl,
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          gps_lost_at: null,
          gps_unlock_approved_at: null,
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

  async function checkOut() {
    if (!profile || !todayAttendance) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("attendance")
        .update({ check_out_time: new Date().toISOString() })
        .eq("id", todayAttendance.id);
      if (error) throw error;
      await refreshAttendance();
    } catch (err) {
      console.error(err);
      setError("Check-out failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isCheckedIn =
    (todayAttendance?.status === "present" || todayAttendance?.status === "late") &&
    !todayAttendance?.gps_lost_at &&
    !todayAttendance?.check_out_time;
  const isCheckedOut = !!todayAttendance?.check_out_time;
  // A GPS-loss auto-logout stays locked (no self-service re-check-in)
  // until a supervisor unlocks it — a scaled-down version of the ERP's
  // City-Manager GPS-violation approval flow.
  const isLocked = !!todayAttendance?.gps_lost_at && !todayAttendance?.gps_unlock_approved_at;
  const canConfirm = !!selfieFile && !!gps && !submitting;

  return (
    <div className="rounded-2xl bg-gray-100 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isCheckedIn ? "bg-green-500" : isLocked ? "bg-red-500" : "bg-gray-400"
            }`}
          />
          <span className="font-bold text-gray-900">
            {isCheckedIn
              ? "Checked in"
              : isLocked
              ? "Locked — GPS was turned off"
              : isCheckedOut
              ? `Checked out at ${new Date(todayAttendance!.check_out_time!).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Not checked in"}
          </span>
        </div>
        {!isCheckedIn && !isCheckedOut && !isLocked && !checkingInOpen && (
          <button
            onClick={openCheckIn}
            className="rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 shrink-0"
          >
            Check In
          </button>
        )}
        {isCheckedIn && (
          <button
            onClick={checkOut}
            disabled={submitting}
            className="rounded-full border border-gray-300 disabled:opacity-50 text-gray-900 text-sm font-bold px-4 py-2 shrink-0"
          >
            {submitting ? "Checking out…" : "Check Out"}
          </button>
        )}
      </div>

      {isLocked && (
        <p className="text-sm text-red-600 mt-2">
          Ask your supervisor to unlock check-in before you can check in again.
        </p>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

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
            {!gpsLocating && gpsError && <span className="text-red-600 font-medium">{gpsError}</span>}
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
  );
}
