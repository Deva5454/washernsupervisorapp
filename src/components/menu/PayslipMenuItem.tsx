import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import type { Payslip } from "../../lib/types";

function formatMonth(month: string) {
  return new Date(month).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function PayslipPanel({ profileId }: { profileId: string }) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("payslips")
          .select("*")
          .eq("profile_id", profileId)
          .order("month", { ascending: false })
          .limit(12);
        if (error) throw error;
        if (!cancelled) setPayslips((data ?? []) as Payslip[]);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load payslips.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return (
    <div className="px-4 pb-4 bg-white">
      {loading ? (
        <p className="text-sm text-gray-400 py-3">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-3">{error}</p>
      ) : payslips.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">No payslips available yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {payslips.map((p) => (
            <div key={p.id} className="py-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900">{formatMonth(p.month)}</p>
                <p className="font-extrabold text-gray-900">₹{p.net.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                <span>Gross: ₹{p.gross.toLocaleString("en-IN")}</span>
                <span>Deductions: ₹{p.deductions.toLocaleString("en-IN")}</span>
              </div>
              {p.notes && <p className="text-xs text-gray-400 mt-1">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PayslipMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="My Payslip" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <PayslipPanel profileId={profileId} />}
    </>
  );
}
