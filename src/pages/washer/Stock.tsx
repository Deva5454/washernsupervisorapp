import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { StockItem } from "../../lib/types";

export default function Stock() {
  const { profile } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
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
      const { data, error } = await supabase
        .from("stock_items")
        .select("*")
        .eq("washer_id", profile.id)
        .order("material_name", { ascending: true });
      if (error) throw error;
      setItems((data ?? []) as StockItem[]);
    } catch (err) {
      console.error(err);
      setError("Could not load stock.");
    } finally {
      setLoading(false);
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
