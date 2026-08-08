"use client";

import { useEffect, useState, useTransition } from "react";
import { addInstAttachment, listInstAttachments } from "@/actions/inst-shared";
import { useToast } from "@/components/ui/toast";

type Attachment = { id: string; fileName: string; url: string; createdAt: string | Date; uploadedBy: { name: string | null } };

/**
 * Milestone 4 — Order Management OS. Reuses the existing generic
 * InstAttachment mechanism (already used nowhere in the UI before this
 * milestone, but fully supported server-side since Milestone 3) — same
 * structure as components/os-sales/NoteThread.tsx. Link-by-URL, not a file
 * upload flow: InstAttachment stores fileName/url/sizeBytes directly rather
 * than going through MediaAsset/Cloudinary the way CustomerDocument does,
 * so this matches what the existing schema actually supports rather than
 * building a second upload pipeline.
 */
export function AttachmentList({ entityType, entityId }: { entityType: "LEAD" | "OPPORTUNITY" | "VISIT" | "SAMPLE" | "QUOTATION" | "ORDER"; entityId: string }) {
  const { showToast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileName, setFileName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listInstAttachments(entityType, entityId).then((result) => {
      if (result.success) setAttachments(result.data as Attachment[]);
      setLoading(false);
    });
  }, [entityType, entityId]);

  function submit() {
    if (!fileName.trim() || !url.trim()) return;
    startTransition(async () => {
      const result = await addInstAttachment({ entityType, entityId, fileName, url });
      if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
      setAttachments((prev) => [result.data as Attachment, ...prev]);
      setFileName("");
      setUrl("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input
          value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="File name…"
          className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)", flex: "1 1 140px" }}
        />
        <input
          value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
          className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)", flex: "2 1 200px" }}
        />
        <button type="button" onClick={submit} disabled={isPending || !fileName.trim() || !url.trim()} className="muv-os-btn-ghost rounded-lg px-3 py-2 text-sm disabled:opacity-50" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Add</button>
      </div>
      {loading ? (
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: "rgba(var(--text-rgb),0.04)" }}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--lavender)" }}>{a.fileName}</a>
              <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{a.uploadedBy.name} · {new Date(a.createdAt).toLocaleDateString("en-IN")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
