import { supabase } from "./supabase";
import type { LeaveBalance, LeaveType } from "./types";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  CL: "Casual Leave",
  PL: "Privilege Leave",
  SL: "Sick Leave",
  UL: "Unpaid Leave",
};

// Flat annual totals — no pro-rata/probation accrual engine here (that's
// real HR/payroll logic this field app doesn't own). A washer's balance
// is provisioned with these defaults the first time their Leave section
// loads, then only ever adjusted by approved leave requests.
const DEFAULT_TOTALS: Record<LeaveType, number> = {
  CL: 7,
  PL: 10,
  SL: 7,
  UL: 0,
};

export async function ensureLeaveBalances(washerId: string): Promise<LeaveBalance[]> {
  const { data, error } = await supabase.from("leave_balances").select("*").eq("washer_id", washerId);
  if (error) throw error;
  const existing = (data ?? []) as LeaveBalance[];
  const missingTypes = (Object.keys(DEFAULT_TOTALS) as LeaveType[]).filter(
    (t) => !existing.some((b) => b.leave_type === t)
  );
  if (!missingTypes.length) return existing;
  const { data: inserted, error: insertErr } = await supabase
    .from("leave_balances")
    .insert(
      missingTypes.map((leave_type) => ({
        washer_id: washerId,
        leave_type,
        total: DEFAULT_TOTALS[leave_type],
      }))
    )
    .select();
  if (insertErr) throw insertErr;
  return [...existing, ...((inserted ?? []) as LeaveBalance[])];
}

export function leaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
