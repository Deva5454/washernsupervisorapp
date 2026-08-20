import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { localDateISO } from "../../lib/date";
import { LEAVE_TYPE_LABEL, ensureLeaveBalances, leaveDays } from "../../lib/leave";
import type { LeaveBalance, LeaveRequest, LeaveType } from "../../lib/types";

function LeavePanel({ profileId }: { profileId: string }) {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [leaveType, setLeaveType] = useState<LeaveType>("CL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
      const [bals, reqRes] = await Promise.all([
        ensureLeaveBalances(profileId),
        supabase
          .from("leave_requests")
          .select("*")
          .eq("washer_id", profileId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setBalances(bals);
      if (reqRes.error) throw reqRes.error;
      setRequests((reqRes.data ?? []) as LeaveRequest[]);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load leave data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("leave_requests").insert({
        washer_id: profileId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      setSent(true);
      setStartDate("");
      setEndDate("");
      setReason("");
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not submit your leave request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      {loading ? (
        <p className="text-sm text-gray-400 py-3">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-3">{loadError}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {balances.map((b) => (
              <div key={b.leave_type} className="rounded-xl bg-gray-100 px-2 py-2 text-center">
                <p className="text-xs font-bold text-gray-500">{b.leave_type}</p>
                <p className="text-sm font-extrabold text-gray-900">
                  {b.total - b.used}/{b.total}
                </p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
            >
              {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => (
                <option key={t} value={t}>
                  {LEAVE_TYPE_LABEL[t]} ({t})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={localDateISO()}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || localDateISO()}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
              />
            </div>
            {startDate && endDate && (
              <p className="text-xs text-gray-400">{leaveDays(startDate, endDate)} day(s)</p>
            )}
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={submitting || !startDate || !endDate}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
            >
              {submitting ? "Submitting…" : "Apply for Leave"}
            </button>
          </form>
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          {sent && <p className="text-sm text-green-700">Leave request sent to your supervisor.</p>}

          {requests.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Requests</p>
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    {r.leave_type} · {r.start_date} → {r.end_date}
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
          )}
        </>
      )}
    </div>
  );
}

export function LeaveMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Leave" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <LeavePanel profileId={profileId} />}
    </>
  );
}
