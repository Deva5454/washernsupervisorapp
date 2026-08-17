import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import type { Alert, Issue, Profile } from "../../lib/types";

export default function Alerts() {
  const { profile } = useAuth();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reporters, setReporters] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.zone]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let alertQuery = supabase.from("alerts").select("*").order("created_at", { ascending: false });
      if (profile?.zone) alertQuery = alertQuery.eq("zone", profile.zone);
      const { data: alertData, error: alertErr } = await alertQuery;
      if (alertErr) throw alertErr;
      setAlerts((alertData as Alert[]) ?? []);

      const { data: issueData, error: issueErr } = await supabase
        .from("issues")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (issueErr) throw issueErr;
      const openIssues = (issueData as Issue[]) ?? [];
      setIssues(openIssues);

      const reporterIds = [...new Set(openIssues.map((i) => i.reported_by))];
      if (reporterIds.length) {
        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .in("id", reporterIds);
        if (profileErr) throw profileErr;
        setReporters(new Map(((profileData as Profile[]) ?? []).map((p) => [p.id, p])));
      } else {
        setReporters(new Map());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }

  async function markResolved(id: string) {
    setBusyId(id);
    try {
      const { error: updateErr } = await supabase
        .from("issues")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) throw updateErr;
      setIssues((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve issue.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Alert Center</h1>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">ALERTS</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No alerts right now.
              </p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 bg-blue-50 rounded-2xl px-4 py-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-800">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">
              ISSUES RAISED
            </h2>
            {issues.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-4">
                No open issues.
              </p>
            ) : (
              <div className="space-y-3">
                {issues.map((issue) => {
                  const reporter = reporters.get(issue.reported_by);
                  return (
                    <div key={issue.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-extrabold text-gray-900">{issue.title}</p>
                        <span className="flex-shrink-0 text-xs font-bold text-blue-600 border border-blue-600 rounded-full px-3 py-1">
                          Open
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {reporter?.full_name ?? "Unknown"}
                      </p>
                      <button
                        onClick={() => markResolved(issue.id)}
                        disabled={busyId === issue.id}
                        className="mt-3 w-full h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                      >
                        {busyId === issue.id ? "Resolving…" : "Mark Resolved"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
