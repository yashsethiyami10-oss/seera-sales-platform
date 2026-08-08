"use client";

import { useRef, useState } from "react";
import { Video, X, Loader2, CheckCircle2 } from "lucide-react";
import { getUploadUrl, confirmUpload } from "@/actions/media";

type PendingVideo = { id: string; previewUrl: string; status: "uploading" | "done" | "error"; message?: string };

/**
 * Same real upload flow as ImageUploader (components/admin/image-uploader.tsx):
 * `getUploadUrl()` (the Server Action in actions/media.ts, NOT the plain
 * helper of the same name in lib/media.ts — that one isn't wrapped in
 * "use server" and calling it directly from a client component runs
 * `requireStaff()` -> `auth()` -> `headers()` outside any request scope,
 * which is exactly the "headers() was called outside a request scope" crash
 * this used to throw) signs a direct-to-Cloudinary upload, the browser POSTs
 * the file straight to Cloudinary, and `confirmUpload()` records the
 * resulting `secure_url`. Caps at 4 videos, matching the Zod limit in
 * lib/validations/product.ts.
 */
export function MultiVideoUploader({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const [pending, setPending] = useState<PendingVideo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const atLimit = value.length >= 4;

  // Tracks filename+size of everything already uploaded or in flight this
  // session, so dropping/selecting the same file twice (e.g. a double-click
  // or a drag that fires twice) doesn't queue a duplicate upload.
  const seenRef = useRef<Set<string>>(new Set());

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/"));
    const room = 4 - value.length;
    const toAdd: File[] = [];
    for (const file of list) {
      if (toAdd.length >= Math.max(0, room)) break;
      const fingerprint = `${file.name}-${file.size}`;
      if (seenRef.current.has(fingerprint)) continue; // duplicate — skip silently
      seenRef.current.add(fingerprint);
      toAdd.push(file);
    }

    // Local accumulator seeded from `value` at call time, then built on
    // directly as each upload finishes — same append-order fix as
    // ImageUploader, so a multi-file batch can't drop earlier uploads.
    let committed = value;

    for (const file of toAdd) {
      const id = file.name + "-" + Date.now() + "-" + Math.random();
      const fingerprint = `${file.name}-${file.size}`;
      const previewUrl = URL.createObjectURL(file);
      setPending((prev) => [...prev, { id, previewUrl, status: "uploading", message: "Requesting upload URL…" }]);

      try {
        console.log("[video-upload] started", { fileName: file.name, fileType: file.type, sizeBytes: file.size });

        const uploadResult = await getUploadUrl({ filename: file.name, contentType: "video/mp4", folder: "Products" });

        console.log("[video-upload] getUploadUrl response", {
          success: uploadResult.success,
          data: uploadResult.success
            ? {
                cloudName: uploadResult.data.cloudName,
                folder: uploadResult.data.folder,
                apiKey: uploadResult.data.apiKey ? "[present]" : "[missing]",
                timestamp: uploadResult.data.timestamp,
                signature: uploadResult.data.signature ? "[present]" : "[missing]",
              }
            : null,
          error: uploadResult.success ? null : uploadResult.error,
        });

        if (!uploadResult.success) {
          throw new Error(uploadResult.error?.message ?? "Unable to prepare video upload");
        }

        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, message: "Uploading to Cloudinary…" } : p)));

        const endpoint = `https://api.cloudinary.com/v1_1/${uploadResult.data.cloudName}/video/upload`;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", uploadResult.data.apiKey);
        formData.append("timestamp", String(uploadResult.data.timestamp));
        formData.append("signature", uploadResult.data.signature);
        formData.append("folder", uploadResult.data.folder);

        console.log("[video-upload] Cloudinary request", {
          endpoint,
          cloudName: uploadResult.data.cloudName,
          folder: uploadResult.data.folder,
          mode: "signed",
        });

        const cloudinaryResponse = await fetch(endpoint, { method: "POST", body: formData });

        const responseText = await cloudinaryResponse.text();
        let uploaded: any = {};
        try {
          uploaded = responseText ? JSON.parse(responseText) : {};
        } catch {
          uploaded = { raw: responseText };
        }

        console.log("[video-upload] Cloudinary response", { status: cloudinaryResponse.status, body: uploaded });

        if (!cloudinaryResponse.ok) {
          const message = uploaded.error?.message || uploaded.message || "Cloudinary upload failed";
          console.error("[video-upload] Cloudinary error", { status: cloudinaryResponse.status, body: uploaded, message });
          throw new Error(message);
        }

        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, message: "Saving…" } : p)));

        const confirmInput = {
          filename: file.name,
          url: uploaded.secure_url,
          type: "VIDEO" as const,
          folder: "Products" as const,
          sizeBytes: file.size,
        };

        console.log("[confirmUpload] input", confirmInput);
        const confirmResult = await confirmUpload(confirmInput);
        console.log("[confirmUpload] output", confirmResult);

        if (!confirmResult.success) {
          console.error("[video-upload] confirmUpload failed", confirmResult.error);
          throw new Error(confirmResult.error.message);
        }

        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: "done", message: "Uploaded" } : p)));
        committed = [...committed, uploaded.secure_url];
        onChange(committed);
      } catch (error) {
        const message = typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : String(error);
        console.error("[video-upload] failed", { error: message, details: error });
        seenRef.current.delete(fingerprint); // failed — let the admin retry the same file
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: "error", message } : p)));
      }
    }
  }

  function remove(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => !atLimit && inputRef.current?.click()}
        className="muv-upload-dropzone"
        style={{
          borderColor: isDragging ? "var(--lavender)" : "var(--card-border)",
          background: isDragging ? "rgba(183,171,240,0.06)" : "transparent",
          cursor: atLimit ? "not-allowed" : "pointer",
          opacity: atLimit ? 0.5 : 1,
        }}
      >
        <Video size={20} color="var(--lavender)" />
        <p className="muv-text-body text-sm mt-2">{atLimit ? "Maximum 4 videos reached" : "Drag videos here, or click to browse"}</p>
        <p className="muv-text-faint text-xs mt-1">MP4 — up to 4 videos per product</p>
        <input ref={inputRef} type="file" accept="video/mp4" multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </div>

      {(value.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {value.map((url) => (
            <div key={url} className="relative rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
              <video src={url} controls className="w-full block" style={{ maxHeight: 140 }} />
              <button type="button" onClick={() => remove(url)} className="muv-icon-circle absolute top-2 right-2" style={{ width: 24, height: 24, background: "rgba(11,11,15,0.7)" }} aria-label="Remove video">
                <X size={11} />
              </button>
            </div>
          ))}
          {pending.filter((p) => p.status !== "done").map((p) => (
            <div key={p.id} className="relative rounded-xl overflow-hidden flex flex-col items-center justify-center text-center px-2" style={{ border: "1px solid var(--card-border)", height: 140 }}>
              {p.status === "uploading" && (
                <>
                  <Loader2 size={18} className="animate-spin" color="#fff" />
                  {p.message && <span className="text-[10px] mt-2" style={{ color: "var(--lavender)" }}>{p.message}</span>}
                </>
              )}
              {p.status === "error" && <span style={{ color: "var(--danger)" }} className="text-[11px]">{p.message ?? "Upload failed"}</span>}
            </div>
          ))}
          {pending.filter((p) => p.status === "done").length > 0 && (
            <div className="col-span-2 flex items-center gap-1.5" style={{ color: "var(--lavender)" }}>
              <CheckCircle2 size={13} />
              <span className="text-[11px]">Upload complete</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
