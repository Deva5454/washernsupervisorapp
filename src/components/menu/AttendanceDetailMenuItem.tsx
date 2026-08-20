import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import type { AttendanceRecord, AttendanceStatus, Audit, Profile } from "../../lib/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  week_off: "Week Off",
};

function isoDate(d: Date) {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function daysAgo(dateStr: string) {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

function AttendanceDetailPanel() {
  const { profile } = useAuth();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);

  const [washerId, setWasherId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const [lastAudit, setLastAudit] = useState<Audit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.zone]);

  useEffect(() => {
    if (!washerId) {
      setAttendance(null);
      setLastAudit(null);
      return;
    }
    void loadAttendance();
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washerId, date]);

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

  async function loadAttendance() {
    setAttendanceLoading(true);
    setAttendanceError(null);
    setNoteSaved(false);
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("washer_id", washerId)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      setAttendance((data as AttendanceRecord) ?? null);
      setNote((data as AttendanceRecord | null)?.supervisor_note ?? "");
    } catch (err) {
      console.error(err);
      setAttendanceError("Could not load attendance for this date.");
    } finally {
      setAttendanceLoading(false);
    }
  }

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from("audits")
        .select("*")
        .eq("washer_id", washerId)
        .eq("audit_status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setLastAudit((data as Audit) ?? null);
    } catch (err) {
      console.error(err);
      setLastAudit(null);
    } finally {
      setAuditLoading(false);
    }
  }

  async function saveNote() {
    if (!attendance) return;
    setNoteBusy(true);
    setNoteSaved(false);
    setAttendanceError(null);
    try {
      const { error } = await supabase
        .from("attendance")
        .update({ supervisor_note: note.trim() || null })
        .eq("id", attendance.id);
      if (error) throw error;
      setNoteSaved(true);
    } catch (err) {
      console.error(err);
      setAttendanceError("Could not save the note. Please try again.");
    } finally {
      setNoteBusy(false);
    }
  }

  const cadenceOverdue = !lastAudit || !lastAudit.completed_at || daysAgo(lastAudit.completed_at) >= 30;

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
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
          />

          {attendanceLoading ? (
            <p className="text-sm text-gray-400 py-1">Loading…</p>
          ) : attendanceError ? (
            <p className="text-sm text-red-600 py-1">{attendanceError}</p>
          ) : !attendance ? (
            <p className="text-sm text-gray-400 bg-gray-100 rounded-xl px-4 py-3">
              No attendance record for this date.
            </p>
          ) : (
            <div className="space-y-3">
              {attendance.selfie_url && (
                <img
                  src={attendance.selfie_url}
                  alt="Check-in selfie"
                  className="w-full max-w-xs rounded-xl border border-gray-200 object-cover"
                />
              )}
              <p className="text-sm text-gray-700">
                Status: <span className="font-bold text-gray-900">{STATUS_LABEL[attendance.status]}</span>
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Supervisor note"
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={saveNote}
                disabled={noteBusy}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
              >
                {noteBusy ? "Saving…" : "Save Note"}
              </button>
              {noteSaved && <p className="text-sm text-green-700">Note saved.</p>}
            </div>
          )}

          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Audit Cadence</p>
            {auditLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : cadenceOverdue ? (
              <span className="inline-block text-xs font-bold text-red-700 bg-red-100 rounded-full px-3 py-1">
                Overdue
              </span>
            ) : (
              <p className="text-sm text-gray-700">
                Last audited {daysAgo(lastAudit!.completed_at as string)} day(s) ago
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AttendanceDetailMenuItem() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Team Attendance Detail" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <AttendanceDetailPanel />}
    </>
  );
}
