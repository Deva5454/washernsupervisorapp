import { useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

// A lighter version of the hand-over form on the washer's Stock page —
// this one just logs the exchange (cloth_exchanges), it doesn't credit
// a stock_items row, since stock_items is washer-operational inventory
// that a supervisor doesn't have one of.
function ClothExchangePanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [usedReturned, setUsedReturned] = useState("");
  const [newReceived, setNewReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    const used = parseInt(usedReturned, 10);
    const received = parseInt(newReceived, 10);
    if (!Number.isFinite(used) || used < 0 || !Number.isFinite(received) || received < 0) return;
    if (profile?.cloth_limit != null && received > profile.cloth_limit) {
      setError(`Can't exceed the hand-over limit of ${profile.cloth_limit} cloths.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("cloth_exchanges").insert({
        washer_id: profileId,
        used_returned: used,
        new_received: received,
      });
      if (error) throw error;
      setSent(true);
      setUsedReturned("");
      setNewReceived("");
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
      {sent && <p className="text-sm text-green-700">Hand-over logged.</p>}
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
