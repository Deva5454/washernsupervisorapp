import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { notify } from "../../lib/notify";
import { logActivity } from "../../lib/activityLog";
import type { BatchInvalidation, Escalation, EscalationCaseType, Profile, SchedulePause } from "../../lib/types";

const CASE_TYPE_LABEL: Record<EscalationCaseType, string> = {
  missed_visit_credit: "Missed Visit Credit",
  quality_dispute: "Quality Dispute",
  bonus_correction: "Bonus Correction",
  other: "Other",
};

function EscalationPanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Raise a case
  const [caseWasherId, setCaseWasherId] = useState("");
  const [caseType, setCaseType] = useState<EscalationCaseType | null>(null);
  const [caseReason, setCaseReason] = useState("");
  const [caseDetails, setCaseDetails] = useState("");
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [myCases, setMyCases] = useState<Escalation[]>([]);

  // Pause / resume
  const [pauseWasherId, setPauseWasherId] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [activePauses, setActivePauses] = useState<SchedulePause[]>([]);
  const [resumeBusyId, setResumeBusyId] = useState<string | null>(null);

  // Batch invalidation
  const [batchId, setBatchId] = useState("");
  const [batchReason, setBatchReason] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [invalidations, setInvalidations] = useState<BatchInvalidation[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function load() {
    setLoading(true);
    setRosterError(null);
    try {
      let rosterQuery = supabase.from("profiles").select("*").eq("role", "washer");
      if (profile?.zone) rosterQuery = rosterQuery.eq("zone", profile.zone);
      const [rosterRes, casesRes, pausesRes, invalidationsRes] = await Promise.all([
        rosterQuery.order("full_name"),
        supabase
          .from("escalations")
          .select("*")
          .eq("raised_by", profileId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("schedule_pauses").select("*").is("resumed_at", null).order("paused_at", { ascending: false }),
        supabase
          .from("batch_invalidations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (rosterRes.error) throw rosterRes.error;
      if (casesRes.error) throw casesRes.error;
      if (pausesRes.error) throw pausesRes.error;
      if (invalidationsRes.error) throw invalidationsRes.error;
      setRoster((rosterRes.data as Profile[]) ?? []);
      setMyCases((casesRes.data as Escalation[]) ?? []);
      setActivePauses((pausesRes.data as SchedulePause[]) ?? []);
      setInvalidations((invalidationsRes.data as BatchInvalidation[]) ?? []);
    } catch (err) {
      console.error(err);
      setRosterError("Could not load escalation data.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCase() {
    if (!caseType || !caseReason.trim()) return;
    setCaseBusy(true);
    setCaseError(null);
    try {
      const { error } = await supabase.from("escalations").insert({
        raised_by: profileId,
        washer_id: caseWasherId || null,
        case_type: caseType,
        reason: caseReason.trim(),
        details: caseDetails.trim() || null,
      });
      if (error) throw error;
      await logActivity(profileId, "escalation", `Case raised: ${CASE_TYPE_LABEL[caseType]}`, {
        details: caseReason.trim(),
      });
      setCaseWasherId("");
      setCaseType(null);
      setCaseReason("");
      setCaseDetails("");
      await load();
    } catch (err) {
      console.error(err);
      setCaseError("Could not raise the case. Please try again.");
    } finally {
      setCaseBusy(false);
    }
  }

  async function submitPause() {
    if (!pauseWasherId || !pauseReason.trim()) return;
    setPauseBusy(true);
    setPauseError(null);
    try {
      const { error } = await supabase.from("schedule_pauses").insert({
        washer_id: pauseWasherId,
        reason: pauseReason.trim(),
        paused_by: profileId,
      });
      if (error) throw error;
      await notify(pauseWasherId, "Your schedule has been paused", pauseReason.trim());
      await logActivity(profileId, "escalation", "Washer schedule paused", { details: pauseReason.trim() });
      setPauseWasherId("");
      setPauseReason("");
      await load();
    } catch (err) {
      console.error(err);
      setPauseError("Could not pause the schedule. Please try again.");
    } finally {
      setPauseBusy(false);
    }
  }

  async function resumePause(pause: SchedulePause) {
    setResumeBusyId(pause.id);
    setPauseError(null);
    try {
      const { error } = await supabase
        .from("schedule_pauses")
        .update({ resumed_at: new Date().toISOString() })
        .eq("id", pause.id);
      if (error) throw error;
      await notify(pause.washer_id, "Your schedule has been resumed");
      await logActivity(profileId, "escalation", "Washer schedule resumed");
      await load();
    } catch (err) {
      console.error(err);
      setPauseError("Could not resume the schedule. Please try again.");
    } finally {
      setResumeBusyId(null);
    }
  }

  async function submitBatchInvalidation() {
    if (!batchId.trim() || !batchReason.trim()) return;
    setBatchBusy(true);
    setBatchError(null);
    try {
      const { error } = await supabase.from("batch_invalidations").insert({
        batch_id: batchId.trim(),
        reason: batchReason.trim(),
        invalidated_by: profileId,
      });
      if (error) throw error;
      await logActivity(profileId, "escalation", "Batch invalidated", {
        details: `${batchId.trim()} — ${batchReason.trim()}`,
      });
      setBatchId("");
      setBatchReason("");
      await load();
    } catch (err) {
      console.error(err);
      setBatchError("Could not log the invalidation. Please try again.");
    } finally {
      setBatchBusy(false);
    }
  }

  function washerName(id: string | null) {
    if (!id) return "—";
    return roster.find((w) => w.id === id)?.full_name ?? "Unknown";
  }

  if (loading) {
    return (
      <div className="px-4 pb-4 bg-white">
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      </div>
    );
  }
  if (rosterError) {
    return (
      <div className="px-4 pb-4 bg-white">
        <p className="text-sm text-red-600 py-1">{rosterError}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Raise a Case</p>
        <select
          value={caseWasherId}
          onChange={(e) => setCaseWasherId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          <option value="">Washer (optional)</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CASE_TYPE_LABEL) as EscalationCaseType[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCaseType(c)}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold text-left ${
                caseType === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {CASE_TYPE_LABEL[c]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={caseReason}
          onChange={(e) => setCaseReason(e.target.value)}
          placeholder="Reason"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={caseDetails}
          onChange={(e) => setCaseDetails(e.target.value)}
          placeholder="Details (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {caseError && <p className="text-sm text-red-600">{caseError}</p>}
        <button
          onClick={submitCase}
          disabled={caseBusy || !caseType || !caseReason.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {caseBusy ? "Raising…" : "Raise Case"}
        </button>
        {myCases.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {myCases.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {CASE_TYPE_LABEL[c.case_type]} · {washerName(c.washer_id)}
                </span>
                <span className={`font-bold ${c.status === "resolved" ? "text-green-600" : "text-blue-600"}`}>
                  {c.status === "resolved" ? "Resolved" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pause / Resume Washer Schedule</p>
        <select
          value={pauseWasherId}
          onChange={(e) => setPauseWasherId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          <option value="">Select washer…</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={pauseReason}
          onChange={(e) => setPauseReason(e.target.value)}
          placeholder="Reason"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {pauseError && <p className="text-sm text-red-600">{pauseError}</p>}
        <button
          onClick={submitPause}
          disabled={pauseBusy || !pauseWasherId || !pauseReason.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {pauseBusy ? "Pausing…" : "Pause Schedule"}
        </button>
        {activePauses.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Currently Paused</p>
            {activePauses.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700 min-w-0 truncate">
                  {washerName(p.washer_id)} · {p.reason}
                </span>
                <button
                  onClick={() => resumePause(p)}
                  disabled={resumeBusyId === p.id}
                  className="flex-shrink-0 rounded-xl border border-gray-300 disabled:opacity-50 font-bold text-gray-900 px-3 py-1.5 text-xs"
                >
                  {resumeBusyId === p.id ? "…" : "Resume"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Batch Invalidation</p>
        <p className="text-xs text-gray-400">
          Logs the invalidation; this app has no batch-linked job creation to cascade to.
        </p>
        <input
          type="text"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          placeholder="Batch ID"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={batchReason}
          onChange={(e) => setBatchReason(e.target.value)}
          placeholder="Reason"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {batchError && <p className="text-sm text-red-600">{batchError}</p>}
        <button
          onClick={submitBatchInvalidation}
          disabled={batchBusy || !batchId.trim() || !batchReason.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {batchBusy ? "Logging…" : "Invalidate Batch"}
        </button>
        {invalidations.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {invalidations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {inv.batch_id} · {inv.reason}
                </span>
                <span className="text-gray-400 text-xs">{new Date(inv.created_at).toLocaleDateString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EscalationMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Escalation & Case Management" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <EscalationPanel profileId={profileId} />}
    </>
  );
}
