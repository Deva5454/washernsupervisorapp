export type Role = "washer" | "supervisor";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  zone: string | null;
  avatar_url: string | null;
  cloth_limit: number | null;
  created_at: string;
}

export type JobStatus = "pending" | "in_progress" | "done" | "issue";
export type ExecutionStage = "assigned" | "en_route" | "arrived" | "washing" | "done";

export interface Job {
  id: string;
  washer_id: string | null;
  sequence_number: number;
  scheduled_time: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_make: string;
  vehicle_reg: string;
  package_name: string;
  area: string;
  city: string;
  status: JobStatus;
  execution_stage: ExecutionStage;
  is_cover: boolean;
  is_urgent: boolean;
  job_date: string;
  created_at: string;
  updated_at: string;
}

export type PhotoPhase = "before" | "after";
export type PhotoDirection = "front" | "back" | "left" | "right";

export interface JobPhoto {
  id: string;
  job_id: string;
  phase: PhotoPhase;
  direction: PhotoDirection;
  photo_url: string;
  created_at: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "week_off";

export interface AttendanceRecord {
  id: string;
  washer_id: string;
  date: string;
  status: AttendanceStatus;
  check_in_time: string | null;
  check_out_time: string | null;
  selfie_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_lost_at: string | null;
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
export type IssueCategory = "broken_part" | "lost_damaged_bottle" | "repair_request" | "other";

export interface Issue {
  id: string;
  reported_by: string;
  title: string;
  status: IssueStatus;
  category: IssueCategory | null;
  item_name: string | null;
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

export interface ClothExchange {
  id: string;
  washer_id: string;
  used_returned: number;
  new_received: number;
  created_at: string;
}
