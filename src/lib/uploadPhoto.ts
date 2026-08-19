import { supabase } from "./supabase";

/**
 * Uploads a photo File to the public "field-photos" Storage bucket and
 * returns its public URL. Used for both check-in selfies and job
 * proof-of-work photos — same bucket, path prefix tells them apart.
 */
export async function uploadPhoto(file: File, pathPrefix: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("field-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("field-photos").getPublicUrl(path);
  return data.publicUrl;
}
