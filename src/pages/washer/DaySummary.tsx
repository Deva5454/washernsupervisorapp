import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { DAILY_UNIT_TARGET, formatUnits, weightedUnits } from "../../lib/incentive";
import { localDateISO } from "../../lib/date";
import type { AttendanceStatus, Job, Payout } from "../../lib/types";

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  week_off: "Week Off",
};

export default function DaySummary() {
  const { profile, todayAttendance } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const today = localDateISO();
      const [jobsRes, payoutsRes] = await Promise.all([
        supabase.from("jobs").select("*").eq("washer_id", profile.id).eq("job_date", today),
        supabase.from("payouts").select("*").eq("washer_id", profile.id).eq("payout_date", today),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (payoutsRes.error) throw payoutsRes.error;
      setJobs((jobsRes.data ?? []) as Job[]);
      setPayouts((payoutsRes.data ?? []) as Payout[]);
    } catch (err) {
      console.error(err);
      setError("Could not load today's summary.");
    } finally {
      setLoading(false);
    }
  }

  if (!profile) return null;

  if (loading) {
    return <div className="text-center text-gray-400">Loading…</div>;
  }

  const doneJobs = jobs.filter((j) => j.status === "done");
  const units = weightedUnits(doneJobs);

  return (
    <div className="pb-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/washer")} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-extrabold text-gray-900">Today's Summary</h1>
      </div>

      {error && <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-3xl bg-gradient-to-br from-navy to-brand text-white px-5 py-6 shadow-lg shadow-brand/20">
        <p className="text-xs font-bold tracking-widest text-blue-400 uppercase">Jobs</p>
        <p className="text-3xl font-extrabold mt-1">
          {doneJobs.length} of {jobs.length} washes done
        </p>
        <p className="text-sm text-white/60 mt-1">
          {formatUnits(units)} / {DAILY_UNIT_TARGET} daily quota units
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full"
            style={{ width: `${Math.min(100, (units / DAILY_UNIT_TARGET) * 100)}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-gray-100 px-4 py-4">
        <p className="font-bold text-gray-900 mb-2">Attendance</p>
        {todayAttendance ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-bold text-gray-900">{ATTENDANCE_LABEL[todayAttendance.status]}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Check-in</span>
              <span className="font-bold text-gray-900">
                {todayAttendance.check_in_time
                  ? new Date(todayAttendance.check_in_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Check-out</span>
              <span className="font-bold text-gray-900">
                {todayAttendance.check_out_time
                  ? new Date(todayAttendance.check_out_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Not checked in today.</p>
        )}
      </div>

      <div className="rounded-2xl bg-gray-100 px-4 py-4">
        <p className="font-bold text-gray-900 mb-2">Today's Payouts</p>
        {payouts.length === 0 ? (
          <p className="text-sm text-gray-400">No payout entries for today yet.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{p.label}</span>
                <span className="font-bold text-gray-900">₹{Number(p.amount).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
