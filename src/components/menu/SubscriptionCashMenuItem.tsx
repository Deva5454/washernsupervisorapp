import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { logActivity } from "../../lib/activityLog";
import type { SubscriptionCashDeposit } from "../../lib/types";

function SubscriptionCashPanel({ profileId }: { profileId: string }) {
  const [deposits, setDeposits] = useState<SubscriptionCashDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
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
        .from("subscription_cash_deposits")
        .select("*")
        .eq("supervisor_id", profileId)
        .order("deposited_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      setDeposits((data as SubscriptionCashDeposit[]) ?? []);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load past deposits.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!customerName.trim() || !Number.isFinite(amt) || amt <= 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("subscription_cash_deposits").insert({
        supervisor_id: profileId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        amount: amt,
        bank_reference: bankReference.trim() || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;

      await logActivity(profileId, "other", "Subscription cash deposit recorded", {
        details: `${customerName.trim()} · ₹${amt.toFixed(2)}`,
      });

      setSent(true);
      setCustomerName("");
      setCustomerPhone("");
      setAmount("");
      setBankReference("");
      setNotes("");
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not record this deposit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="Customer phone (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
          placeholder="Bank reference (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !customerName.trim() || !amount}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Saving…" : "Record Deposit"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {sent && <p className="text-sm text-green-700">Deposit recorded.</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        deposits.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Deposits</p>
            {deposits.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{d.customer_name}</span>
                <div className="text-right">
                  <p className="font-bold text-gray-900">₹{Number(d.amount).toFixed(2)}</p>
                  <p className="text-gray-500 text-xs">{new Date(d.deposited_at).toLocaleDateString("en-IN")}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function SubscriptionCashMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Subscription Cash Deposit" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <SubscriptionCashPanel profileId={profileId} />}
    </>
  );
}
