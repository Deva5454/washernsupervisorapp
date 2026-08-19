import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Star } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { Job, JobStatus } from "../../lib/types";

// Not yet configurable anywhere in this app — matches the base daily
// quota used elsewhere in the wider CleanCar system. Only used here to
// highlight which past days hit it, nothing more.
const DAILY_UNIT_TARGET = 25;

const STATUS_STYLE: Record<JobStatus, string> = {
  pending: "border border-blue-600 text-blue-600",
  in_progress: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
  issue: "bg-red-600 text-white",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  issue: "Issue",
};

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap shrink-0 ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function JobCard({ job, onClick, actions }: { job: Job; onClick?: () => void; actions?: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl px-4 py-4 ${
        job.is_urgent ? "bg-red-50 border-2 border-red-300" : "bg-gray-100"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-bold text-blue-600 flex items-center gap-1.5">
          #{job.sequence_number} · {job.scheduled_time}
          {job.is_urgent && (
            <span className="inline-flex items-center gap-0.5 text-red-600 font-bold">
              <AlertTriangle className="h-3.5 w-3.5" /> Urgent
            </span>
          )}
        </span>
        <StatusBadge status={job.status} />
      </div>
      <p className="text-lg font-extrabold text-gray-900 mt-1">
        {job.vehicle_make} · {job.vehicle_reg}
      </p>
      <p className="text-sm text-gray-700 mt-0.5">
        {job.customer_name} · {job.package_name}
      </p>
      <p className="text-sm text-gray-400 mt-0.5">
        {job.area}, {job.city}
      </p>
      {actions}
    </div>
  );
}

type Tab = "active" | "upcoming" | "completed";

export default function Jobs() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [todayJobs, setTodayJobs] = useState<Job[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

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
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [todayRes, completedRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("washer_id", profile.id)
          .eq("job_date", today)
          .order("sequence_number", { ascending: true }),
        supabase
          .from("jobs")
          .select("*")
          .eq("washer_id", profile.id)
          .eq("status", "done")
          .gte("job_date", thirtyDaysAgo)
          .lte("job_date", today)
          .order("job_date", { ascending: false }),
      ]);
      if (todayRes.error) throw todayRes.error;
      if (completedRes.error) throw completedRes.error;
      setTodayJobs((todayRes.data ?? []) as Job[]);
      setCompletedJobs((completedRes.data ?? []) as Job[]);
    } catch (err) {
      console.error(err);
      setError("Could not load your jobs.");
    } finally {
      setLoading(false);
    }
  }

  // Starting a job moves it to in_progress/assigned and opens the real
  // Active Wash flow (stepper + proof-of-work photos) rather than just
  // flipping a status badge in place.
  async function startJob(job: Job) {
    setStartingId(job.id);
    setError(null);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "in_progress", execution_stage: "assigned" })
        .eq("id", job.id);
      if (error) throw error;
      navigate(`/washer/active-wash/${job.id}`);
    } catch (err) {
      console.error(err);
      setError("Could not start this job. Please try again.");
      setStartingId(null);
    }
  }

  if (!profile) return null;

  if (loading) {
    return <div className="px-4 pt-6 text-center text-gray-400">Loading…</div>;
  }

  const activeJobs = todayJobs.filter((j) => j.status === "in_progress");
  const upcomingJobs = todayJobs.filter((j) => j.status === "pending");

  // Group completed jobs by day, so days hitting the unit target can be
  // highlighted — a real count from real completed jobs, not a fabricated
  // streak indicator.
  const completedByDay = new Map<string, Job[]>();
  for (const job of completedJobs) {
    const list = completedByDay.get(job.job_date) ?? [];
    list.push(job);
    completedByDay.set(job.job_date, list);
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "active", label: "Active", count: activeJobs.length },
    { key: "upcoming", label: "Upcoming", count: upcomingJobs.length },
    { key: "completed", label: "Completed", count: completedJobs.length },
  ];

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-gray-900">My Schedule</h1>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
              tab === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>
      )}

      {tab === "active" &&
        (activeJobs.length === 0 ? (
          <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
            No jobs in progress
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate(`/washer/active-wash/${job.id}`)}
                actions={<p className="mt-3 text-center text-sm font-bold text-blue-600">Tap to continue →</p>}
              />
            ))}
          </div>
        ))}

      {tab === "upcoming" &&
        (upcomingJobs.length === 0 ? (
          <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
            No jobs scheduled today
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                actions={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startJob(job);
                    }}
                    disabled={startingId === job.id}
                    className="mt-3 w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
                  >
                    {startingId === job.id ? "Starting…" : "Start"}
                  </button>
                }
              />
            ))}
          </div>
        ))}

      {tab === "completed" &&
        (completedByDay.size === 0 ? (
          <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
            No completed jobs in the last 30 days
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from(completedByDay.entries()).map(([date, jobs]) => {
              const hitTarget = jobs.length >= DAILY_UNIT_TARGET;
              return (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-extrabold text-gray-900">
                      {new Date(date).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <span className="text-xs text-gray-400">{jobs.length} units</span>
                    {hitTarget && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        Target hit
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {jobs.map((job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
