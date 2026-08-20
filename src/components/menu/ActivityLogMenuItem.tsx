import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import type { ActivityLogCategory, ActivityLogEntry } from "../../lib/types";

const CATEGORY_LABEL: Record<ActivityLogCategory, string> = {
  attendance: "Attendance",
  audit: "Audit",
  lead: "Lead",
  cloth: "Cloth",
  escalation: "Escalation",
  other: "Other",
};

const CATEGORY_PILL: Record<ActivityLogCategory, string> = {
  attendance: "bg-blue-100 text-blue-700",
  audit: "bg-purple-100 text-purple-700",
  lead: "bg-amber-100 text-amber-700",
  cloth: "bg-teal-100 text-teal-700",
  escalation: "bg-red-100 text-red-700",
  other: "bg-gray-200 text-gray-700",
};

const FILTERS: Array<ActivityLogCategory | "all"> = ["all", "attendance", "audit", "lead", "cloth", "escalation", "other"];

function ActivityLogPanel() {
  const [filter, setFilter] = useState<ActivityLogCategory | "all">("all");
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(30);
      if (filter !== "all") query = query.eq("category", filter);
      const { data, error } = await query;
      if (error) throw error;
      setEntries((data as ActivityLogEntry[]) ?? []);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load the activity log.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              filter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {f === "all" ? "All" : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-400 py-1">No activity logged yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-gray-100 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_PILL[entry.category]}`}>
                  {CATEGORY_LABEL[entry.category]}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {new Date(entry.created_at).toLocaleString("en-IN")}
                </span>
              </div>
              <p className="text-sm font-bold text-gray-900">{entry.action}</p>
              {entry.details && <p className="text-sm text-gray-600">{entry.details}</p>}
              {entry.gps_verified && (
                <span className="inline-block text-xs font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                  GPS ✓
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivityLogMenuItem() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Activity / Audit Trail Log" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <ActivityLogPanel />}
    </>
  );
}
