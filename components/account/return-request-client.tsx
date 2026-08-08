"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { submitReturnRequest, getReturnEvidenceUploadUrl } from "@/actions/returns";
import { returnIssueTypeValues } from "@/lib/validations/returns";
import { useToast } from "@/components/ui/toast";
import { Button, Badge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";

type OrderItemOption = { id: string; name: string; size: string };
type ExistingRequest = { orderItemId: string; ticketNumber: string; status: string };

const ISSUE_TYPE_LABEL: Record<(typeof returnIssueTypeValues)[number], string> = {
  DAMAGED: "Damaged",
  LEAKED: "Leaked",
  WRONG_PRODUCT: "Wrong product",
};

const STATUS_TONE: Record<string, "positive" | "neutral" | "muted"> = {
  SUBMITTED: "positive",
  UNDER_REVIEW: "positive",
  APPROVED: "positive",
  REJECTED: "muted",
  REPLACEMENT_INITIATED: "positive",
  RESOLVED: "muted",
};

type PendingEvidence = { id: string; previewUrl: string; status: "uploading" | "done" | "error"; finalUrl?: string; message?: string };

/**
 * Phase 1D — "Report an Issue / Request Replacement". Eligibility
 * (delivered + within 48 hours) is computed server-side in
 * app/account/orders/[id]/page.tsx and passed down as `eligible`; this
 * component only ever renders the form when the parent already decided it's
 * allowed. `submitReturnRequest` (actions/returns.ts) re-checks ownership,
 * delivery status, and the 48-hour window itself regardless — this is UX,
 * not the real gate.
 */
export function ReturnRequestClient({
  orderId,
  items,
  eligible,
  defaultPhone,
  existingRequests,
}: {
  orderId: string;
  items: OrderItemOption[];
  eligible: boolean;
  defaultPhone: string;
  existingRequests: ExistingRequest[];
}) {
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const existingByItem = new Map(existingRequests.map((r) => [r.orderItemId, r]));
  const reportableItems = items.filter((i) => !existingByItem.has(i.id));

  return (
    <div className="muv-card">
      <h3 className="font-display muv-text-solid text-sm mb-3 flex items-center gap-2" style={{ fontWeight: 500 }}>
        <AlertTriangle size={15} style={{ color: "var(--lavender)" }} aria-hidden /> Report an Issue / Request Replacement
      </h3>

      {existingRequests.length > 0 && (
        <div className="space-y-2 mb-3">
          {existingRequests.map((r) => {
            const item = items.find((i) => i.id === r.orderItemId);
            return (
              <div key={r.orderItemId} className="flex items-center justify-between text-sm py-1">
                <span className="muv-text-body">{item ? `${item.name} (${item.size})` : "Item"} · Ticket #{r.ticketNumber}</span>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ")}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {!eligible ? (
        reportableItems.length === 0 && existingRequests.length > 0 ? null : (
          <p className="muv-text-meta text-sm" style={{ lineHeight: 1.7 }}>
            Issue reporting is only available within 48 hours of delivery. If something&rsquo;s wrong outside that
            window, please <a href="/contact" className="muv-footer-link muv-text-solid">contact us</a> directly.
          </p>
        )
      ) : reportableItems.length === 0 ? (
        <p className="muv-text-meta text-sm">No further items on this order are eligible to report.</p>
      ) : (
        <div className="space-y-2">
          {reportableItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm py-1">
              <span className="muv-text-body">{item.name} ({item.size})</span>
              <button type="button" onClick={() => setOpenItemId(item.id)} className="muv-footer-link muv-text-solid text-xs">
                Report an issue
              </button>
            </div>
          ))}
        </div>
      )}

      {openItemId && (
        <ReturnRequestForm
          orderId={orderId}
          item={items.find((i) => i.id === openItemId)!}
          defaultPhone={defaultPhone}
          onClose={() => setOpenItemId(null)}
          onSubmitted={(ticketNumber) => {
            setOpenItemId(null);
            showToast(`Request submitted — ticket #${ticketNumber}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ReturnRequestForm({
  orderId,
  item,
  defaultPhone,
  onClose,
  onSubmitted,
}: {
  orderId: string;
  item: OrderItemOption;
  defaultPhone: string;
  onClose: () => void;
  onSubmitted: (ticketNumber: string) => void;
}) {
  const [issueType, setIssueType] = useState<(typeof returnIssueTypeValues)[number]>("DAMAGED");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState(defaultPhone);
  const [pending, setPending] = useState<PendingEvidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const evidenceUrls = pending.filter((p) => p.status === "done" && p.finalUrl).map((p) => p.finalUrl!);
  const uploading = pending.some((p) => p.status === "uploading");

  async function handleFiles(files: FileList) {
    const room = 5 - pending.filter((p) => p.status !== "error").length;
    const list = Array.from(files).slice(0, Math.max(0, room));

    for (const file of list) {
      const id = file.name + "-" + Date.now() + "-" + Math.random();
      const previewUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      setPending((prev) => [...prev, { id, previewUrl, status: "uploading" }]);

      try {
        const signResult = await getReturnEvidenceUploadUrl({ filename: file.name, contentType: file.type });
        if (!signResult.success) throw new Error(signResult.error.message);

        const endpoint = `https://api.cloudinary.com/v1_1/${signResult.data.cloudName}/${isVideo ? "video" : "image"}/upload`;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", signResult.data.apiKey);
        formData.append("timestamp", String(signResult.data.timestamp));
        formData.append("signature", signResult.data.signature);
        formData.append("folder", signResult.data.folder);

        const cloudinaryResponse = await fetch(endpoint, { method: "POST", body: formData });
        const uploaded = await cloudinaryResponse.json();
        if (!cloudinaryResponse.ok) throw new Error(uploaded.error?.message ?? "Upload failed");

        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: "done", finalUrl: uploaded.secure_url } : p)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: "error", message } : p)));
      }
    }
  }

  function removeEvidence(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSubmit() {
    setError(null);
    if (evidenceUrls.length === 0) {
      setError("At least one photo or video is required");
      return;
    }
    if (description.trim().length < 10) {
      setError("Please describe the issue in a bit more detail");
      return;
    }
    startTransition(async () => {
      const result = await submitReturnRequest({
        orderId,
        orderItemId: item.id,
        issueType,
        description,
        evidenceUrls,
        contactPhone,
      });
      if (result.success) {
        onSubmitted(result.data.ticketNumber);
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Modal title={`Report an Issue — ${item.name} (${item.size})`} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="muv-error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="issue-type" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Issue type</label>
          <select id="issue-type" className="muv-input" value={issueType} onChange={(e) => setIssueType(e.target.value as typeof issueType)}>
            {returnIssueTypeValues.map((v) => <option key={v} value={v}>{ISSUE_TYPE_LABEL[v]}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="issue-description" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Describe the issue</label>
          <textarea
            id="issue-description"
            className="muv-input"
            style={{ minHeight: 90, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </div>

        <div>
          <label htmlFor="issue-phone" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Contact number</label>
          <input id="issue-phone" className="muv-input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="10-digit mobile number" />
        </div>

        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Photo or video evidence (required)</label>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full text-center"
            style={{ border: "1px dashed var(--card-border)", borderRadius: 12, padding: "18px 12px", cursor: "pointer" }}
            disabled={pending.filter((p) => p.status !== "error").length >= 5}
          >
            <p className="muv-text-body text-sm">Click to select up to 5 photos or a video</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              multiple
              hidden
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </button>

          {pending.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {pending.map((p) => (
                <div key={p.id} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1", border: "1px solid var(--card-border)" }}>
                  {p.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(11,11,15,0.75)" }}>
                      <Loader2 size={16} className="animate-spin" color="#fff" />
                    </div>
                  )}
                  {p.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center text-center px-1" style={{ background: "rgba(11,11,15,0.75)" }}>
                      <span style={{ color: "var(--danger, #f2555c)" }} className="text-[9px]">{p.message ?? "Failed"}</span>
                    </div>
                  )}
                  {p.status === "done" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                  )}
                  <button type="button" onClick={() => removeEvidence(p.id)} className="muv-icon-circle absolute top-1 right-1" style={{ width: 20, height: 20, background: "rgba(11,11,15,0.7)" }} aria-label="Remove">
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button variant="primary" onClick={handleSubmit} disabled={isPending || uploading} className="w-full">
          {isPending ? "Submitting…" : "Submit Request"}
        </Button>
      </div>
    </Modal>
  );
}
