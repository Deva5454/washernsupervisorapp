import { useEffect, useState } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { notify } from "../../lib/notify";
import { logActivity } from "../../lib/activityLog";
import type { Profile, UniformIssuance, UniformIssuanceReason } from "../../lib/types";

const REASON_LABEL: Record<UniformIssuanceReason, string> = {
  entitlement: "Entitlement",
  replacement: "Replacement",
};

function UniformPanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [recipients, setRecipients] = useState<Map<string, Profile>>(new Map());
  const [issuances, setIssuances] = useState<UniformIssuance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recipientId, setRecipientId] = useState("");
  const [reason, setReason] = useState<UniformIssuanceReason>("entitlement");
  const [damagedReturned, setDamagedReturned] = useState(false);
  const [notes, setNotes] = useState("");
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
      let rosterQuery = supabase.from("profiles").select("*").eq("role", "washer");
      if (profile?.zone) rosterQuery = rosterQuery.eq("zone", profile.zone);
      const [rosterRes, issuancesRes] = await Promise.all([
        rosterQuery.order("full_name"),
        supabase
          .from("uniform_issuances")
          .select("*")
          .eq("issued_by", profileId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (rosterRes.error) throw rosterRes.error;
      if (issuancesRes.error) throw issuancesRes.error;
      const teamRoster = (rosterRes.data as Profile[]) ?? [];
      const recent = (issuancesRes.data as UniformIssuance[]) ?? [];
      setRoster(teamRoster);
      setIssuances(recent);

      const recipientIds = [...new Set(recent.map((i) => i.profile_id))].filter(
        (id) => !teamRoster.some((w) => w.id === id)
      );
      if (recipientIds.length) {
        const { data: extra, error: extraErr } = await supabase.from("profiles").select("*").in("id", recipientIds);
        if (extraErr) throw extraErr;
        setRecipients(new Map([...teamRoster, ...((extra as Profile[]) ?? [])].map((p) => [p.id, p])));
      } else {
        setRecipients(new Map(teamRoster.map((p) => [p.id, p])));
      }
    } catch (err) {
      console.error(err);
      setLoadError("Could not load uniform issuances.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!recipientId) return;
    if (reason === "replacement" && !damagedReturned) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const { error } = await supabase.from("uniform_issuances").insert({
        profile_id: recipientId,
        issued_by: profileId,
        reason,
        notes: notes.trim() || null,
        damaged_returned: reason === "replacement" ? damagedReturned : false,
      });
      if (error) throw error;

      await notify(recipientId, "Uniform issued", `${REASON_LABEL[reason]} uniform issued to you.`);
      await logActivity(profileId, "cloth", "Uniform issued", {
        details: `${REASON_LABEL[reason]} → ${recipients.get(recipientId)?.full_name ?? recipientId}`,
      });

      setSent(true);
      setRecipientId("");
      setReason("entitlement");
      setDamagedReturned(false);
      setNotes("");
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not record this issuance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!recipientId && (reason === "entitlement" || damagedReturned);

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <div className="space-y-2">
        <select
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white"
        >
          <option value="">Select recipient…</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
          {profile && <option value={profile.id}>{profile.full_name} (me)</option>}
        </select>

        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(REASON_LABEL) as UniformIssuanceReason[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setReason(r);
                setDamagedReturned(false);
              }}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold ${
                reason === r ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>

        {reason === "replacement" && (
          <label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-100 rounded-xl px-4 py-3">
            <input
              type="checkbox"
              checked={damagedReturned}
              onChange={(e) => setDamagedReturned(e.target.checked)}
              className="h-4 w-4"
            />
            Damaged item returned
          </label>
        )}

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        <button
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Saving…" : "Issue Uniform"}
        </button>
        {sent && <p className="text-sm text-green-700">Uniform issuance recorded.</p>}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        issuances.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Issuances</p>
            {issuances.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {recipients.get(i.profile_id)?.full_name ?? "Unknown"} · {REASON_LABEL[i.reason]}
                </span>
                <span className="text-gray-500">{new Date(i.created_at).toLocaleDateString("en-IN")}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function UniformMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Uniform Entitlement & Replacement" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <UniformPanel profileId={profileId} />}
    </>
  );
}
