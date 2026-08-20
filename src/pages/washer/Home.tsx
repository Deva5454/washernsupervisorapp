import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, FileText, Package, MessageSquare } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { CheckInPanel } from "../../components/CheckInPanel";
import { DAILY_UNIT_TARGET, formatUnits, weightedUnits } from "../../lib/incentive";
import { localDateISO } from "../../lib/date";

const EARNING_WINDOW_MS = 4 * 60 * 60 * 1000;

// Purely informational — nothing else in this app currently gates on
// time-bands, so this only ever displays a status, it never blocks or
// hides functionality based on the window being open or closed.
function EarningWindowBanner({ checkInTime }: { checkInTime: string }) {
  const closesAt = new Date(new Date(checkInTime).getTime() + EARNING_WINDOW_MS);
  const closed = Date.now() >= closesAt.getTime();
  return (
    <div
      className={`rounded-2xl px-4 py-3 flex items-center gap-2 ${
        closed ? "bg-gray-100" : "bg-blue-50"
      }`}
    >
      <Clock className={`h-4 w-4 shrink-0 ${closed ? "text-gray-400" : "text-blue-600"}`} />
      <p className={`text-sm font-medium ${closed ? "text-gray-500" : "text-blue-700"}`}>
        {closed
          ? "Earning window closed for today"
          : `Earning window closes at ${closesAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
      </p>
    </div>
  );
}

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
  const { profile, todayAttendance } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [doneJobs, setDoneJobs] = useState(0);
  const [unitsToday, setUnitsToday] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const today = localDateISO();
        const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const [jobsRes, payoutsRes] = await Promise.all([
          supabase
            .from("jobs")
            .select("status, vehicle_type")
            .eq("washer_id", profile!.id)
            .eq("job_date", today),
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
        const done = jobs.filter((j) => j.status === "done");
        setDoneJobs(done.length);
        setUnitsToday(weightedUnits(done));
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

  if (!profile) return null;

  if (loading) {
    return <div className="text-center text-gray-400">Loading…</div>;
  }

  return (
    <div className="pb-4 space-y-4">
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

      <CheckInPanel />

      {todayAttendance?.check_in_time && <EarningWindowBanner checkInTime={todayAttendance.check_in_time} />}

      <div className="rounded-3xl bg-gradient-to-br from-navy to-brand text-white px-5 py-6 shadow-lg shadow-brand/20">
        <p className="text-xs font-bold tracking-widest text-blue-400 uppercase">Today</p>
        <p className="text-3xl font-extrabold mt-1">
          {doneJobs} of {totalJobs} washes done
        </p>
        <p className="text-sm text-white/60 mt-1">
          {formatUnits(unitsToday)} / {DAILY_UNIT_TARGET} daily quota units
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full"
            style={{ width: `${Math.min(100, (unitsToday / DAILY_UNIT_TARGET) * 100)}%` }}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-sm text-white/60">Last 7 days earnings</span>
          <span className="text-lg font-bold">₹{weekTotal.toLocaleString("en-IN")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        <Link
          to="/washer/day-summary"
          className="rounded-2xl border border-gray-200 bg-white py-5 flex flex-col items-center gap-2"
        >
          <FileText className="w-5 h-5 text-gray-700" />
          <span className="text-sm font-bold text-gray-900">Today's Summary</span>
        </Link>
      </div>
    </div>
  );
}
