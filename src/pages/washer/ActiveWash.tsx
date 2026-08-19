import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Navigation, Phone, Camera, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { uploadPhoto } from "../../lib/uploadPhoto";
import type { ExecutionStage, Job, JobPhoto, PhotoDirection, PhotoPhase } from "../../lib/types";

const STAGES: { key: ExecutionStage; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "en_route", label: "En Route" },
  { key: "arrived", label: "Arrived" },
  { key: "washing", label: "Washing" },
  { key: "done", label: "Done" },
];

// Every completed wash uses 4 microfiber cloths from the washer's own
// stock — deducted automatically so "My Stock" reflects real usage
// without the washer having to log it by hand.
const CLOTHS_PER_WASH = 4;

const REQUIRED_DIRECTIONS: PhotoDirection[] = ["front", "back", "left", "right"];
const DIRECTION_LABEL: Record<PhotoDirection, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
};

function Stepper({ stage }: { stage: ExecutionStage }) {
  const activeIndex = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center justify-between px-1">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex-1 flex flex-col items-center">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              i <= activeIndex ? "bg-blue-600" : "bg-gray-300"
            }`}
          />
          <span
            className={`text-[10px] font-bold mt-1 ${
              i <= activeIndex ? "text-blue-600" : "text-gray-400"
            }`}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// PhotoTile: tapping opens the phone's rear camera directly via a native
// file input (capture="environment") — no custom camera UI needed, and
// it works the same on any real phone browser.
function PhotoTile({
  label,
  photo,
  onCapture,
  uploading,
}: {
  label: string;
  photo: JobPhoto | undefined;
  onCapture: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full aspect-square rounded-2xl border-2 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center gap-1 overflow-hidden relative disabled:opacity-50"
      >
        {photo ? (
          <>
            <img src={photo.photo_url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
              <Check className="h-3 w-3 text-white" />
            </span>
          </>
        ) : (
          <>
            <Camera className="h-6 w-6 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium">{uploading ? "Uploading…" : "Tap to capture"}</span>
          </>
        )}
      </button>
      <p className="text-xs text-gray-600 font-medium text-center mt-1">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onCapture(file);
        }}
      />
    </div>
  );
}

export default function ActiveWash() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [showBeforePhotos, setShowBeforePhotos] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const [jobRes, photosRes] = await Promise.all([
        supabase.from("jobs").select("*").eq("id", jobId).single(),
        supabase.from("job_photos").select("*").eq("job_id", jobId),
      ]);
      if (jobRes.error) throw jobRes.error;
      if (photosRes.error) throw photosRes.error;
      setJob(jobRes.data as Job);
      setPhotos((photosRes.data ?? []) as JobPhoto[]);
    } catch (err) {
      console.error(err);
      setError("Could not load this job.");
    } finally {
      setLoading(false);
    }
  }

  async function advanceStage(next: ExecutionStage) {
    if (!job) return;
    setAdvancing(true);
    setError(null);
    try {
      const { error } = await supabase.from("jobs").update({ execution_stage: next }).eq("id", job.id);
      if (error) throw error;
      setJob({ ...job, execution_stage: next });
    } catch (err) {
      console.error(err);
      setError("Could not update job stage. Please try again.");
    } finally {
      setAdvancing(false);
    }
  }

  async function capturePhoto(phase: PhotoPhase, direction: PhotoDirection, file: File) {
    if (!job) return;
    const key = `${phase}-${direction}`;
    setUploadingKey(key);
    setError(null);
    try {
      const url = await uploadPhoto(file, `jobs/${job.id}`);
      const { data, error } = await supabase
        .from("job_photos")
        .upsert(
          { job_id: job.id, phase, direction, photo_url: url },
          { onConflict: "job_id,phase,direction" }
        )
        .select()
        .single();
      if (error) throw error;
      setPhotos((prev) => [...prev.filter((p) => !(p.phase === phase && p.direction === direction)), data as JobPhoto]);
    } catch (err) {
      console.error(err);
      setError("Photo upload failed. Please try again.");
    } finally {
      setUploadingKey(null);
    }
  }

  // Best-effort: if this washer has no cloth stock item on file, there's
  // nothing to deduct — a missing stock row shouldn't block completing
  // the job.
  async function deductCloths(washerId: string) {
    try {
      const { data, error } = await supabase
        .from("stock_items")
        .select("id, remaining_qty")
        .eq("washer_id", washerId)
        .ilike("material_name", "%cloth%")
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      const next = Math.max(0, data.remaining_qty - CLOTHS_PER_WASH);
      await supabase.from("stock_items").update({ remaining_qty: next }).eq("id", data.id);
    } catch (err) {
      console.error("Cloth deduction failed", err);
    }
  }

  async function completeJob() {
    if (!job) return;
    setAdvancing(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "done", execution_stage: "done" })
        .eq("id", job.id);
      if (error) throw error;
      if (job.washer_id) await deductCloths(job.washer_id);
      navigate("/washer/jobs");
    } catch (err) {
      console.error(err);
      setError("Could not mark this job complete. Please try again.");
      setAdvancing(false);
    }
  }

  function photoFor(phase: PhotoPhase, direction: PhotoDirection) {
    return photos.find((p) => p.phase === phase && p.direction === direction);
  }

  const requiredPhotosDone = REQUIRED_DIRECTIONS.every((d) => photoFor("after", d));

  if (loading) {
    return <div className="text-center text-gray-400">Loading…</div>;
  }
  if (!job) {
    return <div className="text-center text-gray-400">Job not found.</div>;
  }

  const destination = encodeURIComponent(`${job.area}, ${job.city}`);

  return (
    <div className="pb-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/washer/jobs")} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-extrabold text-gray-900">Active Wash</h1>
      </div>

      <div className="rounded-2xl bg-gray-100 p-4">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">{job.package_name}</p>
        <p className="text-lg font-extrabold text-gray-900 mt-0.5">
          {job.vehicle_make} · {job.vehicle_reg}
        </p>
        <p className="text-sm text-gray-600 mt-0.5">
          {job.customer_name} · {job.area}, {job.city}
        </p>
      </div>

      <Stepper stage={job.execution_stage} />

      {error && <div className="rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">{error}</div>}

      {job.execution_stage === "assigned" && (
        <button
          onClick={() => advanceStage("en_route")}
          disabled={advancing}
          className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
        >
          {advancing ? "Starting…" : "Start Traveling"}
        </button>
      )}

      {job.execution_stage === "en_route" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-gray-200 bg-white py-3 flex flex-col items-center gap-1"
            >
              <Navigation className="h-5 w-5 text-gray-700" />
              <span className="text-sm font-bold text-gray-900">Navigate</span>
            </a>
            {job.customer_phone ? (
              <a
                href={`tel:${job.customer_phone}`}
                className="rounded-2xl border border-gray-200 bg-white py-3 flex flex-col items-center gap-1"
              >
                <Phone className="h-5 w-5 text-gray-700" />
                <span className="text-sm font-bold text-gray-900">Call</span>
              </a>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 py-3 flex flex-col items-center gap-1 opacity-50">
                <Phone className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-bold text-gray-400">No number on file</span>
              </div>
            )}
          </div>
          <button
            onClick={() => advanceStage("arrived")}
            disabled={advancing}
            className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
          >
            {advancing ? "Saving…" : "Mark Arrived"}
          </button>
        </div>
      )}

      {job.execution_stage === "arrived" && (
        <button
          onClick={() => advanceStage("washing")}
          disabled={advancing}
          className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
        >
          {advancing ? "Starting…" : "Start Washing"}
        </button>
      )}

      {job.execution_stage === "washing" && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
              Proof of Work — 4 photos required
            </p>
            <div className="grid grid-cols-2 gap-3">
              {REQUIRED_DIRECTIONS.map((direction) => (
                <PhotoTile
                  key={direction}
                  label={DIRECTION_LABEL[direction]}
                  photo={photoFor("after", direction)}
                  uploading={uploadingKey === `after-${direction}`}
                  onCapture={(file) => capturePhoto("after", direction, file)}
                />
              ))}
            </div>
          </div>

          {!showBeforePhotos ? (
            <button
              onClick={() => setShowBeforePhotos(true)}
              className="text-sm font-bold text-blue-600"
            >
              + Add before photos too (optional)
            </button>
          ) : (
            <div>
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                Before photos — optional
              </p>
              <div className="grid grid-cols-2 gap-3">
                {REQUIRED_DIRECTIONS.map((direction) => (
                  <PhotoTile
                    key={direction}
                    label={DIRECTION_LABEL[direction]}
                    photo={photoFor("before", direction)}
                    uploading={uploadingKey === `before-${direction}`}
                    onCapture={(file) => capturePhoto("before", direction, file)}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={completeJob}
            disabled={!requiredPhotosDone || advancing}
            className="w-full h-14 rounded-2xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold"
          >
            {advancing
              ? "Saving…"
              : requiredPhotosDone
              ? "Mark Job Complete"
              : "Capture all 4 photos to complete"}
          </button>
        </div>
      )}
    </div>
  );
}
