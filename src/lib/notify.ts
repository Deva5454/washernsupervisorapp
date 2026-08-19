import { supabase } from "./supabase";

// Written at real state-change moments this app already causes (job
// assigned, check-in unlocked, report resolved, SOS acknowledged) — not
// a generic notification system, just the specific events raised
// elsewhere in the app. Best-effort: a failed notification insert
// shouldn't roll back or block the action that triggered it.
export async function notify(profileId: string, title: string, body?: string) {
  try {
    await supabase.from("notifications").insert({ profile_id: profileId, title, body: body ?? null });
  } catch (err) {
    console.error("Failed to write notification", err);
  }
}
