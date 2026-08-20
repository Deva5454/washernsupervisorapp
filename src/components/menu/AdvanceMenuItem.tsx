import { useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";

function RequestAdvance({ profileId }: { profileId: string }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("advance_requests").insert({
        washer_id: profileId,
        amount: amt,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      setSent(true);
      setAmount("");
      setReason("");
    } catch (err) {
      console.error(err);
      setError("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      <form onSubmit={handleSubmit} className="space-y-2 pt-1">
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (₹)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !amount}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {sent && <p className="text-sm text-green-700 mt-2">Request sent to your supervisor.</p>}
    </div>
  );
}

export function AdvanceMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Request Advance" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <RequestAdvance profileId={profileId} />}
    </>
  );
}
