import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import type { DailyFlowProgress } from "../../lib/types";

const STEPS = [
  { key: "pre_day_briefing", label: "Pre-Day Briefing", critical: false },
  { key: "team_checkin_verified", label: "Team Check-In Verified", critical: true },
  { key: "job_assignments_confirmed", label: "Job Assignments Confirmed", critical: true },
  { key: "midday_cash_spotcheck", label: "Midday Cash Spot-Check", critical: false },
  { key: "incident_log_reviewed", label: "Incident Log Reviewed", critical: false },
  { key: "eod_attendance_closed", label: "End-of-Day Attendance Closed", critical: true },
  { key: "cash_register_submitted", label: "Cash Register Submitted", critical: true },
] as const;

function isoDate(d: Date) {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function DailyFlowPanel({ profileId }: { profileId: string }) {
  const [progress, setProgress] = useState<DailyFlowProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const today = isoDate(new Date());
      const { data, error } = await supabase
        .from("daily_flow_progress")
        .select("*")
        .eq("supervisor_id", profileId)
        .eq("flow_date", today)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProgress(data as DailyFlowProgress);
      } else {
        const { data: created, error: createErr } = await supabase
          .from("daily_flow_progress")
          .insert({ supervisor_id: profileId, flow_date: today, completed_steps: [] })
          .select()
          .single();
        if (createErr) throw createErr;
        setProgress(created as DailyFlowProgress);
      }
    } catch (err) {
      console.error(err);
      setLoadError("Could not load today's flow.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleStep(key: string) {
    if (!progress) return;
    const already = progress.completed_steps.includes(key);
    const nextSteps = already
      ? progress.completed_steps.filter((k) => k !== key)
      : [...progress.completed_steps, key];
    setBusyKey(key);
    try {
      const { error } = await supabase
        .from("daily_flow_progress")
        .update({ completed_steps: nextSteps, updated_at: new Date().toISOString() })
        .eq("id", progress.id);
      if (error) throw error;
      setProgress({ ...progress, completed_steps: nextSteps });
    } catch (err) {
      console.error(err);
      setLoadError("Could not save that step. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 pb-4 bg-white">
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      </div>
    );
  }
  if (loadError && !progress) {
    return (
      <div className="px-4 pb-4 bg-white">
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      </div>
    );
  }

  const completedSteps = progress?.completed_steps ?? [];
  const doneCount = STEPS.filter((s) => completedSteps.includes(s.key)).length;
  const criticalSteps = STEPS.filter((s) => s.critical);
  const criticalDone = criticalSteps.filter((s) => completedSteps.includes(s.key)).length;

  return (
    <div className="px-4 pb-4 bg-white space-y-3">
      <div className="bg-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-900">
          {doneCount} of {STEPS.length} done
        </span>
        <span className="text-sm text-gray-500">
          {criticalDone} of {criticalSteps.length} critical done
        </span>
      </div>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      <div className="space-y-2">
        {STEPS.map((step) => {
          const done = completedSteps.includes(step.key);
          return (
            <button
              key={step.key}
              onClick={() => toggleStep(step.key)}
              disabled={busyKey === step.key}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left disabled:opacity-50 ${
                done ? "bg-green-50 border border-green-300" : "bg-gray-100"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                  done ? "bg-green-600" : "bg-white border border-gray-300"
                }`}
              >
                {done && <Check className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className="flex-1 text-sm font-bold text-gray-900">{step.label}</span>
              {!done && step.critical && (
                <span className="flex-shrink-0 text-xs font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                  Critical
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DailyFlowMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Daily Flow / Process Timeline" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <DailyFlowPanel profileId={profileId} />}
    </>
  );
}
