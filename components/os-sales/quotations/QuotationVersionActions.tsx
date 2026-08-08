"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitQuotationForApproval, approveQuotation, rejectQuotation, sendQuotation, acceptQuotation, declineQuotation } from "@/actions/inst-quotations";
import { createBusinessOrderFromQuotation } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";

const ACCEPTANCE_METHODS: { value: string; label: string }[] = [
  { value: "VERBAL_CONFIRMATION", label: "Verbal Confirmation" },
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "SIGNED_COPY", label: "Signed Copy" },
  { value: "CUSTOMER_PORTAL", label: "Customer Portal" },
  { value: "OTHER", label: "Other" },
];

/**
 * Milestone 4.1 — Quotation Acceptance Workflow Enhancement. "Accept
 * Quotation" opens a dialog (acceptance method + optional remarks); on
 * confirm, acceptQuotation runs the entire accept-and-create-order sequence
 * as one atomic transaction (actions/inst-quotations.ts) — no second screen,
 * no separate "Create Order" click for anything accepted through this
 * dialog. The `existingOrderId` branch below is now reachable only for
 * quotations accepted before this change shipped (legacy rows stuck
 * ACCEPTED with no order) — the new flow makes that combination impossible
 * for anything accepted going forward, since the whole transaction rolls
 * back together if order creation fails.
 */
export function QuotationVersionActions({ versionId, status, canApprove, existingOrderId }: { versionId: string; status: string; canApprove: boolean; existingOrderId?: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [acceptanceMethod, setAcceptanceMethod] = useState("");
  const [remarks, setRemarks] = useState("");

  async function run(fn: (input: unknown) => Promise<{ success: boolean; error?: { message: string } }>, input: unknown, label: string) {
    setPending(true);
    const result = await fn(input);
    setPending(false);
    if (!result.success) { showToast(result.error!.message, { tone: "dark" }); return; }
    showToast(label, { tone: "dark" });
    router.refresh();
  }

  async function confirmAcceptance() {
    if (!acceptanceMethod) return;
    setPending(true);
    const result = await acceptQuotation({ versionId, acceptanceMethod, remarks: remarks.trim() || undefined });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    setAcceptDialogOpen(false);
    showToast(`Order ${result.data.orderNumber} created`, { tone: "dark" });
    router.push(`/os/orders/business/${result.data.id}`);
  }

  /** Legacy-only fallback — see the component doc comment above. */
  async function createOrderLegacyFallback() {
    setPending(true);
    const result = await createBusinessOrderFromQuotation({ quotationVersionId: versionId });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Order ${result.data.orderNumber} created`, { tone: "dark" });
    router.push(`/os/orders/business/${result.data.id}`);
  }

  const btn = "muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && (
        <button type="button" disabled={pending} onClick={() => run(submitQuotationForApproval, { versionId }, "Submitted for approval")} className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Submit for Approval</button>
      )}
      {status === "PENDING_APPROVAL" && canApprove && (
        <>
          <button type="button" disabled={pending} onClick={() => run(approveQuotation, { versionId }, "Approved")} className={btn} style={{ border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}>Approve</button>
          <button type="button" disabled={pending} onClick={() => run(rejectQuotation, { versionId, reason }, "Rejected")} className={btn} style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Reject</button>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason…" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.85)" }} />
        </>
      )}
      {status === "APPROVED" && (
        <>
          <button type="button" disabled={pending} onClick={() => run(sendQuotation, { versionId, channel: "WHATSAPP" }, "Sent via WhatsApp")} className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Send via WhatsApp</button>
          <button type="button" disabled={pending} onClick={() => run(sendQuotation, { versionId, channel: "EMAIL" }, "Sent via Email")} className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Send via Email</button>
        </>
      )}
      {status === "SENT" && (
        <>
          <button type="button" disabled={pending} onClick={() => setAcceptDialogOpen(true)} className={btn} style={{ border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}>Accept Quotation</button>
          <button type="button" disabled={pending} onClick={() => run(declineQuotation, { versionId, reason }, "Rejected")} className={btn} style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Reject Quotation</button>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason…" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.85)" }} />
        </>
      )}
      {status === "ACCEPTED" && (
        existingOrderId ? (
          <a href={`/os/orders/business/${existingOrderId}`} className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>View Order</a>
        ) : (
          <button type="button" disabled={pending} onClick={createOrderLegacyFallback} className={btn} style={{ border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }} title="Legacy quotation accepted before v4.1 — no order was auto-created">Create Order</button>
        )
      )}
      <button type="button" onClick={() => window.print()} className={btn} style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.7)" }}>Print / Save as PDF</button>

      {acceptDialogOpen && (
        <Modal title="Accept Quotation" onClose={() => setAcceptDialogOpen(false)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="acceptance-method" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Acceptance Method *</label>
              <select id="acceptance-method" className="muv-input" value={acceptanceMethod} onChange={(e) => setAcceptanceMethod(e.target.value)}>
                <option value="">Select how the customer accepted…</option>
                {ACCEPTANCE_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="acceptance-remarks" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Remarks (optional)</label>
              <textarea id="acceptance-remarks" className="muv-input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any additional context…" />
            </div>
            <Button variant="primary" onClick={confirmAcceptance} disabled={pending || !acceptanceMethod} className="w-full">
              {pending ? "Creating order…" : "Confirm Acceptance"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
