import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { uploadPhoto } from "../../lib/uploadPhoto";
import type { ExpenseCategory, ExpenseClaim } from "../../lib/types";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: "Travel",
  medical: "Medical",
  fuel: "Fuel",
  other: "Other",
};

function ExpenseClaimsPanel({ profileId }: { profileId: string }) {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState<ExpenseCategory>("travel");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
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
        .from("expense_claims")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setClaims((data ?? []) as ExpenseClaim[]);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load expense claims.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      let receiptUrl: string | null = null;
      if (receipt) receiptUrl = await uploadPhoto(receipt, "expense-receipts");
      const { error } = await supabase.from("expense_claims").insert({
        profile_id: profileId,
        category,
        amount: amt,
        description: description.trim() || null,
        from_location: category === "travel" ? fromLocation.trim() || null : null,
        to_location: category === "travel" ? toLocation.trim() || null : null,
        distance_km: category === "travel" && distanceKm ? Number(distanceKm) : null,
        receipt_url: receiptUrl,
      });
      if (error) throw error;
      setSent(true);
      setAmount("");
      setDescription("");
      setFromLocation("");
      setToLocation("");
      setDistanceKm("");
      setReceipt(null);
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not submit your claim. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-xl px-2 py-2 text-xs font-bold ${
                category === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        {category === "travel" && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={fromLocation}
              onChange={(e) => setFromLocation(e.target.value)}
              placeholder="From"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
            />
            <input
              type="text"
              value={toLocation}
              onChange={(e) => setToLocation(e.target.value)}
              placeholder="To"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
            />
            <input
              type="number"
              inputMode="decimal"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="Distance (km)"
              className="col-span-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
            />
          </div>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (₹)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <label className="block text-xs font-bold text-gray-500">
          Receipt photo (optional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-xs text-gray-600"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !amount}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Submit Claim"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {sent && <p className="text-sm text-green-700">Claim sent to your supervisor.</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        claims.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Claims</p>
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {CATEGORY_LABEL[c.category]} · ₹{c.amount.toLocaleString("en-IN")}
                </span>
                <span
                  className={`font-bold ${
                    c.status === "approved"
                      ? "text-green-600"
                      : c.status === "rejected"
                        ? "text-red-600"
                        : "text-blue-600"
                  }`}
                >
                  {c.status[0].toUpperCase() + c.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function ExpenseClaimsMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Travel & Expense Claims" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <ExpenseClaimsPanel profileId={profileId} />}
    </>
  );
}
