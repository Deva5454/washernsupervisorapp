import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { logActivity } from "../../lib/activityLog";
import type { StockItem } from "../../lib/types";

// A lighter version of the hand-over form on the washer's Stock page —
// mounted for both washer and supervisor More.tsx pages. For a washer,
// this credits stock_items the same way Stock.tsx's own form does.
function ClothExchangePanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [usedReturned, setUsedReturned] = useState("");
  const [newReceived, setNewReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function loadItems() {
    const { data, error: loadErr } = await supabase
      .from("stock_items")
      .select("*")
      .eq("washer_id", profileId)
      .order("material_name");
    if (loadErr) {
      console.error(loadErr);
      return;
    }
    setItems((data ?? []) as StockItem[]);
  }

  async function submit() {
    const used = parseInt(usedReturned, 10);
    const received = parseInt(newReceived, 10);
    if (!Number.isFinite(used) || used < 0 || !Number.isFinite(received) || received < 0) {
      setError("Enter both quantities.");
      return;
    }
    if (profile?.cloth_limit != null && received > profile.cloth_limit) {
      setError(`Can't exceed the hand-over limit of ${profile.cloth_limit} cloths.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    setWarning(null);
    try {
      const { error } = await supabase.from("cloth_exchanges").insert({
        washer_id: profileId,
        used_returned: used,
        new_received: received,
      });
      if (error) throw error;

      const clothItem = items.find((i) => i.material_name.toLowerCase().includes("cloth"));
      if (clothItem && received > 0) {
        const { error: updateErr } = await supabase
          .from("stock_items")
          .update({ remaining_qty: clothItem.remaining_qty + received })
          .eq("id", clothItem.id);
        if (updateErr) throw updateErr;
      } else if (received > 0) {
        setWarning("Hand-over logged, but no matching stock item was found to credit — check with your supervisor.");
      }

      await logActivity(profileId, "cloth", "Cloth hand-over logged", {
        details: `Used ${used} · Received ${received}`,
      });

      setSent(true);
      setUsedReturned("");
      setNewReceived("");
      await loadItems();
    } catch (err) {
      console.error(err);
      setError("Could not log the hand-over. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-3">
      {profile?.cloth_limit != null && (
        <p className="text-xs text-gray-400">Hand-over limit: {profile.cloth_limit} cloths</p>
      )}
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
            max={profile?.cloth_limit ?? undefined}
            value={newReceived}
            onChange={(e) => setNewReceived(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            placeholder="0"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || (!usedReturned && !newReceived)}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
      >
        {busy ? "Logging…" : "Confirm Hand-Over"}
      </button>
      {sent && (
        <p className={`text-sm ${warning ? "text-amber-700" : "text-green-700"}`}>
          {warning ?? "Hand-over logged."}
        </p>
      )}
    </div>
  );
}

export function ClothExchangeMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Cloth Exchange" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <ClothExchangePanel profileId={profileId} />}
    </>
  );
}
