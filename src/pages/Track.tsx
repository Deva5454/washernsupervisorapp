import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { localDateISO } from "../lib/date";
import type { AttendanceRecord, ExecutionStage, Job } from "../lib/types";

const STAGES: { key: ExecutionStage; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "en_route", label: "En Route" },
  { key: "arrived", label: "Arrived" },
  { key: "washing", label: "Washing" },
  { key: "done", label: "Done" },
];

function Stepper({ stage }: { stage: ExecutionStage }) {
  const activeIndex = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center justify-between px-1">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex-1 flex flex-col items-center">
          <span className={`h-2.5 w-2.5 rounded-full ${i <= activeIndex ? "bg-blue-600" : "bg-gray-300"}`} />
          <span className={`text-[10px] font-bold mt-1 ${i <= activeIndex ? "text-blue-600" : "text-gray-400"}`}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Public, unauthenticated tracking page — not wrapped in <Gate>, no
// AppShell chrome, no washer_id filter. Anyone with the link (and a
// valid job id) can view this, matching what a customer-facing tracking
// link is supposed to do.
export default function Track() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    load();
    intervalRef.current = setInterval(refreshStage, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      if (error) throw error;
      const loadedJob = data as Job;
      setJob(loadedJob);
      if (loadedJob.washer_id) {
        const today = localDateISO();
        const { data: attData } = await supabase
          .from("attendance")
          .select("*")
          .eq("washer_id", loadedJob.washer_id)
          .eq("date", today)
          .maybeSingle();
        setAttendance((attData as AttendanceRecord) ?? null);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load this job. The tracking link may be invalid.");
    } finally {
      setLoading(false);
    }
  }

  // Only the stage is re-fetched on the 15s poll — everything else on
  // this page (customer/vehicle details, last-known location) is static
  // for the life of the job, so there's no reason to re-fetch it.
  async function refreshStage() {
    if (!jobId) return;
    try {
      const { data, error } = await supabase.from("jobs").select("execution_stage").eq("id", jobId).single();
      if (error) throw error;
      setJob((prev) => (prev ? { ...prev, execution_stage: data.execution_stage } : prev));
    } catch (err) {
      console.error("Stage refresh failed", err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <p className="text-gray-400 text-sm font-semibold">Loading…</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center px-6">
        <div className="max-w-sm w-full rounded-3xl bg-white shadow-sm border border-gray-200 px-6 py-8 text-center">
          <p className="font-extrabold text-gray-900">{error ?? "Job not found."}</p>
        </div>
      </div>
    );
  }

  const mapsUrl =
    attendance?.gps_lat != null && attendance?.gps_lng != null
      ? `https://www.google.com/maps?q=${attendance.gps_lat},${attendance.gps_lng}`
      : null;

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="max-w-md mx-auto bg-gray-50 shadow-xl min-h-screen">
        <div className="bg-gradient-to-r from-navy to-brand text-white px-4 pt-5 pb-4 shadow-md">
          <h1 className="text-xl font-extrabold tracking-tight">
            CleanCar<span className="text-white/70">.</span>
          </h1>
          <p className="text-sm text-white/70 mt-1">Live Wash Tracking</p>
        </div>

        <div className="px-4 pt-6 pb-10 space-y-4">
          <div className="rounded-2xl bg-gray-100 p-4">
            <p className="text-lg font-extrabold text-gray-900">{job.customer_name}</p>
            <p className="text-sm text-gray-600 mt-0.5">
              {job.vehicle_make} · {job.vehicle_reg}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{job.package_name}</p>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <Stepper stage={job.execution_stage} />
          </div>

          {mapsUrl ? (
            <div className="rounded-2xl bg-gray-100 p-4">
              <p className="font-bold text-gray-900 mb-1">Washer's last known location</p>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold text-sm">
                View on Google Maps →
              </a>
              <p className="text-xs text-gray-400 mt-2">
                Location as of check-in
                {attendance?.created_at
                  ? `, ${new Date(attendance.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}{" "}
                — not live.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-100 p-4">
              <p className="text-sm text-gray-500">Washer's location isn't available yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
