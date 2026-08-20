import { useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { logActivity } from "../../lib/activityLog";

function NewJoinerPanel({ profileId }: { profileId: string }) {
  const { profile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState(profile?.zone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedName, setAddedName] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    if (!name) return;
    setSubmitting(true);
    setSubmitError(null);
    setAddedName(null);
    try {
      const { error } = await supabase.from("profiles").insert({
        full_name: name,
        role: "washer",
        phone: phone.trim() || null,
        zone: zone.trim() || null,
      });
      if (error) throw error;

      await logActivity(profileId, "other", "New joiner onboarded", { details: name });

      setAddedName(name);
      setFullName("");
      setPhone("");
      setZone(profile?.zone ?? "");
    } catch (err) {
      console.error(err);
      setSubmitError("Could not add this washer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Zone (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={submitting || !fullName.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Adding…" : "Add Washer"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {addedName && <p className="text-sm text-green-700">{addedName} added to your team.</p>}
    </div>
  );
}

export function NewJoinerMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="New Joiner Onboarding" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <NewJoinerPanel profileId={profileId} />}
    </>
  );
}
