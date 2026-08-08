"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Trash2, Copy, Loader2, UploadCloud } from "lucide-react";
import { getUploadUrl, confirmUpload, deleteMediaAsset } from "@/actions/media";
import { useToast } from "@/components/ui/toast";

type Asset = { id: string; filename: string; url: string; type: string; folder: string; sizeBytes: number; createdAt: string };
type Folder = "Products" | "Blog" | "Banners" | "General";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reuses the same real, signed-upload flow as ImageUploader
 * (components/admin/image-uploader.tsx) — getUploadUrl + a signed Cloudinary
 * POST + confirmUpload — generalized here for an arbitrary folder and
 * multi-file batches, since a standalone library (unlike a single product's
 * image array) needs to file uploads into any of the four real MediaFolder
 * values, not just "Products". Delete reuses deleteMediaAsset unmodified —
 * that action's own comment already documents it only deletes the DB row,
 * not the underlying Cloudinary file; not fixed here since fixing it needs a
 * cloud-provider SDK call this phase's scope doesn't include.
 */
export function MediaLibraryClient({ assets, currentFolder }: { assets: Asset[]; currentFolder: Folder }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const uploadResult = await getUploadUrl({ filename: file.name, contentType: file.type, folder: currentFolder });
        if (!uploadResult.success) throw new Error(uploadResult.error.message);

        const endpoint = `https://api.cloudinary.com/v1_1/${uploadResult.data.cloudName}/image/upload`;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", uploadResult.data.apiKey);
        formData.append("timestamp", String(uploadResult.data.timestamp));
        formData.append("signature", uploadResult.data.signature);
        formData.append("folder", uploadResult.data.folder);

        const res = await fetch(endpoint, { method: "POST", body: formData });
        const uploaded = await res.json();
        if (!res.ok) throw new Error(uploaded.error?.message ?? "Upload failed");

        const confirmResult = await confirmUpload({
          filename: file.name,
          url: uploaded.secure_url,
          type: file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
          folder: currentFolder,
          sizeBytes: file.size,
        });
        if (!confirmResult.success) throw new Error(confirmResult.error.message);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setUploading(false);
    router.refresh();
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteMediaAsset(id);
      setDeletingId(null);
      if (result.success) {
        showToast("Asset deleted");
        router.refresh();
      } else {
        showToast(result.error.message);
      }
    });
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    showToast("URL copied");
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          className="muv-upload-dropzone"
          style={{ padding: "14px 20px", cursor: uploading ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10 }}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} color="var(--lavender)" />}
          <span className="muv-text-body text-sm">{uploading ? "Uploading…" : `Upload to ${currentFolder}`}</span>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setView("grid")} className="muv-icon-circle" style={{ opacity: view === "grid" ? 1 : 0.4 }} aria-label="Grid view"><LayoutGrid size={14} /></button>
          <button onClick={() => setView("list")} className="muv-icon-circle" style={{ opacity: view === "list" ? 1 : 0.4 }} aria-label="List view"><List size={14} /></button>
        </div>
      </div>

      {assets.length === 0 && <p className="muv-text-meta text-sm py-8 text-center">No assets in this folder yet.</p>}

      {view === "grid" && assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {assets.map((a) => (
            <div key={a.id} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1", border: "1px solid var(--card-border)" }}>
              {a.type === "VIDEO" ? (
                <video src={a.url} className="w-full h-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 flex flex-col justify-between p-2 opacity-0 hover:opacity-100 transition-opacity" style={{ background: "rgba(11,11,15,0.55)" }}>
                <div className="flex justify-end gap-1">
                  <button onClick={() => handleCopy(a.url)} className="muv-icon-circle" style={{ width: 24, height: 24, background: "rgba(11,11,15,0.7)" }} aria-label="Copy URL"><Copy size={11} /></button>
                  <button onClick={() => handleDelete(a.id)} disabled={isPending && deletingId === a.id} className="muv-icon-circle" style={{ width: 24, height: 24, background: "rgba(11,11,15,0.7)" }} aria-label="Delete">
                    {isPending && deletingId === a.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
                <p className="text-[10px] text-white truncate">{a.filename}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "list" && assets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>{["Preview", "Filename", "Folder", "Size", "Uploaded", ""].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden" }}>
                      {a.type === "VIDEO" ? <video src={a.url} className="w-full h-full object-cover" muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />}
                    </div>
                  </td>
                  <td className="py-2 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{a.filename}</td>
                  <td className="py-2 px-3 muv-text-meta text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{a.folder}</td>
                  <td className="py-2 px-3 muv-text-meta text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{formatSize(a.sizeBytes)}</td>
                  <td className="py-2 px-3 muv-text-meta text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="py-2 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleCopy(a.url)} className="text-xs" style={{ color: "var(--lavender)" }}>Copy URL</button>
                      <button onClick={() => handleDelete(a.id)} disabled={isPending && deletingId === a.id} className="text-xs" style={{ color: "#e0685c" }}>{isPending && deletingId === a.id ? "…" : "Delete"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
