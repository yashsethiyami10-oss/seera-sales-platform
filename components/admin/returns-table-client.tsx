"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateReturnRequestStatus } from "@/actions/returns";
import { RETURN_REQUEST_ALLOWED_TRANSITIONS, returnRequestStatusValues } from "@/lib/validations/returns";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/primitives";

type ReturnRequestRow = {
  id: string;
  ticketNumber: string;
  orderNumber: string;
  itemName: string;
  itemSize: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  issueType: "DAMAGED" | "LEAKED" | "WRONG_PRODUCT";
  description: string;
  evidenceUrls: string[];
  contactPhone: string;
  status: (typeof returnRequestStatusValues)[number];
  adminNotes: string | null;
  createdAt: string;
};

const STATUS_TONE: Record<ReturnRequestRow["status"], "positive" | "neutral" | "muted"> = {
  SUBMITTED: "positive",
  UNDER_REVIEW: "neutral",
  APPROVED: "positive",
  REJECTED: "muted",
  REPLACEMENT_INITIATED: "positive",
  RESOLVED: "muted",
};

const ISSUE_LABEL: Record<ReturnRequestRow["issueType"], string> = {
  DAMAGED: "Damaged",
  LEAKED: "Leaked",
  WRONG_PRODUCT: "Wrong product",
};

/**
 * Phase 1D — status change calls the real updateReturnRequestStatus Server
 * Action (actions/returns.ts), which independently enforces requireStaff()
 * and the ALLOWED_TRANSITIONS state machine itself. Same list-with-inline-
 * controls pattern as InquiriesTableClient, extended with an evidence
 * gallery since evidence review is the whole point of this queue.
 */
export function ReturnsTableClient({ requests }: { requests: ReturnRequestRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function changeStatus(id: string, status: ReturnRequestRow["status"]) {
    startTransition(async () => {
      const result = await updateReturnRequestStatus({ returnRequestId: id, status });
      if (result.success) {
        showToast("Status updated");
        router.refresh();
      } else {
        showToast(result.error.message);
      }
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {["Ticket", "Order", "Item", "Customer", "Issue", "Submitted", "Status", ""].map((h) => (
              <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const allowedNext = RETURN_REQUEST_ALLOWED_TRANSITIONS[r.status];
            return (
              <Fragment key={r.id}>
                <tr>
                  <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>#{r.ticketNumber}</td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <Link href={`/admin/orders`} className="muv-footer-link muv-text-body">{r.orderNumber}</Link>
                  </td>
                  <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{r.itemName} ({r.itemSize})</td>
                  <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    {r.customerName}
                    <div className="muv-text-meta text-xs">{r.customerEmail}</div>
                  </td>
                  <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{ISSUE_LABEL[r.issueType]}</td>
                  <td className="py-3 px-3 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs"
                        style={{ color: "var(--lavender)" }}
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      >
                        {expanded === r.id ? "Hide" : "Review"}
                      </button>
                      {allowedNext.length > 0 && (
                        <select
                          aria-label={`Change status for ticket ${r.ticketNumber}`}
                          className="muv-input"
                          style={{ minHeight: 32, fontSize: 12, padding: "2px 6px" }}
                          value=""
                          disabled={isPending}
                          onChange={(e) => e.target.value && changeStatus(r.id, e.target.value as ReturnRequestRow["status"])}
                        >
                          <option value="">Move to…</option>
                          {allowedNext.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={8} className="py-4 px-3" style={{ borderBottom: "1px solid var(--card-border)", background: "rgba(255,255,255,0.02)" }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="muv-text-meta text-xs uppercase tracking-wide mb-1.5">Description</p>
                          <p className="muv-text-body text-sm mb-3" style={{ lineHeight: 1.7 }}>{r.description}</p>
                          <p className="muv-text-meta text-xs uppercase tracking-wide mb-1.5">Contact number</p>
                          <p className="muv-text-body text-sm">{r.contactPhone}</p>
                          {r.adminNotes && (
                            <>
                              <p className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 mt-3">Admin notes</p>
                              <p className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>{r.adminNotes}</p>
                            </>
                          )}
                        </div>
                        <div>
                          <p className="muv-text-meta text-xs uppercase tracking-wide mb-1.5">Evidence ({r.evidenceUrls.length})</p>
                          <div className="grid grid-cols-3 gap-2">
                            {r.evidenceUrls.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden" style={{ aspectRatio: "1", border: "1px solid var(--card-border)" }}>
                                {url.match(/\.(mp4|mov|webm)$/i) ? (
                                  // eslint-disable-next-line jsx-a11y/media-has-caption
                                  <video src={url} className="w-full h-full object-cover" muted />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={url} alt="Return evidence" className="w-full h-full object-cover" />
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {requests.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center muv-text-meta text-sm">No return or replacement requests found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
