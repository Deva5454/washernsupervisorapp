import type { AuditGrade } from "./types";

export const GRADE_LABEL: Record<AuditGrade, string> = {
  pass: "Pass",
  minor: "Minor Issues",
  major: "Major Issues",
  failed: "Failed",
};

export const GRADE_PILL: Record<AuditGrade, string> = {
  pass: "bg-green-100 text-green-700",
  minor: "bg-amber-100 text-amber-700",
  major: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
};

export function gradeFor(total: number): AuditGrade {
  if (total >= 80) return "pass";
  if (total >= 60) return "minor";
  if (total >= 40) return "major";
  return "failed";
}

// Matches the ERP's weighting: uniform/20, materials/30, process/30,
// photo-evidence/20 (photos here, not video — no video upload pipeline
// exists in this app).
export const MAX_UNIFORM = 20;
export const MAX_MATERIALS = 30;
export const MAX_PROCESS = 30;
export const MAX_PHOTO = 20;
export const REQUIRED_PHOTOS = 4;

export const UNIFORM_ITEMS = [
  "Uniform worn correctly",
  "ID card visible",
  "Grooming standard met",
  "Safety gear present",
];

export const MATERIALS_ITEMS = [
  "Correct cloths used",
  "Chemicals within guidelines",
  "Equipment in working order",
  "Consumables adequately stocked",
];

export const PROCESS_ITEMS = [
  "Pre-wash inspection done",
  "All package steps followed",
  "Customer briefed on completion",
  "Work area left clean",
];

export function checklistScore(checked: Record<string, boolean>, items: string[], max: number): number {
  const count = items.filter((item) => checked[item]).length;
  return Math.round((count / items.length) * max);
}
