import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import type { DemoRequest } from "../../lib/types";

function DemoRequestsPanel({ washerId }: { washerId: string }) {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washerId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("demo_requests")
        .select("*")
        .eq("washer_id", washerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data ?? []) as DemoRequest[]);
    } catch (err) {
      console.error(err);
      setError("Could not load demo requests.");
    } finally {
      setLoading(false);
    }
  }

  async function resolve(req: DemoRequest, status: "accepted" | "declined") {
    setBusyId(req.id);
    setError(null);
    try {
      const { error } = await supabase
        .from("demo_requests")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (error) throw error;
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error(err);
      setError("Could not update this request. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white">
      {loading ? (
        <p className="text-sm text-gray-400 py-3">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-3">{error}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">No pending demo requests.</p>
      ) : (
        <div className="space-y-3 pt-1">
          {requests.map((req) => (
            <div key={req.id} className="rounded-2xl bg-gray-100 p-4">
              <p className="font-extrabold text-gray-900">{req.customer_name}</p>
              {req.vehicle_info && <p className="text-sm text-gray-600 mt-0.5">{req.vehicle_info}</p>}
              <p className="text-sm text-gray-500 mt-0.5">
                {[req.area, req.scheduled_time].filter(Boolean).join(" · ") || "No further details"}
              </p>
              {req.customer_phone && (
                <a href={`tel:${req.customer_phone}`} className="text-sm text-blue-600 font-bold mt-1 inline-block">
                  {req.customer_phone}
                </a>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => resolve(req, "declined")}
                  disabled={busyId === req.id}
                  className="flex-1 h-11 rounded-full border border-gray-300 disabled:opacity-50 font-bold text-gray-900"
                >
                  Decline
                </button>
                <button
                  onClick={() => resolve(req, "accepted")}
                  disabled={busyId === req.id}
                  className="flex-1 h-11 rounded-full bg-blue-600 disabled:opacity-50 font-bold text-white"
                >
                  {busyId === req.id ? "Saving…" : "Accept"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DemoRequestsMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Demo Requests" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <DemoRequestsPanel washerId={profileId} />}
    </>
  );
}
