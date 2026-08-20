import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Car, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { uploadPhoto } from "../../lib/uploadPhoto";
import {
  GRADE_LABEL,
  GRADE_PILL,
  MATERIALS_ITEMS,
  MAX_MATERIALS,
  MAX_PHOTO,
  MAX_PROCESS,
  MAX_UNIFORM,
  PROCESS_ITEMS,
  REQUIRED_PHOTOS,
  UNIFORM_ITEMS,
  checklistScore,
  gradeFor,
} from "../../lib/audit";
import type { Audit, Job, Profile } from "../../lib/types";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const STEP_LABEL: Record<Step, string> = {
  1: "Washer",
  2: "Uniform",
  3: "Job",
  4: "Materials",
  5: "Process & Photos",
  6: "Review",
};

function ChecklistStep({
  title,
  items,
  checked,
  onToggle,
  max,
}: {
  title: string;
  items: string[];
  checked: Record<string, boolean>;
  onToggle: (item: string) => void;
  max: number;
}) {
  const score = checklistScore(checked, items, max);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{title}</p>
        <span className="text-xs font-bold text-blue-600">
          {score}/{max}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium ${
              checked[item] ? "bg-blue-50 border border-blue-300 text-blue-900" : "bg-gray-100 text-gray-700"
            }`}
          >
            <span
              className={`h-5 w-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                checked[item] ? "bg-blue-600" : "bg-white border border-gray-300"
              }`}
            >
              {checked[item] && <Check className="h-3.5 w-3.5 text-white" />}
            </span>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [pendingAudits, setPendingAudits] = useState<Audit[]>([]);
  const [completedAudits, setCompletedAudits] = useState<Audit[]>([]);
  const [roster, setRoster] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"list" | "wizard">("list");
  const [auditId, setAuditId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [washerId, setWasherId] = useState("");
  const [washerJobs, setWasherJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [uniformChecked, setUniformChecked] = useState<Record<string, boolean>>({});
  const [materialsChecked, setMaterialsChecked] = useState<Record<string, boolean>>({});
  const [processChecked, setProcessChecked] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!washerId) {
      setWasherJobs([]);
      return;
    }
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    supabase
      .from("jobs")
      .select("*")
      .eq("washer_id", washerId)
      .gte("job_date", since)
      .order("job_date", { ascending: false })
      .then(({ data }) => setWasherJobs((data ?? []) as Job[]));
  }, [washerId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, completedRes, rosterRes] = await Promise.all([
        supabase.from("audits").select("*").eq("audit_status", "pending").order("created_at", { ascending: true }),
        supabase
          .from("audits")
          .select("*")
          .eq("audit_status", "completed")
          .order("completed_at", { ascending: false })
          .limit(10),
        supabase.from("profiles").select("*").eq("role", "washer").order("full_name"),
      ]);
      if (pendingRes.error) throw pendingRes.error;
      if (completedRes.error) throw completedRes.error;
      if (rosterRes.error) throw rosterRes.error;
      setPendingAudits((pendingRes.data as Audit[]) ?? []);
      setCompletedAudits((completedRes.data as Audit[]) ?? []);
      setRoster((rosterRes.data as Profile[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audits.");
    } finally {
      setLoading(false);
    }
  }

  function resetWizard() {
    setAuditId(null);
    setStep(1);
    setWasherId("");
    setJobId(null);
    setVehicleMake("");
    setVehicleReg("");
    setUniformChecked({});
    setMaterialsChecked({});
    setProcessChecked({});
    setPhotos([]);
    setNotes("");
    setWizardError(null);
  }

  function startNewAudit() {
    resetWizard();
    setMode("wizard");
  }

  function continueAudit(audit: Audit) {
    resetWizard();
    setAuditId(audit.id);
    setWasherId(audit.washer_id);
    setVehicleMake(audit.vehicle_make);
    setVehicleReg(audit.vehicle_reg);
    setStep(2);
    setMode("wizard");
  }

  function pickJob(job: Job) {
    setJobId(job.id);
    setVehicleMake(job.vehicle_make);
    setVehicleReg(job.vehicle_reg);
  }

  async function capturePhoto(file: File) {
    setUploadingPhoto(true);
    setWizardError(null);
    try {
      const url = await uploadPhoto(file, `audits/${washerId}`);
      setPhotos((prev) => [...prev, url].slice(0, REQUIRED_PHOTOS));
    } catch (err) {
      console.error(err);
      setWizardError("Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  const uniformScore = checklistScore(uniformChecked, UNIFORM_ITEMS, MAX_UNIFORM);
  const materialsScore = checklistScore(materialsChecked, MATERIALS_ITEMS, MAX_MATERIALS);
  const processScore = checklistScore(processChecked, PROCESS_ITEMS, MAX_PROCESS);
  const photoScore = Math.round((Math.min(photos.length, REQUIRED_PHOTOS) / REQUIRED_PHOTOS) * MAX_PHOTO);
  const totalScore = uniformScore + materialsScore + processScore + photoScore;
  const grade = gradeFor(totalScore);

  async function submitAudit() {
    if (!washerId || !vehicleMake.trim() || !vehicleReg.trim()) return;
    setSubmitting(true);
    setWizardError(null);
    try {
      const payload = {
        washer_id: washerId,
        vehicle_make: vehicleMake.trim(),
        vehicle_reg: vehicleReg.trim(),
        audit_status: "completed" as const,
        completed_at: new Date().toISOString(),
        job_id: jobId,
        uniform_score: uniformScore,
        materials_score: materialsScore,
        process_score: processScore,
        photo_score: photoScore,
        total_score: totalScore,
        grade,
        notes: notes.trim() || null,
        checklist: { uniform: uniformChecked, materials: materialsChecked, process: processChecked, photos },
      };
      const { error: saveErr } = auditId
        ? await supabase.from("audits").update(payload).eq("id", auditId)
        : await supabase.from("audits").insert(payload);
      if (saveErr) throw saveErr;
      setMode("list");
      resetWizard();
      await load();
    } catch (e) {
      setWizardError(e instanceof Error ? e.message : "Failed to save audit.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "wizard") {
    const washer = roster.find((w) => w.id === washerId);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMode("list");
              resetWizard();
            }}
            aria-label="Cancel"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-extrabold text-gray-900">
            Audit · Step {step} of 6 · {STEP_LABEL[step]}
          </h1>
        </div>

        <div className="flex gap-1">
          {([1, 2, 3, 4, 5, 6] as Step[]).map((s) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-blue-600" : "bg-gray-200"}`} />
          ))}
        </div>

        {wizardError && <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{wizardError}</div>}

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 mb-2">Which washer are you auditing?</p>
            {roster.map((w) => (
              <button
                key={w.id}
                onClick={() => setWasherId(w.id)}
                className={`w-full text-left rounded-2xl px-4 py-3 font-bold ${
                  washerId === w.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
                }`}
              >
                {w.full_name}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <ChecklistStep
            title="Uniform Check"
            items={UNIFORM_ITEMS}
            checked={uniformChecked}
            onToggle={(item) => setUniformChecked((prev) => ({ ...prev, [item]: !prev[item] }))}
            max={MAX_UNIFORM}
          />
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Pick one of {washer?.full_name ?? "this washer"}'s recent jobs to auto-fill the vehicle, or enter it
              manually.
            </p>
            {washerJobs.length > 0 && (
              <div className="space-y-2">
                {washerJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => pickJob(job)}
                    className={`w-full text-left rounded-2xl px-4 py-3 ${
                      jobId === job.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <p className="font-bold">
                      {job.vehicle_make} · {job.vehicle_reg}
                    </p>
                    <p className={`text-sm ${jobId === job.id ? "text-white/80" : "text-gray-500"}`}>
                      {job.customer_name} · {job.job_date}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={vehicleMake}
                onChange={(e) => {
                  setVehicleMake(e.target.value);
                  setJobId(null);
                }}
                placeholder="Vehicle make"
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
              />
              <input
                type="text"
                value={vehicleReg}
                onChange={(e) => {
                  setVehicleReg(e.target.value);
                  setJobId(null);
                }}
                placeholder="Reg. number"
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <ChecklistStep
            title="Materials Check"
            items={MATERIALS_ITEMS}
            checked={materialsChecked}
            onToggle={(item) => setMaterialsChecked((prev) => ({ ...prev, [item]: !prev[item] }))}
            max={MAX_MATERIALS}
          />
        )}

        {step === 5 && (
          <div className="space-y-4">
            <ChecklistStep
              title="Process Compliance"
              items={PROCESS_ITEMS}
              checked={processChecked}
              onToggle={(item) => setProcessChecked((prev) => ({ ...prev, [item]: !prev[item] }))}
              max={MAX_PROCESS}
            />
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                  Photo Evidence — up to {REQUIRED_PHOTOS}
                </p>
                <span className="text-xs font-bold text-blue-600">
                  {photoScore}/{MAX_PHOTO}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: REQUIRED_PHOTOS }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden relative"
                  >
                    {photos[i] ? (
                      <img src={photos[i]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : i === photos.length ? (
                      <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                        <Camera className="h-5 w-5 text-gray-400" />
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={uploadingPhoto}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) capturePhoto(file);
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-gray-900">
                  {washer?.full_name} · {vehicleMake} {vehicleReg}
                </p>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${GRADE_PILL[grade]}`}>
                  {GRADE_LABEL[grade]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Uniform</span>
                  <span className="font-bold text-gray-900">{uniformScore}/{MAX_UNIFORM}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Materials</span>
                  <span className="font-bold text-gray-900">{materialsScore}/{MAX_MATERIALS}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Process</span>
                  <span className="font-bold text-gray-900">{processScore}/{MAX_PROCESS}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Photos</span>
                  <span className="font-bold text-gray-900">{photoScore}/{MAX_PHOTO}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-extrabold text-blue-600">{totalScore}/100</span>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="flex-1 rounded-xl border border-gray-300 text-gray-700 font-bold py-3"
            >
              Back
            </button>
          )}
          {step < 6 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={
                (step === 1 && !washerId) || (step === 3 && (!vehicleMake.trim() || !vehicleReg.trim()))
              }
              className="flex-1 rounded-xl bg-blue-600 disabled:opacity-50 text-white font-bold py-3"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submitAudit}
              disabled={submitting}
              className="flex-1 rounded-xl bg-blue-600 disabled:opacity-50 text-white font-bold py-3"
            >
              {submitting ? "Saving…" : "Submit Audit"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-gray-900">Quality Audit</h1>
        <button onClick={startNewAudit} className="rounded-full bg-blue-600 text-white text-sm font-bold px-4 py-2">
          + New Audit
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading audits…</p>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">PENDING</h2>
            {pendingAudits.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-100 rounded-2xl px-4 py-6 text-center">
                No pending audits right now.
              </p>
            ) : (
              <div className="space-y-4">
                {pendingAudits.map((audit) => {
                  const washer = roster.find((w) => w.id === audit.washer_id);
                  return (
                    <div key={audit.id} className="bg-gray-100 rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-14 w-14 rounded-xl bg-gray-300 flex items-center justify-center flex-shrink-0">
                          <Car className="h-6 w-6 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-blue-600 tracking-wide uppercase">
                            {washer?.full_name ?? "Unknown Washer"}
                          </p>
                          <p className="font-extrabold text-gray-900 mt-0.5">
                            {audit.vehicle_make} · {audit.vehicle_reg}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => continueAudit(audit)}
                        className="mt-4 w-full h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                      >
                        Start Audit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {completedAudits.length > 0 && (
            <div>
              <h2 className="text-sm font-extrabold text-gray-900 tracking-wide mb-3">RECENTLY COMPLETED</h2>
              <div className="space-y-2">
                {completedAudits.map((audit) => {
                  const washer = roster.find((w) => w.id === audit.washer_id);
                  return (
                    <div key={audit.id} className="bg-gray-100 rounded-2xl px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">
                            {washer?.full_name ?? "Unknown"} · {audit.vehicle_make} {audit.vehicle_reg}
                          </p>
                          {audit.total_score != null && (
                            <p className="text-sm text-gray-500">Score: {audit.total_score}/100</p>
                          )}
                        </div>
                        {audit.grade && (
                          <span
                            className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full ${GRADE_PILL[audit.grade]}`}
                          >
                            {GRADE_LABEL[audit.grade]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
