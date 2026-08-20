import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Siren, Wrench } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { notify } from "../../lib/notify";
import { LEAVE_TYPE_LABEL, ensureLeaveBalances, leaveDays } from "../../lib/leave";
import type {
  AdvanceRequest,
  Alert,
  AttendanceStatus,
  CoverRequest,
  ExpenseCategory,
  ExpenseClaim,
  Issue,
  IssueCategory,
  LeaveRequest,
  Profile,
  RegularizationRequest,
  SosAlert,
} from "../../lib/types";

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  broken_part: "Broken Part",
  lost_damaged_bottle: "Lost/Damaged Bottle",
  repair_request: "Repair Request",
  pre_damage: "Pre-Existing Damage",
  other: "Other",
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  week_off: "Week Off",
};

const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: "Travel",
  medical: "Medical",
  fuel: "Fuel",
  other: "Other",
};

export default function Alerts() {
  const { profile } = useAuth();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reporters, setReporters] = useState<Map<string, Profile>>(new Map());
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [advanceRequests, setAdvanceRequests] = useState<AdvanceRequest[]>([]);
  const [coverRequests, setCoverRequests] = useState<CoverRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [regularizationRequests, setRegularizationRequests] = useState<RegularizationRequest[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<ExpenseClaim[]>([]);
  const [requesters, setRequesters] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [itemName, setItemName] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.zone]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let alertQuery = supabase.from("alerts").select("*").order("created_at", { ascending: false });
      if (profile?.zone) alertQuery = alertQuery.eq("zone", profile.zone);

      const [alertRes, issueRes, sosRes, advanceRes, coverRes, leaveRes, regularizationRes, expenseRes] =
        await Promise.all([
          alertQuery,
          supabase.from("issues").select("*").eq("status", "open").order("created_at", { ascending: false }),
          supabase.from("sos_alerts").select("*").eq("status", "active").order("created_at", { ascending: false }),
          supabase
            .from("advance_requests")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
          supabase
            .from("cover_requests")
            .select("*")
            .eq("status", "pending")
            .order("cover_date", { ascending: true }),
          supabase
            .from("leave_requests")
            .select("*")
            .eq("status", "pending")
            .order("start_date", { ascending: true }),
          supabase
            .from("regularization_requests")
            .select("*")
            .eq("status", "pending")
            .order("target_date", { ascending: true }),
          supabase
            .from("expense_claims")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
        ]);
      if (alertRes.error) throw alertRes.error;
      if (issueRes.error) throw issueRes.error;
      if (sosRes.error) throw sosRes.error;
      if (advanceRes.error) throw advanceRes.error;
      if (coverRes.error) throw coverRes.error;
      if (leaveRes.error) throw leaveRes.error;
      if (regularizationRes.error) throw regularizationRes.error;
      if (expenseRes.error) throw expenseRes.error;

      const openIssues = (issueRes.data as Issue[]) ?? [];
      const activeSos = (sosRes.data as SosAlert[]) ?? [];
      const pendingAdvances = (advanceRes.data as AdvanceRequest[]) ?? [];
      const pendingCovers = (coverRes.data as CoverRequest[]) ?? [];
      const pendingLeaves = (leaveRes.data as LeaveRequest[]) ?? [];
      const pendingRegularizations = (regularizationRes.data as RegularizationRequest[]) ?? [];
      const pendingExpenses = (expenseRes.data as ExpenseClaim[]) ?? [];

      setAlerts((alertRes.data as Alert[]) ?? []);
      setIssues(openIssues);
      setSosAlerts(activeSos);
      setAdvanceRequests(pendingAdvances);
      setCoverRequests(pendingCovers);
      setLeaveRequests(pendingLeaves);
      setRegularizationRequests(pendingRegularizations);
      setExpenseClaims(pendingExpenses);

      const peopleIds = [
        ...new Set([
          ...openIssues.map((i) => i.reported_by),
          ...activeSos.map((s) => s.washer_id),
          ...pendingAdvances.map((a) => a.washer_id),
          ...pendingCovers.map((c) => c.washer_id),
          ...pendingLeaves.map((l) => l.washer_id),
          ...pendingRegularizations.map((r) => r.profile_id),
          ...pendingExpenses.map((e) => e.profile_id),
        ]),
      ];
      if (peopleIds.length) {
        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .in("id", peopleIds);
        if (profileErr) throw profileErr;
        const map = new Map(((profileData as Profile[]) ?? []).map((p) => [p.id, p]));
        setReporters(map);
        setRequesters(map);
      } else {
        setReporters(new Map());
        setRequesters(new Map());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }

  async function markResolved(id: string) {
    setBusyId(id);
    try {
      const issue = issues.find((i) => i.id === id);
      const { error: updateErr } = await supabase
        .from("issues")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) throw updateErr;
      if (issue) await notify(issue.reported_by, "Your report was resolved", issue.title);
      setIssues((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve issue.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveSos(alert: SosAlert) {
    if (!profile) return;
    setBusyId(alert.id);
    try {
      const { error: updateErr } = await supabase
        .from("sos_alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile.id })
        .eq("id", alert.id);
      if (updateErr) throw updateErr;
      await notify(alert.washer_id, "SOS acknowledged", "Your supervisor has acknowledged your SOS alert.");
      setSosAlerts((prev) => prev.filter((s) => s.id !== alert.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve SOS alert.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveAdvance(req: AdvanceRequest, status: "approved" | "rejected") {
    setBusyId(req.id);
    try {
      const { error: updateErr } = await supabase
        .from("advance_requests")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (updateErr) throw updateErr;
      await notify(
        req.washer_id,
        `Advance request ${status}`,
        `Your request for ₹${req.amount.toLocaleString("en-IN")} was ${status}.`
      );
      setAdvanceRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update advance request.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveCover(req: CoverRequest, status: "approved" | "rejected") {
    setBusyId(req.id);
    try {
      const { error: updateErr } = await supabase
        .from("cover_requests")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (updateErr) throw updateErr;
      await notify(
        req.washer_id,
        `Cover request ${status}`,
        `Your cover request for ${req.cover_date} was ${status}.`
      );
      setCoverRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update cover request.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveLeave(req: LeaveRequest, status: "approved" | "rejected") {
    setBusyId(req.id);
    try {
      const { error: updateErr } = await supabase
        .from("leave_requests")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (updateErr) throw updateErr;
      if (status === "approved") {
        const balances = await ensureLeaveBalances(req.washer_id);
        const balance = balances.find((b) => b.leave_type === req.leave_type);
        if (balance) {
          const { error: balErr } = await supabase
            .from("leave_balances")
            .update({ used: balance.used + leaveDays(req.start_date, req.end_date), updated_at: new Date().toISOString() })
            .eq("id", balance.id);
          if (balErr) throw balErr;
        }
      }
      await notify(
        req.washer_id,
        `Leave request ${status}`,
        `Your ${LEAVE_TYPE_LABEL[req.leave_type]} request (${req.start_date} → ${req.end_date}) was ${status}.`
      );
      setLeaveRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update leave request.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveRegularization(req: RegularizationRequest, status: "approved" | "rejected") {
    setBusyId(req.id);
    try {
      const { error: updateErr } = await supabase
        .from("regularization_requests")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (updateErr) throw updateErr;
      if (status === "approved") {
        const { data: existing, error: findErr } = await supabase
          .from("attendance")
          .select("id")
          .eq("washer_id", req.profile_id)
          .eq("date", req.target_date)
          .maybeSingle();
        if (findErr) throw findErr;
        const attErr = existing
          ? (await supabase.from("attendance").update({ status: req.requested_status }).eq("id", existing.id)).error
          : (
              await supabase
                .from("attendance")
                .insert({ washer_id: req.profile_id, date: req.target_date, status: req.requested_status })
            ).error;
        if (attErr) throw attErr;
      }
      await notify(
        req.profile_id,
        `Regularization request ${status}`,
        `Your request for ${req.target_date} (${STATUS_LABEL[req.requested_status]}) was ${status}.`
      );
      setRegularizationRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update regularization request.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveExpenseClaim(claim: ExpenseClaim, status: "approved" | "rejected") {
    setBusyId(claim.id);
    try {
      const { error: updateErr } = await supabase
        .from("expense_claims")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", claim.id);
      if (updateErr) throw updateErr;
      await notify(
        claim.profile_id,
        `Expense claim ${status}`,
        `Your ${EXPENSE_CATEGORY_LABEL[claim.category]} claim for ₹${claim.amount.toLocaleString("en-IN")} was ${status}.`
      );
      setExpenseClaims((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update expense claim.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitIncident(e: FormEvent) {
    e.preventDefault();
    if (!profile || !category) return;
    setReportBusy(true);
    setReportError(null);
    try {
      const title = itemName.trim() ? `${CATEGORY_LABEL[category]} — ${itemName.trim()}` : CATEGORY_LABEL[category];
      const { error: insertErr } = await supabase.from("issues").insert({
        reported_by: profile.id,
        title,
        category,
        item_name: itemName.trim() || null,
      });
      if (insertErr) throw insertErr;
      setReportOpen(false);
      setCategory(null);
      setItemName("");
      await load();
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Could not submit the report.");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Alert Center</h1>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      {sosAlerts.length > 0 && (
        <div className="space-y-2">
          {sosAlerts.map((sos) => {
            const washer = reporters.get(sos.washer_id);
            const mapsUrl =
              sos.gps_lat != null && sos.gps_lng != null
                ? `https://www.google.com/maps?q=${sos.gps_lat},${sos.gps_lng}`
                : null;
            return (
              <div key={sos.id} className="rounded-2xl bg-red-50 border-2 border-red-300 p-4">
                <div className="flex items-start gap-2">
                  <Siren className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-extrabold text-red-700">SOS — {washer?.full_name ?? "Unknown"}</p>
                    <p className="text-xs text-red-500 mt-0.5">
                      {new Date(sos.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {sos.message ? ` · ${sos.message}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center rounded-xl bg-white border border-red-300 text-red-700 font-bold py-2.5 text-sm"
                    >
                      View Location
                    </a>
                  )}
                  <button
                    onClick={() => resolveSos(sos)}
                    disabled={busyId === sos.id}
                    className="flex-1 rounded-xl bg-red-600 disabled:opacity-50 text-white font-bold py-2.5 text-sm"
                  >
                    {busyId === sos.id ? "Saving…" : "Acknowledge"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-gray-100 rounded-2xl p-4">
        <button
          onClick={() => {
            setReportOpen((v) => !v);
            setReportError(null);
          }}
          className="w-full flex items-center justify-between"
        >
          <span className="flex items-center gap-2 font-bold text-gray-900">
            <Wrench className="h-4 w-4 text-blue-600" />
            Report Incident
          </span>
          <span className="text-sm text-blue-600 font-bold">{reportOpen ? "Close" : "Report"}</span>
        </button>

        {reportOpen && (
          <form onSubmit={submitIncident} className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CATEGORY_LABEL) as IssueCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold text-left ${
                    category === c ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-200"
                  }`}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Item / details (optional)"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {reportError && <p className="text-sm text-red-600">{reportError}</p>}
            <button
              type="submit"
              disabled={!category || reportBusy}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
            >
              {reportBusy ? "Submitting…" : "Submit Report"}
            </button>
          </form>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">ALERTS</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No alerts right now.
              </p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 bg-blue-50 rounded-2xl px-4 py-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-800">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              ISSUES RAISED
            </h2>
            {issues.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No open issues.
              </p>
            ) : (
              <div className="space-y-3">
                {issues.map((issue) => {
                  const reporter = reporters.get(issue.reported_by);
                  return (
                    <div key={issue.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">{issue.title}</p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Open
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                        {reporter?.full_name ?? "Unknown"}
                        {issue.category && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                            {CATEGORY_LABEL[issue.category]}
                          </span>
                        )}
                      </p>
                      <button
                        onClick={() => markResolved(issue.id)}
                        disabled={busyId === issue.id}
                        className="mt-3 w-full h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                      >
                        {busyId === issue.id ? "Resolving…" : "Mark Resolved"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              ADVANCE REQUESTS
            </h2>
            {advanceRequests.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No pending advance requests.
              </p>
            ) : (
              <div className="space-y-3">
                {advanceRequests.map((req) => {
                  const washer = requesters.get(req.washer_id);
                  return (
                    <div key={req.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">
                          ₹{req.amount.toLocaleString("en-IN")}
                        </p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{washer?.full_name ?? "Unknown"}</p>
                      {req.reason && <p className="text-sm text-gray-700 mt-1">{req.reason}</p>}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => resolveAdvance(req, "rejected")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => resolveAdvance(req, "approved")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full bg-blue-600 disabled:opacity-50 font-bold text-white"
                        >
                          {busyId === req.id ? "Saving…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              COVER REQUESTS
            </h2>
            {coverRequests.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No pending cover requests.
              </p>
            ) : (
              <div className="space-y-3">
                {coverRequests.map((req) => {
                  const washer = requesters.get(req.washer_id);
                  return (
                    <div key={req.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">
                          {new Date(req.cover_date).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{washer?.full_name ?? "Unknown"}</p>
                      {req.reason && <p className="text-sm text-gray-700 mt-1">{req.reason}</p>}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => resolveCover(req, "rejected")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => resolveCover(req, "approved")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full bg-blue-600 disabled:opacity-50 font-bold text-white"
                        >
                          {busyId === req.id ? "Saving…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              LEAVE REQUESTS
            </h2>
            {leaveRequests.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No pending leave requests.
              </p>
            ) : (
              <div className="space-y-3">
                {leaveRequests.map((req) => {
                  const washer = requesters.get(req.washer_id);
                  return (
                    <div key={req.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">
                          {LEAVE_TYPE_LABEL[req.leave_type]} ({req.leave_type})
                        </p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{washer?.full_name ?? "Unknown"}</p>
                      <p className="text-sm text-gray-700 mt-1">
                        {req.start_date} → {req.end_date} · {leaveDays(req.start_date, req.end_date)} day(s)
                      </p>
                      {req.reason && <p className="text-sm text-gray-700 mt-1">{req.reason}</p>}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => resolveLeave(req, "rejected")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => resolveLeave(req, "approved")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full bg-blue-600 disabled:opacity-50 font-bold text-white"
                        >
                          {busyId === req.id ? "Saving…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              REGULARIZATION REQUESTS
            </h2>
            {regularizationRequests.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No pending regularization requests.
              </p>
            ) : (
              <div className="space-y-3">
                {regularizationRequests.map((req) => {
                  const washer = requesters.get(req.profile_id);
                  return (
                    <div key={req.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">
                          {new Date(req.target_date).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          → {STATUS_LABEL[req.requested_status]}
                        </p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{washer?.full_name ?? "Unknown"}</p>
                      {req.reason && <p className="text-sm text-gray-700 mt-1">{req.reason}</p>}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => resolveRegularization(req, "rejected")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => resolveRegularization(req, "approved")}
                          disabled={busyId === req.id}
                          className="flex-1 h-11 rounded-full bg-blue-600 disabled:opacity-50 font-bold text-white"
                        >
                          {busyId === req.id ? "Saving…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              EXPENSE CLAIMS
            </h2>
            {expenseClaims.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No pending expense claims.
              </p>
            ) : (
              <div className="space-y-3">
                {expenseClaims.map((claim) => {
                  const washer = requesters.get(claim.profile_id);
                  return (
                    <div key={claim.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">
                          {EXPENSE_CATEGORY_LABEL[claim.category]} · ₹{claim.amount.toLocaleString("en-IN")}
                        </p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{washer?.full_name ?? "Unknown"}</p>
                      {claim.category === "travel" && (claim.from_location || claim.to_location) && (
                        <p className="text-sm text-gray-700 mt-1">
                          {claim.from_location ?? "—"} → {claim.to_location ?? "—"}
                          {claim.distance_km != null ? ` · ${claim.distance_km} km` : ""}
                        </p>
                      )}
                      {claim.description && <p className="text-sm text-gray-700 mt-1">{claim.description}</p>}
                      {claim.receipt_url && (
                        <a
                          href={claim.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 font-bold mt-1 inline-block"
                        >
                          View Receipt
                        </a>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => resolveExpenseClaim(claim, "rejected")}
                          disabled={busyId === claim.id}
                          className="flex-1 h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => resolveExpenseClaim(claim, "approved")}
                          disabled={busyId === claim.id}
                          className="flex-1 h-11 rounded-full bg-blue-600 disabled:opacity-50 font-bold text-white"
                        >
                          {busyId === claim.id ? "Saving…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
