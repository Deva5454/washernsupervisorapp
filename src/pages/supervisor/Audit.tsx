import { useEffect, useState } from "react";
import { Car } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Audit, Profile } from "../../lib/types";

export default function AuditPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [washers, setWashers] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: auditData, error: auditErr } = await supabase
        .from("audits")
        .select("*")
        .eq("audit_status", "pending")
        .order("created_at", { ascending: true });
      if (auditErr) throw auditErr;

      const pending = (auditData as Audit[]) ?? [];
      setAudits(pending);

      const washerIds = [...new Set(pending.map((a) => a.washer_id))];
      if (washerIds.length) {
        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .in("id", washerIds);
        if (profileErr) throw profileErr;
        setWashers(new Map(((profileData as Profile[]) ?? []).map((p) => [p.id, p])));
      } else {
        setWashers(new Map());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audits.");
    } finally {
      setLoading(false);
    }
  }

  async function startAudit(id: string) {
    setBusyId(id);
    try {
      const { error: updateErr } = await supabase
        .from("audits")
        .update({ audit_status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) throw updateErr;
      setAudits((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete audit.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Quality Audit</h1>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading audits…</p>
      ) : audits.length === 0 ? (
        <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-6 text-center">
          No pending audits right now.
        </p>
      ) : (
        <div className="space-y-4">
          {audits.map((audit) => {
            const washer = washers.get(audit.washer_id);
            return (
              <div key={audit.id} className="bg-gray-100 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-xl bg-gray-300 flex items-center justify-center flex-shrink-0">
                    <Car className="h-6 w-6 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-600 tracking-wide uppercase">
                      {washer?.full_name ?? "Unknown Washer"}
                    </p>
                    <p className="font-extrabold text-gray-900 mt-0.5">
                      {audit.vehicle_make} · {audit.vehicle_reg}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => startAudit(audit.id)}
                  disabled={busyId === audit.id}
                  className="mt-4 w-full h-12 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                >
                  {busyId === audit.id ? "Completing…" : "Start Audit"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
