import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import type { Notification } from "../lib/types";

export default function Notifications() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadErr } = await supabase
        .from("notifications")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (loadErr) throw loadErr;
      const rows = (data ?? []) as Notification[];
      setItems(rows);

      const unreadIds = rows.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length) {
        const readAt = new Date().toISOString();
        const { error: markErr } = await supabase
          .from("notifications")
          .update({ read_at: readAt })
          .in("id", unreadIds);
        if (!markErr) {
          setItems((prev) =>
            prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: readAt } : n))
          );
        }
      }
    } catch (err) {
      console.error(err);
      setError("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="pb-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-extrabold text-gray-900">Notifications</h1>
      </div>

      {error && <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>}

      {loading ? (
        <p className="text-center text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-gray-100 px-4 py-8 text-center text-gray-500">
          No notifications yet.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className={`rounded-2xl px-4 py-3 ${
                n.read_at ? "bg-gray-100" : "bg-blue-50 border border-blue-200"
              }`}
            >
              <p className="font-bold text-gray-900">{n.title}</p>
              {n.body && <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.created_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
