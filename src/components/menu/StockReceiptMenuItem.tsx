import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { logActivity } from "../../lib/activityLog";
import type { StockReceipt } from "../../lib/types";

function StockReceiptPanel({ profileId }: { profileId: string }) {
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [challanNumber, setChallanNumber] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [receivedQty, setReceivedQty] = useState("");
  const [damagedQty, setDamagedQty] = useState("0");
  const [shortfallNotes, setShortfallNotes] = useState("");
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
        .from("stock_receipts")
        .select("*")
        .eq("supervisor_id", profileId)
        .order("received_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      setReceipts((data ?? []) as StockReceipt[]);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load stock receipts.");
    } finally {
      setLoading(false);
    }
  }

  // Credits the net (received - damaged) amount into this supervisor's
  // own buffer, matching resolveRegularization's select-then-update/insert
  // approach rather than a Postgres upsert.
  async function creditBuffer(material: string, net: number) {
    const { data: existing, error: findErr } = await supabase
      .from("supervisor_stock")
      .select("id, buffer_qty")
      .eq("supervisor_id", profileId)
      .eq("material_name", material)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      const { error: updateErr } = await supabase
        .from("supervisor_stock")
        .update({ buffer_qty: existing.buffer_qty + net, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase.from("supervisor_stock").insert({
        supervisor_id: profileId,
        material_name: material,
        buffer_qty: net,
        unit: "units",
      });
      if (insertErr) throw insertErr;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const received = Number(receivedQty);
    const damaged = Number(damagedQty) || 0;
    if (!challanNumber.trim() || !materialName.trim() || !Number.isFinite(received) || received < 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const material = materialName.trim();
      const { error } = await supabase.from("stock_receipts").insert({
        supervisor_id: profileId,
        challan_number: challanNumber.trim(),
        material_name: material,
        received_qty: received,
        damaged_qty: damaged,
        shortfall_notes: shortfallNotes.trim() || null,
      });
      if (error) throw error;

      const net = received - damaged;
      if (net > 0) await creditBuffer(material, net);

      await logActivity(profileId, "cloth", "Stock receipt confirmed", {
        details: `${material} · received ${received}, damaged ${damaged} (challan ${challanNumber.trim()})`,
      });

      setSent(true);
      setChallanNumber("");
      setMaterialName("");
      setReceivedQty("");
      setDamagedQty("0");
      setShortfallNotes("");
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not record this receipt. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={challanNumber}
          onChange={(e) => setChallanNumber(e.target.value)}
          placeholder="Challan number"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={materialName}
          onChange={(e) => setMaterialName(e.target.value)}
          placeholder="Material name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-gray-500">Received qty</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={receivedQty}
              onChange={(e) => setReceivedQty(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Damaged qty</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={damagedQty}
              onChange={(e) => setDamagedQty(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>
        <input
          type="text"
          value={shortfallNotes}
          onChange={(e) => setShortfallNotes(e.target.value)}
          placeholder="Shortfall notes (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !challanNumber.trim() || !materialName.trim() || !receivedQty}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Saving…" : "Record Receipt"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {sent && <p className="text-sm text-green-700">Receipt recorded and buffer updated.</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        receipts.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Receipts</p>
            {receipts.map((r) => (
              <div key={r.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">{r.material_name}</span>
                  <span className="text-gray-500">{new Date(r.received_at).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="text-gray-500">
                  Challan {r.challan_number} · Received {r.received_qty} · Damaged {r.damaged_qty}
                </p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function StockReceiptMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Stock Receipt from Branch" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <StockReceiptPanel profileId={profileId} />}
    </>
  );
}
