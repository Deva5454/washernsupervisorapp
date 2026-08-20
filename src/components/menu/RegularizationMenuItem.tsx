import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import type { AttendanceStatus, RegularizationRequest } from "../../lib/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  week_off: "Week Off",
};

function RegularizationPanel({ profileId }: { profileId: string }) {
  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [targetDate, setTargetDate] = useState("");
  const [requestedStatus, setRequestedStatus] = useState<AttendanceStatus>("present");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("regularization_requests")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setRequests((data ?? []) as RegularizationRequest[]);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load regularization requests.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!targetDate) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("regularization_requests").insert({
        profile_id: profileId,
        target_date: targetDate,
        requested_status: requestedStatus,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      setSent(true);
      setTargetDate("");
      setReason("");
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        />
        <select
          value={requestedStatus}
          onChange={(e) => setRequestedStatus(e.target.value as AttendanceStatus)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
            <option key={s} value={s}>
              Correct to: {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !targetDate}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {sent && <p className="text-sm text-green-700">Regularization request sent to your supervisor.</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        requests.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Requests</p>
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {r.target_date} → {STATUS_LABEL[r.requested_status]}
                </span>
                <span
                  className={`font-bold ${
                    r.status === "approved"
                      ? "text-green-600"
                      : r.status === "rejected"
                        ? "text-red-600"
                        : "text-blue-600"
                  }`}
                >
                  {r.status[0].toUpperCase() + r.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function RegularizationMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Attendance Regularization" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <RegularizationPanel profileId={profileId} />}
    </>
  );
}
