import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { notify } from "../../lib/notify";
import { logActivity } from "../../lib/activityLog";
import type { Profile, SupervisorStock } from "../../lib/types";

function MaterialManagementPanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [buffer, setBuffer] = useState<SupervisorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [issueWasherId, setIssueWasherId] = useState("");
  const [issueMaterial, setIssueMaterial] = useState("");
  const [issueQty, setIssueQty] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueSent, setIssueSent] = useState(false);

  const [refillMaterial, setRefillMaterial] = useState("");
  const [refillQty, setRefillQty] = useState("");
  const [refillReason, setRefillReason] = useState("");
  const [refillBusy, setRefillBusy] = useState(false);
  const [refillError, setRefillError] = useState<string | null>(null);
  const [refillSent, setRefillSent] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      let rosterQuery = supabase.from("profiles").select("*").eq("role", "washer");
      if (profile?.zone) rosterQuery = rosterQuery.eq("zone", profile.zone);
      const [rosterRes, bufferRes] = await Promise.all([
        rosterQuery.order("full_name"),
        supabase.from("supervisor_stock").select("*").eq("supervisor_id", profileId).order("material_name"),
      ]);
      if (rosterRes.error) throw rosterRes.error;
      if (bufferRes.error) throw bufferRes.error;
      setRoster((rosterRes.data as Profile[]) ?? []);
      setBuffer((bufferRes.data as SupervisorStock[]) ?? []);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load buffer stock.");
    } finally {
      setLoading(false);
    }
  }

  async function submitIssue() {
    const qty = Number(issueQty);
    if (!issueWasherId || !issueMaterial || !Number.isFinite(qty) || qty <= 0) return;
    const stockRow = buffer.find((b) => b.material_name === issueMaterial);
    if (!stockRow) return;
    if (qty > stockRow.buffer_qty) {
      setIssueError(`Only ${stockRow.buffer_qty} ${stockRow.unit} available in your buffer.`);
      return;
    }
    setIssueBusy(true);
    setIssueError(null);
    setIssueSent(false);
    try {
      const { error: insertErr } = await supabase.from("material_issuances").insert({
        supervisor_id: profileId,
        washer_id: issueWasherId,
        material_name: issueMaterial,
        qty,
      });
      if (insertErr) throw insertErr;

      const nextQty = Math.max(0, stockRow.buffer_qty - qty);
      const { error: updateErr } = await supabase
        .from("supervisor_stock")
        .update({ buffer_qty: nextQty, updated_at: new Date().toISOString() })
        .eq("id", stockRow.id);
      if (updateErr) throw updateErr;

      const washer = roster.find((w) => w.id === issueWasherId);
      await notify(issueWasherId, "Materials issued", `${qty} ${stockRow.unit} of ${issueMaterial} issued to you.`);
      await logActivity(profileId, "cloth", "Material issued to washer", {
        details: `${issueMaterial} · ${qty} ${stockRow.unit} → ${washer?.full_name ?? issueWasherId}`,
      });

      setIssueSent(true);
      setIssueWasherId("");
      setIssueMaterial("");
      setIssueQty("");
      await load();
    } catch (err) {
      console.error(err);
      setIssueError("Could not issue materials. Please try again.");
    } finally {
      setIssueBusy(false);
    }
  }

  async function submitRefillRequest() {
    const qty = Number(refillQty);
    if (!refillMaterial.trim() || !Number.isFinite(qty) || qty <= 0) return;
    setRefillBusy(true);
    setRefillError(null);
    setRefillSent(false);
    try {
      const { error } = await supabase.from("stock_requests").insert({
        profile_id: profileId,
        material_name: refillMaterial.trim(),
        requested_qty: qty,
        reason: refillReason.trim() || null,
      });
      if (error) throw error;
      setRefillSent(true);
      setRefillMaterial("");
      setRefillQty("");
      setRefillReason("");
    } catch (err) {
      console.error(err);
      setRefillError("Could not send the refill request. Please try again.");
    } finally {
      setRefillBusy(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-5">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">My Buffer</p>
        {loading ? (
          <p className="text-sm text-gray-400 py-1">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600 py-1">{loadError}</p>
        ) : buffer.length === 0 ? (
          <p className="text-sm text-gray-400">No buffer stock on file yet.</p>
        ) : (
          <div className="space-y-1.5">
            {buffer.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{b.material_name}</span>
                <span className="font-bold text-gray-900">
                  {b.buffer_qty} {b.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Issue to Washer</p>
        <select
          value={issueWasherId}
          onChange={(e) => setIssueWasherId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          <option value="">Select washer…</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
        <select
          value={issueMaterial}
          onChange={(e) => setIssueMaterial(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          <option value="">Select material…</option>
          {buffer.map((b) => (
            <option key={b.id} value={b.material_name}>
              {b.material_name} ({b.buffer_qty} {b.unit} left)
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={issueQty}
          onChange={(e) => setIssueQty(e.target.value)}
          placeholder="Quantity"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {issueError && <p className="text-sm text-red-600">{issueError}</p>}
        <button
          onClick={submitIssue}
          disabled={issueBusy || !issueWasherId || !issueMaterial || !issueQty}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {issueBusy ? "Issuing…" : "Issue Materials"}
        </button>
        {issueSent && <p className="text-sm text-green-700">Materials issued and logged.</p>}
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Request Refill from Branch</p>
        <input
          type="text"
          value={refillMaterial}
          onChange={(e) => setRefillMaterial(e.target.value)}
          placeholder="Material name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={refillQty}
          onChange={(e) => setRefillQty(e.target.value)}
          placeholder="Quantity needed"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={refillReason}
          onChange={(e) => setRefillReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {refillError && <p className="text-sm text-red-600">{refillError}</p>}
        <button
          onClick={submitRefillRequest}
          disabled={refillBusy || !refillMaterial.trim() || !refillQty}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {refillBusy ? "Sending…" : "Send Refill Request"}
        </button>
        {refillSent && <p className="text-sm text-green-700">Refill request sent to Branch.</p>}
      </div>

      <div className="pt-3 border-t border-gray-100">
        <p className="text-sm text-gray-600">
          To report broken equipment, use{" "}
          <Link to="/supervisor/alerts" className="text-blue-600 font-bold">
            Report Incident in Alert Center
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function MaterialManagementMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Buffer Stock / Material Management" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <MaterialManagementPanel profileId={profileId} />}
    </>
  );
}
