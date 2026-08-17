import { useEffect, useState } from "react";
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

  if (!profile) return null;

  if (loading) {
    return <div className="px-4 pt-6 text-center text-gray-400">Loading…</div>;
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
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
