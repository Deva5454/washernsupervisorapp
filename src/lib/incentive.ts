import { VEHICLE_TYPE_UNITS, type Job } from "./types";

// Matches the ERP's real daily base quota (25 weighted units) — kept as
// a single shared constant so Home's progress card and Jobs' Completed
// tab "Target hit" badge always agree on what counts as hitting target.
export const DAILY_UNIT_TARGET = 25;

// Weighted units toward the daily quota (4-wheeler=1.0, 2-wheeler=0.4,
// add-on=0.5) — this only counts units, it never computes a payout
// amount. Actual payouts still come from the read-only `payouts` table,
// computed by whatever system owns that money math.
export function weightedUnits(jobs: Pick<Job, "vehicle_type">[]): number {
  return jobs.reduce((sum, j) => sum + (VEHICLE_TYPE_UNITS[j.vehicle_type] ?? 1), 0);
}

export function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}
