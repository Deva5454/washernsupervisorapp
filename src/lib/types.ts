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
export type VehicleType = "4w" | "2w" | "addon";
export type PaymentMethod = "cash" | "upi" | "link";

// Weighted daily-quota units, matching the ERP's real incentive-engine
// unit counts (this app only counts units, it doesn't compute payouts —
// those still come from the read-only `payouts` table).
export const VEHICLE_TYPE_UNITS: Record<VehicleType, number> = {
  "4w": 1.0,
  "2w": 0.4,
  addon: 0.5,
};

export type JobFailureReason =
  | "customer_unavailable"
  | "vehicle_unavailable"
  | "equipment_failure"
  | "weather"
  | "safety"
  | "access_denied"
  | "other";

export interface Job {
  id: string;
  washer_id: string | null;
  sequence_number: number;
  scheduled_time: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_make: string;
  vehicle_reg: string;
  vehicle_type: VehicleType;
  package_name: string;
  area: string;
  city: string;
  status: JobStatus;
  execution_stage: ExecutionStage;
  is_cover: boolean;
  is_urgent: boolean;
  payment_required: boolean;
  payment_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  payment_collected_at: string | null;
  override_reason: string | null;
  failure_reason: JobFailureReason | null;
  auto_reschedule: boolean;
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
  gps_unlock_approved_at: string | null;
  supervisor_note: string | null;
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
export type IssueCategory =
  | "broken_part"
  | "lost_damaged_bottle"
  | "repair_request"
  | "pre_damage"
  | "other";

export type IssueRoutingStatus = "none" | "pending_branch" | "pending_central" | "resolved";

export interface Issue {
  id: string;
  reported_by: string;
  title: string;
  status: IssueStatus;
  category: IssueCategory | null;
  item_name: string | null;
  job_id: string | null;
  photo_url: string | null;
  qty_deducted: number | null;
  routing_status: IssueRoutingStatus;
  spare_issued: boolean;
  created_at: string;
  resolved_at: string | null;
}

export type AuditStatus = "pending" | "completed";
export type AuditGrade = "pass" | "minor" | "major" | "failed";

export interface AuditChecklist {
  uniform: Record<string, boolean>;
  materials: Record<string, boolean>;
  process: Record<string, boolean>;
}

export interface Audit {
  id: string;
  washer_id: string;
  vehicle_make: string;
  vehicle_reg: string;
  audit_status: AuditStatus;
  completed_at: string | null;
  created_at: string;
  job_id: string | null;
  uniform_score: number | null;
  materials_score: number | null;
  process_score: number | null;
  photo_score: number | null;
  total_score: number | null;
  grade: AuditGrade | null;
  notes: string | null;
  checklist: AuditChecklist | null;
  gps_exception_reason: string | null;
  photo_authenticity_flagged: boolean;
  photo_authenticity_note: string | null;
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

export type ClothUnitState = "clean" | "dirty" | "locked" | "expired";

export interface ClothUnit {
  id: string;
  barcode: string;
  washer_id: string | null;
  state: ClothUnitState;
  wash_count: number;
  created_at: string;
  updated_at: string;
}

export type SosStatus = "active" | "resolved";

export interface SosAlert {
  id: string;
  washer_id: string;
  gps_lat: number | null;
  gps_lng: number | null;
  message: string | null;
  status: SosStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface Notification {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}

export type RequestStatus = "pending" | "approved" | "rejected";

export interface AdvanceRequest {
  id: string;
  washer_id: string;
  amount: number;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface CoverRequest {
  id: string;
  washer_id: string;
  cover_date: string;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface CashDeposit {
  id: string;
  washer_id: string;
  amount: number;
  deposit_date: string;
  deposited_at: string;
  recorded_by: string | null;
}

export type LeaveType = "CL" | "PL" | "SL" | "UL";

export interface LeaveBalance {
  id: string;
  washer_id: string;
  leave_type: LeaveType;
  total: number;
  used: number;
  updated_at: string;
}

export interface LeaveRequest {
  id: string;
  washer_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface RegularizationRequest {
  id: string;
  profile_id: string;
  target_date: string;
  requested_status: AttendanceStatus;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface Payslip {
  id: string;
  profile_id: string;
  month: string;
  gross: number;
  deductions: number;
  net: number;
  notes: string | null;
  generated_at: string;
}

export type ExpenseCategory = "travel" | "medical" | "fuel" | "other";

export interface ExpenseClaim {
  id: string;
  profile_id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  from_location: string | null;
  to_location: string | null;
  distance_km: number | null;
  receipt_url: string | null;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface TaxDocument {
  id: string;
  profile_id: string;
  label: string;
  file_url: string;
  uploaded_at: string;
}

export interface StockRequest {
  id: string;
  profile_id: string;
  material_name: string;
  requested_qty: number;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export type DemoRequestStatus = "pending" | "accepted" | "declined";

export interface DemoRequest {
  id: string;
  washer_id: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_info: string | null;
  area: string | null;
  scheduled_time: string | null;
  status: DemoRequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface StockReceipt {
  id: string;
  supervisor_id: string;
  challan_number: string;
  material_name: string;
  received_qty: number;
  damaged_qty: number;
  shortfall_notes: string | null;
  received_at: string;
}

export interface SupervisorStock {
  id: string;
  supervisor_id: string;
  material_name: string;
  buffer_qty: number;
  unit: string;
  updated_at: string;
}

export interface MaterialIssuance {
  id: string;
  supervisor_id: string;
  washer_id: string;
  material_name: string;
  qty: number;
  issued_at: string;
}

export type UniformIssuanceReason = "entitlement" | "replacement";

export interface UniformIssuance {
  id: string;
  profile_id: string;
  issued_by: string;
  reason: UniformIssuanceReason;
  notes: string | null;
  damaged_returned: boolean;
  created_at: string;
}

export interface CashRegister {
  id: string;
  supervisor_id: string;
  shift_date: string;
  cash_total: number;
  upi_total: number;
  link_total: number;
  deposit_reference: string;
  submitted_at: string;
}

export interface SubscriptionCashDeposit {
  id: string;
  supervisor_id: string;
  customer_name: string;
  customer_phone: string | null;
  amount: number;
  bank_reference: string | null;
  notes: string | null;
  deposited_at: string;
}

export interface PeriodicSchedule {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  area: string | null;
  zone: string | null;
  service_name: string;
  frequency_days: number;
  next_due_date: string;
  monthly_cap: number;
  used_this_month: number;
  last_serviced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyFlowProgress {
  id: string;
  supervisor_id: string;
  flow_date: string;
  completed_steps: string[];
  updated_at: string;
}

export type ActivityLogCategory = "attendance" | "audit" | "lead" | "cloth" | "escalation" | "other";

export interface ActivityLogEntry {
  id: string;
  actor_id: string;
  category: ActivityLogCategory;
  action: string;
  details: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_verified: boolean;
  created_at: string;
}

export type EscalationCaseType = "missed_visit_credit" | "quality_dispute" | "bonus_correction" | "other";

export interface Escalation {
  id: string;
  raised_by: string;
  washer_id: string | null;
  case_type: EscalationCaseType;
  reason: string;
  details: string | null;
  status: "pending" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface SchedulePause {
  id: string;
  washer_id: string;
  reason: string;
  paused_by: string;
  paused_at: string;
  resumed_at: string | null;
}

export interface BatchInvalidation {
  id: string;
  batch_id: string;
  reason: string;
  invalidated_by: string;
  created_at: string;
}
