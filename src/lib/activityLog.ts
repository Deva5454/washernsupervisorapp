import { supabase } from "./supabase";
import type { ActivityLogCategory } from "./types";

// Written alongside supervisor-facing actions worth a trail (attendance
// overrides, audits, cloth hand-overs, escalations) — not a full audit
// of every table write. Best-effort: a failed log insert shouldn't roll
// back or block the action that triggered it.
export async function logActivity(
  actorId: string,
  category: ActivityLogCategory,
  action: string,
  opts?: { details?: string; gpsLat?: number; gpsLng?: number; gpsVerified?: boolean }
) {
  try {
    await supabase.from("activity_log").insert({
      actor_id: actorId,
      category,
      action,
      details: opts?.details ?? null,
      gps_lat: opts?.gpsLat ?? null,
      gps_lng: opts?.gpsLng ?? null,
      gps_verified: opts?.gpsVerified ?? false,
    });
  } catch (err) {
    console.error("Failed to write activity log", err);
  }
}
