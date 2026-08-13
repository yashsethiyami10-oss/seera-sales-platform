"use client";
import { useRef, useState } from "react";
import styles from "./WorkflowActions.module.css";

const ACCEPTED = "application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif";
const MAX_BYTES = 25_000_000;

// Founder decision: a payment-proof/receipt/claim field that only accepts a typed "File ID" is not
// a real upload. This uses the existing, already-functional multipart upload endpoint
// (/api/documents/upload -> uploadManualDocument, real bytes persisted as a StoredFile) and hands
// the caller the resulting real file id — never a fake "uploaded" state before bytes are actually
// persisted server-side.
export function FileUploadField({
  language,
  label,
  documentType,
  issuerType,
  issuerId,
  buyerType,
  buyerId,
  sourcePortal,
  amount,
  onUploaded,
}: {
  language: "EN" | "HI";
  label?: string;
  documentType: "PAYMENT_PROOF" | "SUPPORTING_DOCUMENT" | "CLAIM_RETURN_DOCUMENT" | "ADJUSTMENT_DOCUMENT" | "EXTERNAL_BILL";
  issuerType: string;
  issuerId: string;
  buyerType: string;
  buyerId: string;
  sourcePortal: string;
  amount: number;
  onUploaded: (fileId: string) => void;
}) {
  const hi = language === "HI",
    inputRef = useRef<HTMLInputElement>(null),
    [fileName, setFileName] = useState(""),
    [fileSize, setFileSize] = useState(0),
    [previewUrl, setPreviewUrl] = useState(""),
    [state, setState] = useState<"idle" | "uploading" | "uploaded" | "failed">("idle"),
    [error, setError] = useState("");

  const upload = async (file: File) => {
    setState("uploading");
    setError("");
    try {
      if (file.size < 1 || file.size > MAX_BYTES) throw new Error(hi ? "फ़ाइल का आकार अमान्य है (अधिकतम 25MB)।" : "File size is invalid (max 25MB).");
      const metadata = {
        documentNumber: `PROOF-${Date.now()}`,
        type: documentType,
        issuerType,
        issuerId,
        buyerType,
        buyerId,
        sourcePortal,
        amount,
        idempotencyKey: crypto.randomUUID(),
      };
      const form = new FormData();
      form.set("file", file);
      form.set("metadata", JSON.stringify(metadata));
      const r = await fetch("/api/documents/upload", { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Upload failed");
      setState("uploaded");
      onUploaded(d.externalFileId ?? d.id);
    } catch (e) {
      setState("failed");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className={styles.reasonField}>
      <span>{label ?? (hi ? "रसीद / प्रमाण अपलोड करें" : "Upload receipt / proof")}</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setFileName(file.name);
          setFileSize(file.size);
          if (file.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(file));
          else setPreviewUrl("");
          void upload(file);
        }}
      />
      {fileName && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          {previewUrl && <img src={previewUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #ead8d2" }} />}
          <div>
            <small>
              {fileName} · {(fileSize / 1024).toFixed(0)} KB
            </small>
            <br />
            {state === "uploading" && <small>{hi ? "अपलोड हो रहा है…" : "Uploading…"}</small>}
            {state === "uploaded" && <small style={{ color: "#177245", fontWeight: 800 }}>{hi ? "✓ अपलोड हो गया" : "✓ Uploaded"}</small>}
            {state === "failed" && (
              <>
                <small style={{ color: "#b4232d", fontWeight: 800 }}>{hi ? "✗ अपलोड विफल" : "✗ Upload failed"}</small>{" "}
                <button type="button" onClick={() => inputRef.current?.click()}>
                  {hi ? "पुनः प्रयास करें" : "Retry"}
                </button>
              </>
            )}
            {state === "uploaded" && (
              <button
                type="button"
                onClick={() => {
                  setFileName("");
                  setFileSize(0);
                  setPreviewUrl("");
                  setState("idle");
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                {hi ? "हटाएँ / बदलें" : "Remove / replace"}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <small style={{ color: "#b4232d" }}>{error}</small>}
    </div>
  );
}
