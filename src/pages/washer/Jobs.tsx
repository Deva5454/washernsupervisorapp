import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { Job, JobStatus } from "../../lib/types";

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

export default function Jobs() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("washer_id", profile.id)
        .eq("job_date", today)
        .order("sequence_number", { ascending: true });
      if (error) throw error;
      setJobs((data ?? []) as Job[]);
    } catch (err) {
      console.error(err);
      setError("Could not load today's jobs.");
    } finally {
      setLoading(false);
    }
  }

  async function advance(job: Job, nextStatus: JobStatus) {
    setUpdatingId(job.id);
    setError(null);
    try {
      const { error } = await supabase.from("jobs").update({ status: nextStatus }).eq("id", job.id);
      if (error) throw error;
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: nextStatus } : j)));
    } catch (err) {
      console.error(err);
      setError("Could not update job status. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (!profile) return null;

  if (loading) {
    return <div className="px-4 pt-6 text-center text-gray-400">Loading…</div>;
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-gray-900">My Schedule</h1>

      {error && (
        <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
          No jobs scheduled today
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-2xl bg-gray-100 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-bold text-blue-600">
                  #{job.sequence_number} · {job.scheduled_time}
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

              {job.status === "pending" && (
                <button
                  onClick={() => advance(job, "in_progress")}
                  disabled={updatingId === job.id}
                  className="mt-3 w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
                >
                  {updatingId === job.id ? "Starting…" : "Start"}
                </button>
              )}
              {job.status === "in_progress" && (
                <button
                  onClick={() => advance(job, "done")}
                  disabled={updatingId === job.id}
                  className="mt-3 w-full rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2.5"
                >
                  {updatingId === job.id ? "Saving…" : "Mark Done"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
