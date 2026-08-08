"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { getUploadUrl, confirmUpload } from "@/actions/media";
import { addCustomerDocument } from "@/actions/customers";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/**
 * MUV OS™ — Milestone 2, Global Features "Document Upload". Reuses the
 * existing, real Cloudinary direct-upload flow (`getUploadUrl` +
 * `confirmUpload`, actions/media.ts — the same one
 * `components/admin/image-uploader.tsx` already uses for product images)
 * rather than building a second upload mechanism. `application/pdf` and
 * the `DOCUMENT`/`Customers` enum values were extended additively onto
 * that shared infrastructure to support this.
 */
const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf";

export function CustomerDocumentUpload({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const isPdf = file.type === "application/pdf";
      const uploadResult = await getUploadUrl({ filename: file.name, contentType: file.type, folder: "Customers" });
      if (!uploadResult.success) throw new Error(uploadResult.error.message);

      const resourceType = isPdf ? "raw" : "image";
      const endpoint = `https://api.cloudinary.com/v1_1/${uploadResult.data.cloudName}/${resourceType}/upload`;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", uploadResult.data.apiKey);
      formData.append("timestamp", String(uploadResult.data.timestamp));
      formData.append("signature", uploadResult.data.signature);
      formData.append("folder", uploadResult.data.folder);

      const cloudinaryResponse = await fetch(endpoint, { method: "POST", body: formData });
      const uploaded = await cloudinaryResponse.json();
      if (!cloudinaryResponse.ok) throw new Error(uploaded?.error?.message ?? "Upload failed");

      const confirmResult = await confirmUpload({
        filename: file.name, url: uploaded.secure_url, type: isPdf ? "DOCUMENT" : "IMAGE",
        folder: "Customers", sizeBytes: file.size,
      });
      if (!confirmResult.success) throw new Error(confirmResult.error.message);

      const linkResult = await addCustomerDocument({ customerId, mediaAssetId: confirmResult.data.id, label: file.name });
      if (!linkResult.success) throw new Error(linkResult.error.message);

      showToast("Document uploaded", { tone: "dark" });
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      showToast(message, { tone: "dark" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="muv-os-interactive flex items-center gap-2 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
        style={{ border: "1px dashed var(--card-border)", color: "rgba(var(--text-rgb),0.6)" }}
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {uploading ? "Uploading…" : "Upload document (image or PDF)"}
      </button>
      <input ref={inputRef} type="file" hidden accept={ACCEPTED} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {error && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{error}</p>}
    </div>
  );
}
