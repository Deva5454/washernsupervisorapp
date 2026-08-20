import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { logActivity } from "../../lib/activityLog";
import type { CashRegister } from "../../lib/types";

function isoDate(d: Date) {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function grandTotal(r: CashRegister) {
  return Number(r.cash_total) + Number(r.upi_total) + Number(r.link_total);
}

function CashRegisterPanel({ profileId }: { profileId: string }) {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cashTotal, setCashTotal] = useState("");
  const [upiTotal, setUpiTotal] = useState("");
  const [linkTotal, setLinkTotal] = useState("");
  const [depositReference, setDepositReference] = useState("");
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
        .from("cash_registers")
        .select("*")
        .eq("supervisor_id", profileId)
        .order("shift_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      setRegisters((data as CashRegister[]) ?? []);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load past registers.");
    } finally {
      setLoading(false);
    }
  }

  const total = (Number(cashTotal) || 0) + (Number(upiTotal) || 0) + (Number(linkTotal) || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!depositReference.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("cash_registers").insert({
        supervisor_id: profileId,
        shift_date: isoDate(new Date()),
        cash_total: Number(cashTotal) || 0,
        upi_total: Number(upiTotal) || 0,
        link_total: Number(linkTotal) || 0,
        deposit_reference: depositReference.trim(),
      });
      if (error) {
        if (error.code === "23505") throw new Error("DUPLICATE");
        throw error;
      }

      await logActivity(profileId, "other", "Shift cash register submitted", {
        details: `Total ₹${total.toFixed(2)} (ref ${depositReference.trim()})`,
      });

      setSent(true);
      setCashTotal("");
      setUpiTotal("");
      setLinkTotal("");
      setDepositReference("");
      await load();
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === "DUPLICATE") {
        setSubmitError("You've already submitted today's register.");
      } else {
        setSubmitError("Could not submit this register. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs font-bold text-gray-500">Cash</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={cashTotal}
              onChange={(e) => setCashTotal(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">UPI</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={upiTotal}
              onChange={(e) => setUpiTotal(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Link</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={linkTotal}
              onChange={(e) => setLinkTotal(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        <div className="flex items-center justify-between bg-gray-100 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-gray-500">Grand Total</span>
          <span className="text-lg font-extrabold text-gray-900">₹{total.toFixed(2)}</span>
        </div>

        <input
          type="text"
          value={depositReference}
          onChange={(e) => setDepositReference(e.target.value)}
          placeholder="Deposit reference"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !depositReference.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Submitting…" : "Submit Today's Register"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {sent && <p className="text-sm text-green-700">Register submitted.</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        registers.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Registers</p>
            {registers.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {new Date(r.shift_date).toLocaleDateString("en-IN")} · {r.deposit_reference}
                </span>
                <span className="font-bold text-gray-900">₹{grandTotal(r).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function CashRegisterMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Shift Cash Register" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <CashRegisterPanel profileId={profileId} />}
    </>
  );
}
