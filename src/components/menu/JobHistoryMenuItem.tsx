import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { localDateISO } from "../../lib/date";
import type { Job, JobStatus, Profile } from "../../lib/types";

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  issue: "Failed",
};

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateISO(d);
}

function JobHistoryPanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [washerId, setWasherId] = useState("");
  const [fromDate, setFromDate] = useState(defaultFrom());
  const [toDate, setToDate] = useState(localDateISO());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  useEffect(() => {
    void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    if (!washerId) {
      setJobs([]);
      return;
    }
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washerId, fromDate, toDate]);

  async function loadRoster() {
    setRosterLoading(true);
    setRosterError(null);
    try {
      let query = supabase.from("profiles").select("*").eq("role", "washer");
      if (profile?.zone) query = query.eq("zone", profile.zone);
      const { data, error } = await query.order("full_name");
      if (error) throw error;
      setRoster((data as Profile[]) ?? []);
    } catch (err) {
      console.error(err);
      setRosterError("Could not load team roster.");
    } finally {
      setRosterLoading(false);
    }
  }

  async function loadJobs() {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("washer_id", washerId)
        .gte("job_date", fromDate)
        .lte("job_date", toDate)
        .order("job_date", { ascending: false });
      if (error) throw error;
      setJobs((data as Job[]) ?? []);
    } catch (err) {
      console.error(err);
      setJobsError("Could not load job history.");
    } finally {
      setJobsLoading(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      {rosterLoading ? (
        <p className="text-sm text-gray-400 py-1">Loading roster…</p>
      ) : rosterError ? (
        <p className="text-sm text-red-600 py-1">{rosterError}</p>
      ) : (
        <select
          value={washerId}
          onChange={(e) => setWasherId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          <option value="">Select washer…</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
      )}

      {washerId && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-gray-500">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          {jobsLoading ? (
            <p className="text-sm text-gray-400 py-1">Loading jobs…</p>
          ) : jobsError ? (
            <p className="text-sm text-red-600 py-1">{jobsError}</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">No jobs in this range.</p>
          ) : (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {jobs.map((j) => (
                <div key={j.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">{j.customer_name}</span>
                    <span className="text-gray-500">{new Date(j.job_date).toLocaleDateString("en-IN")}</span>
                  </div>
                  <p className="text-gray-500">
                    {j.vehicle_make} · {j.vehicle_reg} · {STATUS_LABEL[j.status]}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function JobHistoryMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Team Washer Job History" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <JobHistoryPanel profileId={profileId} />}
    </>
  );
}
