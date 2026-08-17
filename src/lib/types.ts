export type Role = "washer" | "supervisor";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  zone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type JobStatus = "pending" | "in_progress" | "done" | "issue";

export interface Job {
  id: string;
  washer_id: string | null;
  sequence_number: number;
  scheduled_time: string;
  customer_name: string;
  vehicle_make: string;
  vehicle_reg: string;
  package_name: string;
  area: string;
  city: string;
  status: JobStatus;
  is_cover: boolean;
  job_date: string;
  created_at: string;
  updated_at: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "week_off";

export interface AttendanceRecord {
  id: string;
  washer_id: string;
  date: string;
  status: AttendanceStatus;
  check_in_time: string | null;
  check_out_time: string | null;
  created_at: string;
}

export interface StockItem {
  id: string;
  washer_id: string;
  material_name: string;
  issued_qty: number;
  remaining_qty: number;
  unit: string;
  reorder_level: number;
  updated_at: string;
}

export interface Payout {
  id: string;
  washer_id: string;
  label: string;
  amount: number;
  payout_date: string;
  created_at: string;
}

export type IssueStatus = "open" | "resolved";

export interface Issue {
  id: string;
  reported_by: string;
  title: string;
  status: IssueStatus;
  created_at: string;
  resolved_at: string | null;
}

export type AuditStatus = "pending" | "completed";

export interface Audit {
  id: string;
  washer_id: string;
  vehicle_make: string;
  vehicle_reg: string;
  audit_status: AuditStatus;
  completed_at: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  zone: string | null;
  message: string;
  created_at: string;
}
