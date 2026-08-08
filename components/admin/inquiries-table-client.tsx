"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInquiryStatus } from "@/actions/inquiries";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/primitives";

type Inquiry = {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  businessType: string;
  city: string;
  state: string;
  message: string;
  status: "NEW" | "CONTACTED" | "CLOSED";
  createdAt: string;
};

const STATUS_TONE: Record<Inquiry["status"], "positive" | "neutral" | "muted"> = {
  NEW: "positive",
  CONTACTED: "neutral",
  CLOSED: "muted",
};

/**
 * Phase 1C (GAP-006) — status change calls the real updateInquiryStatus
 * Server Action (actions/inquiries.ts), which independently enforces
 * requireStaff() itself. Follows the same list-with-inline-controls pattern
 * as CategoriesTableClient rather than introducing a new admin UI shape.
 */
export function InquiriesTableClient({ inquiries }: { inquiries: Inquiry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function changeStatus(id: string, status: Inquiry["status"]) {
    startTransition(async () => {
      const result = await updateInquiryStatus({ id, status });
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
            {["Company", "Contact", "Type", "Location", "Submitted", "Status", ""].map((h) => (
              <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inquiries.map((inq) => (
            <Fragment key={inq.id}>
              <tr>
                <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>{inq.companyName}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {inq.contactPerson}
                  <div className="muv-text-meta text-xs">{inq.email} · {inq.phone}</div>
                </td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{inq.businessType}</td>
                <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{inq.city}, {inq.state}</td>
                <td className="py-3 px-3 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {new Date(inq.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <Badge tone={STATUS_TONE[inq.status]}>{inq.status}</Badge>
                </td>
                <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs"
                      style={{ color: "var(--lavender)" }}
                      onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}
                    >
                      {expanded === inq.id ? "Hide" : "View"}
                    </button>
                    <select
                      aria-label={`Change status for ${inq.companyName}`}
                      className="muv-input"
                      style={{ minHeight: 32, fontSize: 12, padding: "2px 6px" }}
                      value={inq.status}
                      disabled={isPending}
                      onChange={(e) => changeStatus(inq.id, e.target.value as Inquiry["status"])}
                    >
                      <option value="NEW">New</option>
                      <option value="CONTACTED">Contacted</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </div>
                </td>
              </tr>
              {expanded === inq.id && (
                <tr>
                  <td colSpan={7} className="py-3 px-3 muv-text-body text-sm" style={{ borderBottom: "1px solid var(--card-border)", background: "rgba(255,255,255,0.02)" }}>
                    {inq.message}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {inquiries.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center muv-text-meta text-sm">No business inquiries found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
