import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { notify } from "../../lib/notify";
import { CheckInPanel } from "../../components/CheckInPanel";
import type { AttendanceRecord, AttendanceStatus, CashDeposit, Job, Profile } from "../../lib/types";

function todayCashCollected(jobs: Job[], washerId: string) {
  return jobs
    .filter((j) => j.washer_id === washerId && j.payment_method === "cash" && j.payment_collected_at)
    .reduce((sum, j) => sum + Number(j.payment_amount ?? 0), 0);
}

// Local-timezone "today" as a YYYY-MM-DD date string, matching the
// Postgres `date` columns (job_date, attendance.date) exactly.
function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function attendanceLabel(rec: AttendanceRecord | undefined) {
  if (!rec) return "Not checked in yet";
  if (rec.status === "present") return "Present";
  if (rec.status === "late") return "Late";
  if (rec.status === "absent") return "Absent";
  return "Week Off";
}

function attendancePillClass(rec: AttendanceRecord | undefined) {
  if (!rec) return "bg-gray-200 text-gray-500";
  if (rec.status === "present" || rec.status === "late") return "bg-blue-100 text-blue-700";
  if (rec.status === "absent") return "bg-red-100 text-red-700";
  return "bg-gray-200 text-gray-600";
}

export default function Dashboard() {
  const { profile } = useAuth();

  const [roster, setRoster] = useState<Profile[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<AttendanceRecord[]>([]);
  const [teamJobsToday, setTeamJobsToday] = useState<Job[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
  const [openIssueCount, setOpenIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [selectedWasherId, setSelectedWasherId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const teamStatusRef = useRef<HTMLDivElement>(null);

  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const [attendanceBusyId, setAttendanceBusyId] = useState<string | null>(null);
  const [unlockBusyId, setUnlockBusyId] = useState<string | null>(null);
  const [forceCheckoutBusyId, setForceCheckoutBusyId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const [cashDepositsToday, setCashDepositsToday] = useState<CashDeposit[]>([]);
  const [depositBusyId, setDepositBusyId] = useState<string | null>(null);

  // Cover redistribution: when a washer is marked absent, their
  // undone jobs today can be handed to on-duty teammates in one panel
  // rather than one-by-one through the Job Queue's Override control.
  const [coverWasherId, setCoverWasherId] = useState<string | null>(null);
  const [coverAssignments, setCoverAssignments] = useState<Record<string, string>>({});
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.zone]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const today = todayISO();

      let rosterQuery = supabase.from("profiles").select("*").eq("role", "washer");
      if (profile?.zone) rosterQuery = rosterQuery.eq("zone", profile.zone);
      const { data: rosterData, error: rosterErr } = await rosterQuery.order("full_name");
      if (rosterErr) throw rosterErr;
      const teamRoster = (rosterData as Profile[]) ?? [];
      setRoster(teamRoster);

      const washerIds = teamRoster.map((w) => w.id);

      const [attendanceRes, jobsRes, unassignedRes] = await Promise.all([
        washerIds.length
          ? supabase.from("attendance").select("*").eq("date", today).in("washer_id", washerIds)
          : Promise.resolve({ data: [], error: null }),
        washerIds.length
          ? supabase.from("jobs").select("*").eq("job_date", today).in("washer_id", washerIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("jobs").select("*").eq("job_date", today).is("washer_id", null),
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (unassignedRes.error) throw unassignedRes.error;

      setAttendanceToday((attendanceRes.data as AttendanceRecord[]) ?? []);
      setTeamJobsToday((jobsRes.data as Job[]) ?? []);
      setUnassignedJobs((unassignedRes.data as Job[]) ?? []);

      if (washerIds.length) {
        const [issueRes, depositRes] = await Promise.all([
          supabase
            .from("issues")
            .select("id", { count: "exact", head: true })
            .eq("status", "open")
            .in("reported_by", washerIds),
          supabase.from("cash_deposits").select("*").eq("deposit_date", today).in("washer_id", washerIds),
        ]);
        if (issueRes.error) throw issueRes.error;
        if (depositRes.error) throw depositRes.error;
        setOpenIssueCount(issueRes.count ?? 0);
        setCashDepositsToday((depositRes.data as CashDeposit[]) ?? []);
      } else {
        setOpenIssueCount(0);
        setCashDepositsToday([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  // Also used to override an already-assigned job to a different washer,
  // not just to fill in an unassigned one — so this always re-fetches
  // (loadAll) rather than patching one local array in place.
  async function confirmAssign(jobId: string) {
    if (!selectedWasherId) return;
    setAssignBusy(true);
    try {
      const job = allJobsToday.find((j) => j.id === jobId);
      const { error: updateErr } = await supabase
        .from("jobs")
        .update({ washer_id: selectedWasherId, override_reason: overrideReason.trim() || null })
        .eq("id", jobId);
      if (updateErr) throw updateErr;
      if (job) {
        await notify(
          selectedWasherId,
          "New job assigned",
          `${job.vehicle_make} · ${job.vehicle_reg} at ${job.scheduled_time}`
        );
      }
      setAssigningJobId(null);
      setSelectedWasherId("");
      setOverrideReason("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign job.");
    } finally {
      setAssignBusy(false);
    }
  }

  // Manual attendance override — a supervisor correcting or setting a
  // washer's status directly, independent of that washer's own
  // check-in/out. No separate audit trail, matching the rest of this
  // app's lightweight approach.
  async function overrideAttendance(washerId: string, status: AttendanceStatus) {
    setAttendanceBusyId(washerId);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("attendance")
        .upsert({ washer_id: washerId, date: todayISO(), status }, { onConflict: "washer_id,date" });
      if (updateErr) throw updateErr;
      setEditingAttendanceId(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update attendance.");
    } finally {
      setAttendanceBusyId(null);
    }
  }

  function onDutyWashers(excludeWasherId: string) {
    return roster.filter((w) => {
      if (w.id === excludeWasherId) return false;
      const status = attendanceByWasher.get(w.id)?.status;
      return status === "present" || status === "late";
    });
  }

  function jobsNeedingCover(washerId: string) {
    return allJobsToday.filter((j) => j.washer_id === washerId && j.status !== "done");
  }

  async function unlockCheckIn(washerId: string, attendanceId: string) {
    setUnlockBusyId(attendanceId);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("attendance")
        .update({ gps_unlock_approved_at: new Date().toISOString() })
        .eq("id", attendanceId);
      if (updateErr) throw updateErr;
      await notify(washerId, "Check-in unlocked", "Your supervisor has unlocked check-in — you can check in again.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlock check-in.");
    } finally {
      setUnlockBusyId(null);
    }
  }

  async function forceCheckout(washerId: string, attendanceId: string) {
    setForceCheckoutBusyId(attendanceId);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("attendance")
        .update({ check_out_time: new Date().toISOString() })
        .eq("id", attendanceId);
      if (updateErr) throw updateErr;
      await notify(washerId, "Checked out by supervisor", "Your supervisor checked you out for the day.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check out this washer.");
    } finally {
      setForceCheckoutBusyId(null);
    }
  }

  async function markCashDeposited(washerId: string, amount: number) {
    setDepositBusyId(washerId);
    setError(null);
    try {
      if (!profile) return;
      const { error: insertErr } = await supabase.from("cash_deposits").insert({
        washer_id: washerId,
        amount,
        recorded_by: profile.id,
      });
      if (insertErr) throw insertErr;
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record deposit.");
    } finally {
      setDepositBusyId(null);
    }
  }

  function openCoverPanel(washerId: string) {
    const jobs = jobsNeedingCover(washerId);
    const onDuty = onDutyWashers(washerId);
    const assignments: Record<string, string> = {};
    jobs.forEach((job, i) => {
      // Auto-suggest via round robin across on-duty teammates; the
      // supervisor can still override any single job before confirming.
      if (onDuty.length) assignments[job.id] = onDuty[i % onDuty.length].id;
    });
    setCoverAssignments(assignments);
    setCoverWasherId(washerId);
  }

  async function confirmCover() {
    const entries = Object.entries(coverAssignments).filter(([, washerId]) => washerId);
    if (!entries.length) {
      setCoverWasherId(null);
      return;
    }
    setCoverBusy(true);
    setError(null);
    try {
      const results = await Promise.all(
        entries.map(([jobId, washerId]) => supabase.from("jobs").update({ washer_id: washerId }).eq("id", jobId))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      const byWasher = new Map<string, number>();
      for (const [, washerId] of entries) byWasher.set(washerId, (byWasher.get(washerId) ?? 0) + 1);
      await Promise.all(
        Array.from(byWasher.entries()).map(([washerId, count]) =>
          notify(washerId, "Cover job assigned", `${count} job${count === 1 ? "" : "s"} added to your schedule today.`)
        )
      );
      setCoverWasherId(null);
      setCoverAssignments({});
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reassign jobs.");
    } finally {
      setCoverBusy(false);
    }
  }

  const onDutyCount = attendanceToday.filter((a) => a.status === "present" || a.status === "late").length;
  const absentCount = attendanceToday.filter((a) => a.status === "absent").length;
  const jobsDoneCount = teamJobsToday.filter((j) => j.status === "done").length;
  const completionPct = teamJobsToday.length
    ? Math.round((jobsDoneCount / teamJobsToday.length) * 100)
    : 0;

  const attendanceByWasher = new Map(attendanceToday.map((a) => [a.washer_id, a]));
  const rosterById = new Map(roster.map((w) => [w.id, w]));
  // teamJobsToday (washer_id in roster) and unassignedJobs (washer_id is
  // null) are disjoint by construction, so this union needs no dedup.
  const allJobsToday = [...teamJobsToday, ...unassignedJobs].sort((a, b) =>
    a.scheduled_time.localeCompare(b.scheduled_time)
  );

  if (loading) {
    return <p className="text-gray-400 text-sm">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg flex-shrink-0">
          {initials(profile?.full_name ?? "")}
        </div>
        <div>
          <p className="text-sm text-gray-500">Good morning</p>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {profile?.full_name}
            {profile?.zone ? <span className="text-gray-900"> · {profile.zone}</span> : null}
          </h1>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      <CheckInPanel />

      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => teamStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="bg-gray-100 rounded-2xl py-5 text-center"
        >
          <p className="text-3xl font-extrabold text-blue-600">
            {onDutyCount}
            <span className="text-lg text-gray-400">/{roster.length}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">On Duty</p>
        </button>
        <div className="bg-gray-100 rounded-2xl py-5 text-center">
          <p className="text-3xl font-extrabold text-gray-900">{absentCount}</p>
          <p className="text-xs text-gray-500 mt-1">Absent</p>
        </div>
        <div className="bg-gray-100 rounded-2xl py-5 text-center">
          <p className="text-3xl font-extrabold text-gray-900">{jobsDoneCount}</p>
          <p className="text-xs text-gray-500 mt-1">Jobs Done</p>
        </div>
      </div>

      <div className="bg-gray-100 rounded-2xl p-5">
        <p className="text-xs font-bold text-blue-600 tracking-wide mb-4">TODAY'S KPIS</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-extrabold text-gray-900">{completionPct}%</p>
            <p className="text-xs text-gray-500 mt-1">Completion</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-gray-900">{openIssueCount}</p>
            <p className="text-xs text-gray-500 mt-1">Open Issues</p>
          </div>
        </div>
      </div>

      {(() => {
        const depositedByWasher = new Map<string, number>();
        for (const d of cashDepositsToday) {
          depositedByWasher.set(d.washer_id, (depositedByWasher.get(d.washer_id) ?? 0) + Number(d.amount));
        }
        const rows = roster
          .map((w) => {
            const collected = todayCashCollected(teamJobsToday, w.id);
            const deposited = depositedByWasher.get(w.id) ?? 0;
            return { washer: w, pending: collected - deposited };
          })
          .filter((r) => r.pending > 0);
        if (!rows.length) return null;
        return (
          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              CASH COLLECTION · PENDING DEPOSIT
            </h2>
            <div className="space-y-2">
              {rows.map(({ washer, pending }) => (
                <div
                  key={washer.id}
                  className="bg-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-bold text-gray-900">{washer.full_name}</p>
                    <p className="text-sm text-gray-500">₹{pending.toLocaleString("en-IN")} pending</p>
                  </div>
                  <button
                    onClick={() => markCashDeposited(washer.id, pending)}
                    disabled={depositBusyId === washer.id}
                    className="flex-shrink-0 rounded-full bg-blue-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-2"
                  >
                    {depositBusyId === washer.id ? "Saving…" : "Mark Deposited"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div>
        <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
          JOB QUEUE · TODAY
        </h2>
        {allJobsToday.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
            No jobs scheduled today.
          </p>
        ) : (
          <div className="space-y-3">
            {allJobsToday.map((job) => {
              const assignedWasher = job.washer_id ? rosterById.get(job.washer_id) : undefined;
              return (
                <div key={job.id} className="bg-gray-100 rounded-2xl px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-gray-900">
                        {job.vehicle_make} · {job.vehicle_reg}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {job.area} · {job.scheduled_time}
                      </p>
                      <p
                        className={`text-xs font-bold mt-1 ${
                          assignedWasher ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        {assignedWasher ? assignedWasher.full_name : "Unassigned"}
                      </p>
                    </div>
                    {assigningJobId !== job.id && (
                      <button
                        onClick={() => {
                          setAssigningJobId(job.id);
                          setSelectedWasherId(job.washer_id ?? "");
                        }}
                        className="flex-shrink-0 rounded-full border border-gray-300 px-4 py-2 text-sm font-bold text-gray-900"
                      >
                        {assignedWasher ? "Override" : "Assign"}
                      </button>
                    )}
                  </div>
                  {assigningJobId === job.id && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedWasherId}
                          onChange={(e) => setSelectedWasherId(e.target.value)}
                          className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          <option value="">Select washer…</option>
                          {roster.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => confirmAssign(job.id)}
                          disabled={!selectedWasherId || assignBusy}
                          className="rounded-full bg-blue-600 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setAssigningJobId(null);
                            setOverrideReason("");
                          }}
                          className="text-sm text-gray-500 font-medium px-2"
                        >
                          Cancel
                        </button>
                      </div>
                      <input
                        type="text"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div ref={teamStatusRef}>
        <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">TEAM STATUS</h2>
        {roster.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
            No washers found{profile?.zone ? ` in ${profile.zone}` : ""}.
          </p>
        ) : (
          <div className="space-y-2">
            {roster.map((w) => {
              const rec = attendanceByWasher.get(w.id);
              const uncoveredJobs = jobsNeedingCover(w.id);
              const isAbsent = rec?.status === "absent";
              const isGpsLocked = !!rec?.gps_lost_at && !rec?.gps_unlock_approved_at;
              const isCheckedIn =
                rec &&
                (rec.status === "present" || rec.status === "late") &&
                !rec.gps_lost_at &&
                !rec.check_out_time;
              return (
                <div key={w.id} className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{w.full_name}</p>
                      {w.phone && (
                        <a
                          href={`tel:${w.phone}`}
                          aria-label={`Call ${w.full_name}`}
                          className="flex-shrink-0 h-7 w-7 rounded-full bg-white text-blue-600 flex items-center justify-center"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {editingAttendanceId === w.id ? (
                      <select
                        autoFocus
                        defaultValue={rec?.status ?? ""}
                        onChange={(e) => overrideAttendance(w.id, e.target.value as AttendanceStatus)}
                        onBlur={() => setEditingAttendanceId(null)}
                        disabled={attendanceBusyId === w.id}
                        className="flex-shrink-0 text-xs font-bold rounded-full border border-gray-300 px-2 py-1.5 bg-white"
                      >
                        <option value="" disabled>
                          Set status…
                        </option>
                        <option value="present">Present</option>
                        <option value="late">Late</option>
                        <option value="absent">Absent</option>
                        <option value="week_off">Week Off</option>
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingAttendanceId(w.id)}
                        className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${attendancePillClass(rec)}`}
                      >
                        {attendanceBusyId === w.id ? "Saving…" : attendanceLabel(rec)}
                      </button>
                    )}
                  </div>
                  {isGpsLocked && rec && (
                    <button
                      onClick={() => unlockCheckIn(w.id, rec.id)}
                      disabled={unlockBusyId === rec.id}
                      className="mt-2 w-full rounded-xl bg-red-50 border border-red-300 text-red-600 disabled:opacity-50 text-xs font-bold py-2"
                    >
                      {unlockBusyId === rec.id ? "Unlocking…" : "GPS lost — Unlock Check-In"}
                    </button>
                  )}
                  {isCheckedIn && rec && (
                    <button
                      onClick={() => forceCheckout(w.id, rec.id)}
                      disabled={forceCheckoutBusyId === rec.id}
                      className="mt-2 w-full rounded-xl border border-gray-300 text-gray-700 disabled:opacity-50 text-xs font-bold py-2"
                    >
                      {forceCheckoutBusyId === rec.id ? "Checking out…" : "Force Checkout"}
                    </button>
                  )}
                  {isAbsent && uncoveredJobs.length > 0 && (
                    <button
                      onClick={() => openCoverPanel(w.id)}
                      className="mt-2 w-full rounded-xl border border-blue-600 text-blue-600 text-xs font-bold py-2"
                    >
                      Cover {uncoveredJobs.length} job{uncoveredJobs.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {coverWasherId && (
          <div className="mt-3 rounded-2xl bg-blue-50 border border-blue-200 p-4 space-y-3">
            <p className="text-sm font-extrabold text-gray-900">
              Reassign {rosterById.get(coverWasherId)?.full_name}'s jobs
            </p>
            {jobsNeedingCover(coverWasherId).map((job) => (
              <div key={job.id} className="bg-white rounded-xl px-3 py-2">
                <p className="text-sm font-bold text-gray-900">
                  {job.vehicle_make} · {job.vehicle_reg}
                </p>
                <p className="text-xs text-gray-500 mb-1.5">
                  {job.area} · {job.scheduled_time}
                </p>
                <select
                  value={coverAssignments[job.id] ?? ""}
                  onChange={(e) =>
                    setCoverAssignments((prev) => ({ ...prev, [job.id]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">Leave unassigned</option>
                  {onDutyWashers(coverWasherId).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.full_name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCoverWasherId(null);
                  setCoverAssignments({});
                }}
                className="flex-1 rounded-xl border border-gray-300 text-gray-700 font-bold py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={confirmCover}
                disabled={coverBusy}
                className="flex-1 rounded-xl bg-blue-600 disabled:opacity-50 text-white font-bold py-2.5"
              >
                {coverBusy ? "Reassigning…" : "Confirm Reassignment"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
