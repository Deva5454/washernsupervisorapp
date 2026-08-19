import { useEffect, useState } from "react";
import { Repeat, Scan } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { ClothUnit, StockItem } from "../../lib/types";

export default function Stock() {
  const { profile } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [clothUnits, setClothUnits] = useState<ClothUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [usedReturned, setUsedReturned] = useState("");
  const [newReceived, setNewReceived] = useState("");
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeSent, setExchangeSent] = useState(false);

  const [checkOutBarcode, setCheckOutBarcode] = useState("");
  const [checkOutBusy, setCheckOutBusy] = useState(false);
  const [checkOutError, setCheckOutError] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const [stockRes, clothRes] = await Promise.all([
        supabase.from("stock_items").select("*").eq("washer_id", profile.id).order("material_name"),
        supabase.from("cloth_units").select("*").eq("washer_id", profile.id).order("updated_at", { ascending: false }),
      ]);
      if (stockRes.error) throw stockRes.error;
      if (clothRes.error) throw clothRes.error;
      setItems((stockRes.data ?? []) as StockItem[]);
      setClothUnits((clothRes.data ?? []) as ClothUnit[]);
    } catch (err) {
      console.error(err);
      setError("Could not load stock.");
    } finally {
      setLoading(false);
    }
  }

  // Barcode-tracked cloths, alongside the aggregate Cloth Hand-Over form
  // below — this follows individual cloths through clean/dirty states
  // rather than just a running count. No camera-based barcode scanning
  // here (would need a scanning library this project doesn't have);
  // barcodes are entered/pasted from whatever scanner or label the
  // washer already has.
  async function checkOutCloth() {
    if (!profile || !checkOutBarcode.trim()) return;
    const barcode = checkOutBarcode.trim();
    setCheckOutBusy(true);
    setCheckOutError(null);
    try {
      const { data: existing, error: findErr } = await supabase
        .from("cloth_units")
        .select("*")
        .eq("barcode", barcode)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existing) {
        if (existing.washer_id && existing.washer_id !== profile.id) {
          setCheckOutError("This cloth is already checked out to someone else.");
          return;
        }
        if (existing.state !== "clean") {
          setCheckOutError(`This cloth is marked ${existing.state} — it can't be checked out.`);
          return;
        }
        const { error: updateErr } = await supabase
          .from("cloth_units")
          .update({ washer_id: profile.id, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from("cloth_units")
          .insert({ barcode, washer_id: profile.id, state: "clean" });
        if (insertErr) throw insertErr;
      }
      setCheckOutBarcode("");
      await load();
    } catch (err) {
      console.error(err);
      setCheckOutError("Could not check out this cloth. Please try again.");
    } finally {
      setCheckOutBusy(false);
    }
  }

  async function returnCloth(unit: ClothUnit) {
    setReturningId(unit.id);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("cloth_units")
        .update({
          washer_id: null,
          state: "dirty",
          wash_count: unit.wash_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", unit.id);
      if (updateErr) throw updateErr;
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not return this cloth. Please try again.");
    } finally {
      setReturningId(null);
    }
  }

  async function requestReplenishment() {
    if (!profile) return;
    setRequesting(true);
    setRequestSent(false);
    setError(null);
    try {
      const { error } = await supabase.from("issues").insert({
        reported_by: profile.id,
        title: "Stock replenishment requested",
      });
      if (error) throw error;
      setRequestSent(true);
    } catch (err) {
      console.error(err);
      setError("Could not send the request. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  // Logs a used-cloths-for-new-cloths hand-over with the supervisor, and
  // credits the received cloths back into stock. new_received is capped
  // by profile.cloth_limit when set — that limit is owned and set by the
  // City Manager role in the separate ERP app this app connects to; this
  // app only reads and respects it, never edits it.
  async function submitExchange() {
    if (!profile) return;
    const used = parseInt(usedReturned, 10);
    const received = parseInt(newReceived, 10);
    if (!Number.isFinite(used) || used < 0 || !Number.isFinite(received) || received < 0) return;
    if (profile.cloth_limit != null && received > profile.cloth_limit) {
      setExchangeError(`Can't exceed the hand-over limit of ${profile.cloth_limit} cloths.`);
      return;
    }
    setExchangeBusy(true);
    setExchangeError(null);
    setExchangeSent(false);
    try {
      const { error: insertErr } = await supabase.from("cloth_exchanges").insert({
        washer_id: profile.id,
        used_returned: used,
        new_received: received,
      });
      if (insertErr) throw insertErr;

      const clothItem = items.find((i) => i.material_name.toLowerCase().includes("cloth"));
      if (clothItem && received > 0) {
        const { error: updateErr } = await supabase
          .from("stock_items")
          .update({ remaining_qty: clothItem.remaining_qty + received })
          .eq("id", clothItem.id);
        if (updateErr) throw updateErr;
      }

      setExchangeSent(true);
      setUsedReturned("");
      setNewReceived("");
      setExchangeOpen(false);
      await load();
    } catch (err) {
      console.error(err);
      setExchangeError("Could not log the hand-over. Please try again.");
    } finally {
      setExchangeBusy(false);
    }
  }

  if (!profile) return null;

  if (loading) {
    return <div className="text-center text-gray-400">Loading…</div>;
  }

  return (
    <div className="pb-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-gray-900">My Stock</h1>

      {error && (
        <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
          No stock items assigned
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const low = item.remaining_qty <= item.reorder_level;
            return (
              <div
                key={item.id}
                className="rounded-2xl bg-gray-100 px-4 py-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-extrabold text-gray-900">{item.material_name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Remaining {item.remaining_qty} {item.unit} · Reorder at {item.reorder_level}{" "}
                    {item.unit}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap shrink-0 ${
                    low ? "bg-blue-600 text-white" : "border border-blue-600 text-blue-600"
                  }`}
                >
                  {low ? "Low" : "OK"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-gray-100 px-4 py-4 space-y-3">
        <p className="flex items-center gap-2 font-bold text-gray-900">
          <Scan className="h-4 w-4 text-blue-600" />
          My Cloths
        </p>
        {clothUnits.length === 0 ? (
          <p className="text-sm text-gray-400">No cloths checked out to you.</p>
        ) : (
          <div className="space-y-2">
            {clothUnits.map((unit) => (
              <div key={unit.id} className="bg-white rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">{unit.barcode}</p>
                  <p className="text-xs text-gray-500">
                    {unit.wash_count} wash{unit.wash_count === 1 ? "" : "es"}
                  </p>
                </div>
                <button
                  onClick={() => returnCloth(unit)}
                  disabled={returningId === unit.id}
                  className="flex-shrink-0 rounded-full border border-gray-300 text-xs font-bold px-3 py-1.5 text-gray-900 disabled:opacity-50"
                >
                  {returningId === unit.id ? "Returning…" : "Return (Dirty)"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-2 border-t border-gray-200">
          <input
            type="text"
            value={checkOutBarcode}
            onChange={(e) => setCheckOutBarcode(e.target.value)}
            placeholder="Scan or enter cloth barcode"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={checkOutCloth}
            disabled={!checkOutBarcode.trim() || checkOutBusy}
            className="flex-shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-4"
          >
            {checkOutBusy ? "…" : "Check Out"}
          </button>
        </div>
        {checkOutError && <p className="text-sm text-red-600">{checkOutError}</p>}
      </div>

      <div className="rounded-2xl bg-gray-100 px-4 py-4">
        <button
          onClick={() => {
            setExchangeOpen((v) => !v);
            setExchangeError(null);
          }}
          className="w-full flex items-center justify-between"
        >
          <span className="flex items-center gap-2 font-bold text-gray-900">
            <Repeat className="h-4 w-4 text-blue-600" />
            Cloth Hand-Over
          </span>
          <span className="text-sm text-blue-600 font-bold">{exchangeOpen ? "Close" : "Log"}</span>
        </button>

        {profile.cloth_limit != null && (
          <p className="text-xs text-gray-400 mt-1">
            Hand-over limit: {profile.cloth_limit} cloths (set by City Manager)
          </p>
        )}

        {exchangeOpen && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500">Used returned</label>
                <input
                  type="number"
                  min={0}
                  value={usedReturned}
                  onChange={(e) => setUsedReturned(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">New received</label>
                <input
                  type="number"
                  min={0}
                  max={profile.cloth_limit ?? undefined}
                  value={newReceived}
                  onChange={(e) => setNewReceived(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                  placeholder="0"
                />
              </div>
            </div>
            {exchangeError && <p className="text-sm text-red-600">{exchangeError}</p>}
            <button
              onClick={submitExchange}
              disabled={exchangeBusy || (!usedReturned && !newReceived)}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
            >
              {exchangeBusy ? "Logging…" : "Confirm Hand-Over"}
            </button>
          </div>
        )}
      </div>

      {exchangeSent && (
        <div className="rounded-2xl bg-green-50 text-green-700 text-sm px-4 py-3 text-center">
          Hand-over logged.
        </div>
      )}

      <button
        onClick={requestReplenishment}
        disabled={requesting}
        className="w-full rounded-2xl border-2 border-gray-900 text-gray-900 font-extrabold py-4 disabled:opacity-50"
      >
        {requesting ? "Sending…" : "Request Replenishment"}
      </button>

      {requestSent && (
        <div className="rounded-2xl bg-green-50 text-green-700 text-sm px-4 py-3 text-center">
          Request sent to your supervisor.
        </div>
      )}
    </div>
  );
}
