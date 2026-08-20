import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { uploadPhoto } from "../../lib/uploadPhoto";
import type { TaxDocument } from "../../lib/types";

function TaxDocumentsPanel({ profileId }: { profileId: string }) {
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("tax_documents")
        .select("*")
        .eq("profile_id", profileId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      setDocuments((data ?? []) as TaxDocument[]);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load tax documents.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim() || !file) return;
    setSubmitting(true);
    setSubmitError(null);
    setSent(false);
    try {
      const fileUrl = await uploadPhoto(file, "tax-documents");
      const { error } = await supabase.from("tax_documents").insert({
        profile_id: profileId,
        label: label.trim(),
        file_url: fileUrl,
      });
      if (error) throw error;
      setSent(true);
      setLabel("");
      setFile(null);
      await load();
    } catch (err) {
      console.error(err);
      setSubmitError("Could not upload the document. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Document label (e.g. Form 16, PAN card)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <label className="block text-xs font-bold text-gray-500">
          File
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-xs text-gray-600"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !label.trim() || !file}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {submitting ? "Uploading…" : "Upload Document"}
        </button>
      </form>
      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      {sent && <p className="text-sm text-green-700">Document uploaded.</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-1">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-1">{loadError}</p>
      ) : (
        documents.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Uploaded Documents</p>
            {documents.map((d) => (
              <a
                key={d.id}
                href={d.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-sm text-blue-600 font-bold"
              >
                <span>{d.label}</span>
                <span className="text-xs text-gray-400 font-normal">
                  {new Date(d.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </a>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function TaxDocumentsMenuItem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Tax Documents" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <TaxDocumentsPanel profileId={profileId} />}
    </>
  );
}
