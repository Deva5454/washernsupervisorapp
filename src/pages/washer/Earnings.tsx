import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { Payout } from "../../lib/types";

export default function Earnings() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekTotal, setWeekTotal] = useState(0);
  const [doneToday, setDoneToday] = useState(0);
  const [payouts, setPayouts] = useState<Payout[]>([]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const [weekRes, doneRes, recentRes] = await Promise.all([
          supabase
            .from("payouts")
            .select("amount")
            .eq("washer_id", profile!.id)
            .gte("payout_date", weekAgo)
            .lte("payout_date", today),
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("washer_id", profile!.id)
            .eq("job_date", today)
            .eq("status", "done"),
          supabase
            .from("payouts")
            .select("*")
            .eq("washer_id", profile!.id)
            .order("payout_date", { ascending: false })
            .limit(10),
        ]);

        if (weekRes.error) throw weekRes.error;
        if (doneRes.error) throw doneRes.error;
        if (recentRes.error) throw recentRes.error;
        if (cancelled) return;

        setWeekTotal((weekRes.data ?? []).reduce((acc, p) => acc + Number(p.amount), 0));
        setDoneToday(doneRes.count ?? 0);
        setPayouts((recentRes.data ?? []) as Payout[]);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load earnings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (!profile) return null;

  if (loading) {
    return <div className="px-4 pt-6 text-center text-gray-400">Loading…</div>;
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <h1 className="text-2xl font-extrabold text-gray-900">Earnings & Incentives</h1>

      {error && (
        <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>
      )}

      <div className="rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 text-white px-5 py-8 text-center">
        <p className="text-xs font-bold tracking-widest text-blue-400 uppercase">Last 7 Days</p>
        <p className="text-4xl font-extrabold mt-2">₹{weekTotal.toLocaleString("en-IN")}</p>
        <p className="text-sm text-white/60 mt-2">
          {doneToday} wash{doneToday === 1 ? "" : "es"} completed today
        </p>
      </div>

      <div>
        <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">
          Recent Payouts
        </h2>
        {payouts.length === 0 ? (
          <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
            No payouts yet
          </div>
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl bg-gray-100 px-4 py-4 flex items-center justify-between gap-3"
              >
                <span className="text-gray-800 font-medium">{p.label}</span>
                <span className="font-extrabold text-gray-900 shrink-0">
                  ₹{Number(p.amount).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
