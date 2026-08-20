import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Siren } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { GRADE_LABEL, GRADE_PILL } from "../../lib/audit";
import { LEAVE_TYPE_LABEL, ensureLeaveBalances, leaveDays } from "../../lib/leave";
import type { AttendanceRecord, Audit, IssueCategory, LeaveBalance, LeaveRequest, LeaveType } from "../../lib/types";

type Section =
  | "attendance"
  | "issue"
  | "advance"
  | "cover"
  | "leave"
  | "sos"
  | "audits"
  | "help"
  | "profile"
  | null;

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  broken_part: "Broken Part",
  lost_damaged_bottle: "Lost/Damaged Bottle",
  repair_request: "Repair Request",
  pre_damage: "Pre-Existing Damage",
  other: "Other",
};

const ATTENDANCE_LABEL: Record<AttendanceRecord["status"], string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  week_off: "Week Off",
};

function MenuRow({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-4 text-left"
    >
      <span className="font-bold text-gray-900">{label}</span>
      {open ? (
        <ChevronUp className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

type MonthView = "current" | "previous";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Calendar-month range, not a rolling window: "current" is the 1st of this
// month through today, "previous" is the 1st through the last day of last
// month — matching how attendance is actually reviewed (by month), rather
// than an arbitrary trailing-30-days slice.
function monthRange(view: MonthView) {
  const now = new Date();
  if (view === "current") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toDateStr(start), end: toDateStr(now), label: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: toDateStr(start), end: toDateStr(end), label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

function AttendanceHistory({ washerId }: { washerId: string }) {
  const [monthView, setMonthView] = useState<MonthView>("current");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = monthRange(monthView);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("attendance")
          .select("*")
          .eq("washer_id", washerId)
          .gte("date", range.start)
          .lte("date", range.end)
          .order("date", { ascending: false });
        if (error) throw error;
        if (!cancelled) setRecords((data ?? []) as AttendanceRecord[]);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load attendance history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washerId, monthView]);

  return (
    <div className="px-4 pb-4 bg-white">
      <div className="flex items-center justify-between gap-2 pt-1 pb-3">
        <div className="flex gap-2">
          {(["current", "previous"] as MonthView[]).map((v) => (
            <button
              key={v}
              onClick={() => setMonthView(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                monthView === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {v === "current" ? "This Month" : "Last Month"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{range.label}</span>
      </div>
      {loading && <p className="text-sm text-gray-400 py-3">Loading…</p>}
      {error && <p className="text-sm text-red-600 py-3">{error}</p>}
      {!loading && !error && records.length === 0 && (
        <p className="text-sm text-gray-500 py-3">No attendance records for {range.label}.</p>
      )}
      {!loading && !error && records.length > 0 && (
        <div className="divide-y divide-gray-100">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-gray-700">{r.date}</span>
              <span
                className={`font-bold ${
                  r.status === "present"
                    ? "text-green-600"
                    : r.status === "late"
                      ? "text-amber-600"
                      : r.status === "absent"
                        ? "text-red-600"
                        : "text-gray-500"
                }`}
              >
                {ATTENDANCE_LABEL[r.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportIssue({ washerId }: { washerId: string }) {
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      const finalTitle = category ? `${CATEGORY_LABEL[category]} — ${title.trim()}` : title.trim();
      const { error } = await supabase.from("issues").insert({
        reported_by: washerId,
        title: finalTitle,
        category,
        item_name: category ? title.trim() : null,
      });
      if (error) throw error;
      setSent(true);
      setTitle("");
      setCategory(null);
    } catch (err) {
      console.error(err);
      setError("Could not submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      <form onSubmit={handleSubmit} className="space-y-2 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CATEGORY_LABEL) as IssueCategory[])
            .filter((c) => c !== "pre_damage")
            .map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory((cur) => (cur === c ? null : c))}
                className={`rounded-xl px-3 py-2 text-xs font-bold text-left ${
                  category === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={category ? "Item / details" : "Describe the issue…"}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {sent && <p className="text-sm text-green-700 mt-2">Reported to your supervisor.</p>}
    </div>
  );
}

function RequestAdvance({ washerId }: { washerId: string }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("advance_requests").insert({
        washer_id: washerId,
        amount: amt,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      setSent(true);
      setAmount("");
      setReason("");
    } catch (err) {
      console.error(err);
      setError("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      <form onSubmit={handleSubmit} className="space-y-2 pt-1">
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (₹)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !amount}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {sent && <p className="text-sm text-green-700 mt-2">Request sent to your supervisor.</p>}
    </div>
  );
}

function RequestCover({ washerId }: { washerId: string }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("cover_requests").insert({
        washer_id: washerId,
        cover_date: date,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      setSent(true);
      setDate("");
      setReason("");
    } catch (err) {
      console.error(err);
      setError("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      <form onSubmit={handleSubmit} className="space-y-2 pt-1">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !date}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Request Cover for This Day"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {sent && <p className="text-sm text-green-700 mt-2">Request sent to your supervisor.</p>}
    </div>
  );
}

function SosPanel({ washerId }: { washerId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function sendSos() {
    setSending(true);
    setError(null);
    try {
      let gps: { lat: number; lng: number } | null = null;
      if ("geolocation" in navigator) {
        gps = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });
      }
      const { error } = await supabase.from("sos_alerts").insert({
        washer_id: washerId,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
      });
      if (error) throw error;
      setSent(true);
      setConfirming(false);
    } catch (err) {
      console.error(err);
      setError("Could not send the alert. Please try again, or call your supervisor directly.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      {!confirming ? (
        <button
          onClick={() => {
            setConfirming(true);
            setSent(false);
            setError(null);
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold py-3"
        >
          <Siren className="h-4 w-4" />
          Send SOS
        </button>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-sm text-gray-700">
            Send an SOS alert to your supervisor? Your current location will be shared immediately.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-gray-300 text-gray-700 font-bold py-2.5"
            >
              Cancel
            </button>
            <button
              onClick={sendSos}
              disabled={sending}
              className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5"
            >
              {sending ? "Sending…" : "Confirm SOS"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {sent && <p className="text-sm text-green-700 mt-2">SOS sent — your supervisor has been alerted.</p>}
    </div>
  );
}

function LeavePanel({ washerId }: { washerId: string }) {
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
  }, [washerId]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [bals, reqRes] = await Promise.all([
        ensureLeaveBalances(washerId),
        supabase
          .from("leave_requests")
          .select("*")
          .eq("washer_id", washerId)
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
        washer_id: washerId,
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
                min={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().slice(0, 10)}
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

function MyAudits({ washerId }: { washerId: string }) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washerId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadErr } = await supabase
        .from("audits")
        .select("*")
        .eq("washer_id", washerId)
        .eq("audit_status", "completed")
        .order("completed_at", { ascending: false })
        .limit(10);
      if (loadErr) throw loadErr;
      setAudits((data ?? []) as Audit[]);
    } catch (err) {
      console.error(err);
      setError("Could not load your audits.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      {loading ? (
        <p className="text-sm text-gray-400 py-3">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-3">{error}</p>
      ) : audits.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">No completed audits yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {audits.map((a) => (
            <div key={a.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-gray-900">
                  {a.vehicle_make} · {a.vehicle_reg}
                </p>
                {a.grade && (
                  <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${GRADE_PILL[a.grade]}`}>
                    {GRADE_LABEL[a.grade]}
                  </span>
                )}
              </div>
              {a.total_score != null && (
                <p className="text-sm text-gray-500 mt-0.5">Score: {a.total_score}/100</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {a.completed_at
                  ? new Date(a.completed_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HelpSupport() {
  const faqs = [
    {
      q: "How do I check in for the day?",
      a: "On the Home tab, tap Check In, take a selfie, and confirm your location. If GPS is turned off partway through your shift, you'll be checked out automatically and locked out until your supervisor unlocks check-in.",
    },
    {
      q: "How do I start a job?",
      a: "Go to Jobs → Upcoming, tap Start on a job, then follow the steps: travel, arrive, wash (with 4 required photos), then Mark Job Complete.",
    },
    {
      q: "How do cloths get tracked?",
      a: "Finishing a wash automatically deducts 4 cloths from My Stock. You can also check out and return individual barcode-tracked cloths, or log a bulk hand-over with your supervisor.",
    },
    {
      q: "What's the difference between Request Cover and Leave?",
      a: "Request Cover just tells your supervisor you'll need someone to take your jobs on a specific day. Leave draws down a real CL/PL/SL/UL balance and needs supervisor approval.",
    },
    {
      q: "What happens when I send an SOS?",
      a: "Your supervisor sees it immediately at the top of their Alert Center with your location, and can acknowledge it. Use it only for genuine safety emergencies.",
    },
  ];
  return (
    <div className="px-4 pb-4 bg-white space-y-3">
      {faqs.map((f) => (
        <div key={f.q}>
          <p className="text-sm font-bold text-gray-900">{f.q}</p>
          <p className="text-sm text-gray-600 mt-0.5">{f.a}</p>
        </div>
      ))}
    </div>
  );
}

function ProfileView({
  profile,
}: {
  profile: { full_name: string; phone: string | null; zone: string | null };
}) {
  return (
    <div className="px-4 pb-4 bg-white space-y-2 text-sm">
      <div className="flex items-center justify-between py-1.5">
        <span className="text-gray-400">Name</span>
        <span className="font-bold text-gray-900">{profile.full_name}</span>
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-gray-400">Phone</span>
        <span className="font-bold text-gray-900">{profile.phone ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-gray-400">Zone</span>
        <span className="font-bold text-gray-900">{profile.zone ?? "—"}</span>
      </div>
    </div>
  );
}

export default function More() {
  const { profile, signOut } = useAuth();
  const [openSection, setOpenSection] = useState<Section>(null);

  if (!profile) return null;

  function toggle(section: Exclude<Section, null>) {
    setOpenSection((current) => (current === section ? null : section));
  }

  return (
    <div className="pb-4">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-4">More</h1>
      <div className="rounded-2xl bg-gray-100 divide-y divide-gray-200 overflow-hidden">
        <MenuRow
          label="Attendance History"
          open={openSection === "attendance"}
          onClick={() => toggle("attendance")}
        />
        {openSection === "attendance" && <AttendanceHistory washerId={profile.id} />}

        <MenuRow
          label="Report an Issue"
          open={openSection === "issue"}
          onClick={() => toggle("issue")}
        />
        {openSection === "issue" && <ReportIssue washerId={profile.id} />}

        <MenuRow
          label="Request Advance"
          open={openSection === "advance"}
          onClick={() => toggle("advance")}
        />
        {openSection === "advance" && <RequestAdvance washerId={profile.id} />}

        <MenuRow
          label="Request Cover"
          open={openSection === "cover"}
          onClick={() => toggle("cover")}
        />
        {openSection === "cover" && <RequestCover washerId={profile.id} />}

        <MenuRow
          label="Leave"
          open={openSection === "leave"}
          onClick={() => toggle("leave")}
        />
        {openSection === "leave" && <LeavePanel washerId={profile.id} />}

        <MenuRow
          label="Emergency SOS"
          open={openSection === "sos"}
          onClick={() => toggle("sos")}
        />
        {openSection === "sos" && <SosPanel washerId={profile.id} />}

        <MenuRow
          label="My Audits"
          open={openSection === "audits"}
          onClick={() => toggle("audits")}
        />
        {openSection === "audits" && <MyAudits washerId={profile.id} />}

        <MenuRow
          label="Help & Support"
          open={openSection === "help"}
          onClick={() => toggle("help")}
        />
        {openSection === "help" && <HelpSupport />}

        <MenuRow
          label="My Profile"
          open={openSection === "profile"}
          onClick={() => toggle("profile")}
        />
        {openSection === "profile" && <ProfileView profile={profile} />}

        <button
          onClick={() => signOut()}
          className="w-full text-left px-4 py-4 font-bold text-blue-600"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
