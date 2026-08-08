"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, ArrowUp, ArrowDown, Loader2, Star } from "lucide-react";
import { confirmUpload, getUploadUrl } from "@/actions/media";

type PendingImage = { id: string; previewUrl: string; status: "uploading" | "done" | "error"; finalUrl?: string; message?: string };

async function compressImage(file: File): Promise<File> {
  if (file.size <= 8 * 1024 * 1024) {
    return file;
  }

  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create image canvas");
  }

  const maxDimension = 1600;
  const { width, height } = imageBitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Compression failed"));
      }
    }, "image/jpeg", 0.92);
  });

  imageBitmap.close();

  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

const MAX_IMAGES = 20; // matches the Zod cap in lib/validations/product.ts

/**
 * Handles up to 20 images (matches the Zod cap in lib/validations/product.ts),
 * first image is the cover/primary shown on product cards.
 *
 * Real, working right now: drag-and-drop, click-to-browse, instant local
 * preview (`URL.createObjectURL`), reordering, removal — all genuine browser
 * behavior, not mocked. What's still a placeholder, honestly: `getUploadUrl`
 * (lib/media.ts) returns a placeholder URL until a real storage provider
 * (S3/Cloudinary/Vercel Blob) is wired in — so the URL saved to the product
 * won't resolve to a real image until that connection exists. The preview
 * you see while uploading is real; the saved URL afterward is a placeholder
 * pointing at nothing, by the same design already documented in lib/media.ts.
 */
export function ImageUploader({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allUrls = [...value, ...pending.filter((p) => p.status === "done" && p.finalUrl).map((p) => p.finalUrl!)];
  const atLimit = allUrls.length >= MAX_IMAGES;

  // Tracks filename+size already uploaded or in flight this session, so
  // dropping/selecting the same file twice doesn't queue a duplicate upload.
  const seenRef = useRef<Set<string>>(new Set());
  // Tracks final Cloudinary secure_urls already committed, so the exact same
  // remote asset can't be mapped onto this product's gallery twice even if
  // it came from two different uploads/files (Approved Requirements §1:
  // "prevent duplicate upload/mapping") — belt-and-suspenders alongside the
  // server-side Zod refine in lib/validations/product.ts.
  const urlSeenRef = useRef<Set<string>>(new Set(value));

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = MAX_IMAGES - allUrls.length;
    const toAdd: File[] = [];
    for (const file of list) {
      if (toAdd.length >= Math.max(0, room)) break;
      const fingerprint = `${file.name}-${file.size}`;
      if (seenRef.current.has(fingerprint)) continue; // duplicate — skip silently
      seenRef.current.add(fingerprint);
      toAdd.push(file);
    }

    // Local accumulator seeded from the `value` prop at call time, then
    // built on directly as each upload in this batch finishes — NOT the
    // stale `value` closure. Previously every `onChange([...value, url])`
    // call reused the *original* `value` captured when handleFiles started,
    // so uploading several images in one batch made each new image
    // overwrite the previous one instead of appending (image 2 would wipe
    // out image 1, image 3 would wipe out image 1+2, etc — the reported
    // "new upload becomes the cover image" bug, since the last-resolved
    // upload was always left as the sole, first entry).
    let committed = value;

    for (const file of toAdd) {
      const id = file.name + "-" + Date.now() + "-" + Math.random();
      const fingerprint = `${file.name}-${file.size}`;
      const previewUrl = URL.createObjectURL(file);
      setPending((prev) => [...prev, { id, previewUrl, status: "uploading", message: file.size > 8 * 1024 * 1024 ? "Compressing image..." : undefined }]);

      try {
        console.log("[image-upload] started", {
          fileName: file.name,
          fileType: file.type,
          sizeBytes: file.size,
        });

        let uploadFile = file;
        if (uploadFile.size > 8 * 1024 * 1024) {
          setPending((prev) => prev.map((p) => (p.id === id ? { ...p, message: "Compressing image..." } : p)));
          uploadFile = await compressImage(uploadFile);
        }

        const uploadResult = await getUploadUrl({
          filename: uploadFile.name,
          contentType: uploadFile.type as any,
          folder: "Products",
        });

        console.log("[image-upload] getUploadUrl response", {
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
          throw new Error(uploadResult.error?.message ?? "Unable to prepare image upload");
        }

        const endpoint = `https://api.cloudinary.com/v1_1/${uploadResult.data.cloudName}/image/upload`;
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("api_key", uploadResult.data.apiKey);
        formData.append("timestamp", String(uploadResult.data.timestamp));
        formData.append("signature", uploadResult.data.signature);
        formData.append("folder", uploadResult.data.folder);

        console.log("[image-upload] Cloudinary request", {
          endpoint,
          cloudName: uploadResult.data.cloudName,
          folder: uploadResult.data.folder,
          mode: "signed",
        });

        const cloudinaryResponse = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });

        const responseText = await cloudinaryResponse.text();
        let uploaded: any = {};
        try {
          uploaded = responseText ? JSON.parse(responseText) : {};
        } catch {
          uploaded = { raw: responseText };
        }

        console.log("[image-upload] Cloudinary response", {
          status: cloudinaryResponse.status,
          body: uploaded,
        });

        if (!cloudinaryResponse.ok) {
          const message = uploaded.error?.message || uploaded.message || "Cloudinary upload failed";
          console.error("[image-upload] Cloudinary error", {
            status: cloudinaryResponse.status,
            body: uploaded,
            message,
          });
          throw new Error(message);
        }

        const confirmInput = {
          filename: uploadFile.name,
          url: uploaded.secure_url,
          type: "IMAGE" as const,
          folder: "Products" as const,
          sizeBytes: uploadFile.size,
        };

        console.log("[confirmUpload] input", confirmInput);

        const confirmResult = await confirmUpload(confirmInput);
        console.log("[confirmUpload] output", confirmResult);

        if (!confirmResult.success) {
          console.error("[image-upload] confirmUpload failed", confirmResult.error);
          throw new Error(confirmResult.error.message);
        }

        if (urlSeenRef.current.has(uploaded.secure_url)) {
          // The uploaded asset already maps to this product's gallery
          // (e.g. the same file re-selected under a different name) — the
          // media record itself was created, but it never gets mapped onto
          // this product a second time.
          setPending((prev) => prev.filter((p) => p.id !== id));
          continue;
        }
        urlSeenRef.current.add(uploaded.secure_url);

        setPending((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: "done",
                  finalUrl: uploaded.secure_url,
                }
              : p
          )
        );

        committed = [...committed, uploaded.secure_url];
        onChange(committed);
      } catch (error) {
        const message = typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : String(error);
        console.error("[image-upload] failed", {
          error: message,
          details: error,
        });
        seenRef.current.delete(fingerprint); // failed — let the admin retry the same file
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: "error", message: message } : p)));
      }
    }
  }

  function removeSaved(url: string) {
    onChange(value.filter((u) => u !== url));
  }
  function moveSaved(index: number, dir: 1 | -1) {
    const next = [...value];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const swapTarget = next[target];
    if (current === undefined || swapTarget === undefined) return;
    next[index] = swapTarget;
    next[target] = current;
    onChange(next);
  }
  function makeCover(index: number) {
    if (index <= 0) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.unshift(item);
    onChange(next);
  }

  // Drag-and-drop reordering of already-saved thumbnails — separate from
  // the dropzone's file drop above (that one accepts files from outside the
  // browser; this one reorders existing thumbnails within the grid).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  function reorderTo(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...value];
    const [item] = next.splice(dragIndex, 1);
    if (item === undefined) return;
    next.splice(targetIndex, 0, item);
    onChange(next);
    setDragIndex(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="muv-text-faint text-xs">Cover photo is always the first image</span>
        <span className="muv-text-meta text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>{allUrls.length} / {MAX_IMAGES}</span>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !atLimit && inputRef.current?.click()}
        className="muv-upload-dropzone"
        style={{
          borderColor: isDragging ? "var(--lavender)" : "var(--card-border)",
          background: isDragging ? "rgba(183,171,240,0.06)" : "transparent",
          cursor: atLimit ? "not-allowed" : "pointer",
          opacity: atLimit ? 0.5 : 1,
        }}
      >
        <ImagePlus size={20} color="var(--lavender)" />
        <p className="muv-text-body text-sm mt-2">
          {atLimit ? `Maximum ${MAX_IMAGES} images reached` : "Drag images here, or click to browse"}
        </p>
        <p className="muv-text-faint text-xs mt-1">JPEG, PNG, or WebP — first image becomes the cover photo</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {(value.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-4 gap-3 mt-4">
          {value.map((url, i) => (
            <div
              key={url}
              className="relative rounded-xl overflow-hidden"
              style={{ aspectRatio: "1", border: dragIndex === i ? "2px dashed var(--lavender)" : "1px solid var(--card-border)" }}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorderTo(i); }}
              onDragEnd={() => setDragIndex(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="muv-tag-pill absolute top-1.5 left-1.5">Cover</span>}
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                {i > 0 && <button type="button" onClick={() => makeCover(i)} className="muv-icon-circle" style={{ width: 22, height: 22, background: "rgba(11,11,15,0.7)" }} aria-label="Make this the cover image" title="Make cover"><Star size={10} /></button>}
                {i > 0 && <button type="button" onClick={() => moveSaved(i, -1)} className="muv-icon-circle" style={{ width: 22, height: 22, background: "rgba(11,11,15,0.7)" }} aria-label="Move earlier"><ArrowUp size={10} /></button>}
                {i < value.length - 1 && <button type="button" onClick={() => moveSaved(i, 1)} className="muv-icon-circle" style={{ width: 22, height: 22, background: "rgba(11,11,15,0.7)" }} aria-label="Move later"><ArrowDown size={10} /></button>}
                <button type="button" onClick={() => removeSaved(url)} className="muv-icon-circle" style={{ width: 22, height: 22, background: "rgba(11,11,15,0.7)" }} aria-label="Remove image"><X size={10} /></button>
              </div>
            </div>
          ))}
          {pending.filter((p) => p.status !== "done").map((p) => (
            <div key={p.id} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1", border: "1px solid var(--card-border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt="" className="w-full h-full object-cover" style={{ opacity: p.status === "uploading" ? 0.5 : 1 }} />
              {p.status === "uploading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2" style={{ background: "rgba(11,11,15,0.75)" }}>
                  <Loader2 size={18} className="animate-spin" color="#fff" />
                  {p.message && <span className="text-[10px] mt-2" style={{ color: "var(--lavender)" }}>{p.message}</span>}
                </div>
              )}
              {p.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-center px-2" style={{ background: "rgba(11,11,15,0.75)" }}>
                  <span style={{ color: "var(--danger, #f2555c)" }} className="text-[10px]">{p.message ?? "Upload failed"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}