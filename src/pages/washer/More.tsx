import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { AttendanceRecord } from "../../lib/types";

type Section = "attendance" | "issue" | "profile" | null;

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
      const { error } = await supabase.from("issues").insert({
        reported_by: washerId,
        title: title.trim(),
      });
      if (error) throw error;
      setSent(true);
      setTitle("");
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
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Describe the issue…"
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
      {sent && <p className="text-sm text-green-700 mt-2">Issue reported to your supervisor.</p>}
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
