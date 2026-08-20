import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { localDateISO } from "../../lib/date";
import type { Payout, Profile } from "../../lib/types";

// "This week" = the trailing 7-day window ending today (inclusive), the
// simplest date range that doesn't depend on a Monday/Sunday convention.
function weekStartISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  local.setDate(local.getDate() - 6);
  return local.toISOString().slice(0, 10);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const AVATAR_COLORS = ["bg-blue-600", "bg-emerald-600", "bg-orange-500", "bg-violet-600", "bg-rose-500"];
function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface Ranked {
  washer: Profile;
  total: number;
}

export default function Incentive() {
  const { profile } = useAuth();

  const [ranked, setRanked] = useState<Ranked[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.zone]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let rosterQuery = supabase.from("profiles").select("*").eq("role", "washer");
      if (profile?.zone) rosterQuery = rosterQuery.eq("zone", profile.zone);
      const { data: rosterData, error: rosterErr } = await rosterQuery;
      if (rosterErr) throw rosterErr;
      const roster = (rosterData as Profile[]) ?? [];
      const washerIds = roster.map((w) => w.id);

      if (!washerIds.length) {
        setRanked([]);
        return;
      }

      const { data: payoutData, error: payoutErr } = await supabase
        .from("payouts")
        .select("*")
        .in("washer_id", washerIds)
        .gte("payout_date", weekStartISO())
        .lte("payout_date", localDateISO());
      if (payoutErr) throw payoutErr;
      const payouts = (payoutData as Payout[]) ?? [];

      const totals = new Map<string, number>();
      for (const p of payouts) {
        totals.set(p.washer_id, (totals.get(p.washer_id) ?? 0) + Number(p.amount));
      }

      const rows: Ranked[] = roster
        .map((washer) => ({ washer, total: totals.get(washer.id) ?? 0 }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);

      setRanked(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load incentive data.");
    } finally {
      setLoading(false);
    }
  }

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const topAmount = ranked[0]?.total ?? 0;
  // Podium visual order: 2nd, 1st, 3rd.
  const podiumOrder = [top3[1], top3[0], top3[2]];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Incentive Leaderboard</h1>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-extrabold text-gray-900 tracking-wide">TEAM LEADERBOARD</h2>
          <p className="text-xs text-gray-400">Last 7 days</p>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : ranked.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-6 text-center">
            No payouts recorded for this team in the last 7 days.
          </p>
        ) : (
          <>
            {top3.length > 0 && (
              <div className="flex items-end justify-center gap-6 mb-6">
                {podiumOrder.map((entry, i) =>
                  entry ? (
                    <div key={entry.washer.id} className="flex flex-col items-center">
                      <div
                        className={`rounded-full text-white flex items-center justify-center font-extrabold flex-shrink-0 ${avatarColor(
                          entry.washer.id
                        )} ${i === 1 ? "h-20 w-20 text-2xl ring-4 ring-blue-600" : "h-16 w-16 text-lg"}`}
                      >
                        {initials(entry.washer.full_name)}
                      </div>
                      <p className="font-extrabold text-gray-900 mt-2 text-sm text-center">
                        {entry.washer.full_name}
                      </p>
                      <p className="text-blue-600 font-extrabold">₹{entry.total.toLocaleString("en-IN")}</p>
                    </div>
                  ) : (
                    <div key={`empty-${i}`} className="w-16" />
                  )
                )}
              </div>
            )}

            {rest.length > 0 && (
              <div className="space-y-2">
                {rest.map((entry, idx) => (
                  <div key={entry.washer.id} className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-blue-600 w-4">{idx + 4}</span>
                        <p className="font-bold text-gray-900">{entry.washer.full_name}</p>
                      </div>
                      <p className="font-extrabold text-gray-900">
                        ₹{entry.total.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 mt-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{
                          width: `${topAmount > 0 ? Math.max(4, (entry.total / topAmount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
