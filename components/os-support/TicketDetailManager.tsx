"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  transitionTicketStatus, reopenTicket, assignTicket, transferDepartment, setPriority, escalateTicket,
  addSupportMessage, addTicketNote, scheduleFollowUp, completeFollowUp,
  createProductIssueReport, createReturnRequest, approveReturnRequest,
  createRefundRequest, approveRefundRequest, rejectRefundRequest,
} from "@/actions/support";
import { useToast } from "@/components/ui/toast";

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
const cardStyle = { border: "1px solid var(--card-border)" } as const;
const STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL", "RESOLVED", "CLOSED", "REOPENED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];

type TicketDetail = {
  id: string; ticketNumber: string; subject: string; description: string; category: string; status: string; priority: string;
  channel: string; customerId: string; orderId: string | null; version: number; departmentId: string; assignedToId: string | null;
  slaBreached: boolean; reopenedCount: number;
  customer: { id: string; name: string; email: string; phone: string | null } | null;
  messages: { id: string; direction: string; authorType: string; body: string; sentAt: Date }[];
  notes: { id: string; authorId: string; body: string; createdAt: Date }[];
  attachments: { id: string; url: string; fileName: string; uploadedAt: Date }[];
  followUps: { id: string; dueAt: Date; status: string; note: string | null }[];
  escalations: { id: string; level: number; reason: string; escalatedAt: Date; resolvedAt: Date | null }[];
  productIssueReport: { id: string; issueType: string; rootCauseNotes: string | null } | null;
  returnRequest: { ticketId: string; status: string; version: number; requestType: string } | null;
  refundRequest: { ticketId: string; status: string; version: number; requestedAmount: unknown; reason: string } | null;
  csatResponse: { score: number; respondedAt: Date | null } | null;
};

export function TicketDetailManager({ ticket, timeline, departments }: { ticket: TicketDetail; timeline: { source: string; type: string; at: Date; summary: string }[]; departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");

  async function act<T>(fn: () => Promise<{ success: true; data: T } | { success: false; error: { message: string } }>, successMessage: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(successMessage, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
          <div className="flex flex-wrap gap-2 items-center">
            <select defaultValue={ticket.status} onChange={(e) => act(() => transitionTicketStatus(ticket.id, ticket.version, e.target.value), "Status updated")} disabled={pending} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
              {STATUSES.filter((s) => s !== "REOPENED").map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select defaultValue={ticket.priority} onChange={(e) => act(() => setPriority(ticket.id, ticket.version, e.target.value), "Priority updated")} disabled={pending} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select defaultValue={ticket.departmentId} onChange={(e) => act(() => transferDepartment(ticket.id, ticket.version, e.target.value), "Department transferred")} disabled={pending} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {(ticket.status === "RESOLVED" || ticket.status === "CLOSED") && (
              <button type="button" onClick={() => act(() => reopenTicket(ticket.id, ticket.version, "Reopened from ticket detail"), "Ticket reopened")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Reopen</button>
            )}
            <button type="button" onClick={() => act(() => escalateTicket(ticket.id, "Escalated from ticket detail"), "Escalated")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Escalate</button>
            {ticket.slaBreached && <span className="text-xs" style={{ color: "#ef4444" }}>SLA breached</span>}
          </div>
          <div className="flex gap-2">
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assign to user id" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} />
            <button type="button" onClick={() => act(() => assignTicket(ticket.id, ticket.version, assignee), "Assigned")} disabled={pending || !assignee} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Assign</button>
          </div>
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{ticket.description}</p>
        </div>

        <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Conversation</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {ticket.messages.length === 0 ? <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No messages yet.</p> :
              ticket.messages.map((m) => (
                <div key={m.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.75)" }}>
                  <span className="font-medium">{m.authorType} ({m.direction}):</span> {m.body}
                </div>
              ))}
          </div>
          <div className="flex gap-2">
            <input value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Reply to customer" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} />
            <button type="button" onClick={() => { act(() => addSupportMessage({ ticketId: ticket.id, direction: "OUTBOUND", authorType: "AGENT", channel: ticket.channel, body: messageBody }), "Message sent"); setMessageBody(""); }} disabled={pending || !messageBody} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Send</button>
          </div>
        </div>

        <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Internal Notes</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {ticket.notes.length === 0 ? <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No notes yet.</p> :
              ticket.notes.map((n) => <div key={n.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{n.body}</div>)}
          </div>
          <div className="flex gap-2">
            <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Internal note (never customer-visible)" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} />
            <button type="button" onClick={() => { act(() => addTicketNote({ ticketId: ticket.id, body: noteBody }), "Note added"); setNoteBody(""); }} disabled={pending || !noteBody} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add</button>
          </div>
        </div>

        <div className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Follow-ups</p>
          {ticket.followUps.map((f) => (
            <div key={f.id} className="flex justify-between items-center text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
              <span>{new Date(f.dueAt).toLocaleString()} — {f.note ?? ""} ({f.status})</span>
              {f.status === "PENDING" && <button type="button" onClick={() => act(() => completeFollowUp(f.id), "Follow-up completed")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Done</button>}
            </div>
          ))}
          <div className="flex gap-2">
            <input type="datetime-local" value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
            <button type="button" onClick={() => act(() => scheduleFollowUp({ ticketId: ticket.id, dueAt: followUpDue, assignedToId: ticket.assignedToId ?? assignee }), "Follow-up scheduled")} disabled={pending || !followUpDue} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Schedule</button>
          </div>
        </div>

        {ticket.category === "PRODUCT_ISSUE" && (
          <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
            <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Product Issue</p>
            {ticket.productIssueReport ? (
              <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>Issue type: {ticket.productIssueReport.issueType}</p>
            ) : (
              <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No product issue report filed yet.</p>
            )}
          </div>
        )}

        {ticket.category === "RETURN_REPLACEMENT" && (
          <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
            <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Return / Replacement</p>
            {ticket.returnRequest ? (
              <div className="flex justify-between items-center text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
                <span>{ticket.returnRequest.requestType} — {ticket.returnRequest.status}</span>
                {ticket.returnRequest.status === "SUBMITTED" && <button type="button" onClick={() => act(() => approveReturnRequest(ticket.id, ticket.returnRequest!.version), "Return approved")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Approve</button>}
              </div>
            ) : ticket.orderId ? (
              <button type="button" onClick={() => act(() => createReturnRequest({ ticketId: ticket.id, orderId: ticket.orderId, requestType: "RETURN" }), "Return request created")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Create Return Request</button>
            ) : <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Ticket has no linked order.</p>}
          </div>
        )}

        {ticket.category === "REFUND" && (
          <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
            <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Refund Request</p>
            {ticket.refundRequest ? (
              <div className="flex justify-between items-center text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
                <span>₹{String(ticket.refundRequest.requestedAmount)} — {ticket.refundRequest.status}</span>
                {ticket.refundRequest.status === "PENDING_APPROVAL" && (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => act(() => approveRefundRequest(ticket.id, ticket.refundRequest!.version), "Refund approved")} disabled={pending} className="muv-os-btn-primary rounded-lg px-2 py-1 text-xs" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Approve</button>
                    <button type="button" onClick={() => act(() => rejectRefundRequest(ticket.id, ticket.refundRequest!.version, "Rejected from ticket detail"), "Refund rejected")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Reject</button>
                  </span>
                )}
              </div>
            ) : ticket.orderId ? (
              <button type="button" onClick={() => act(() => createRefundRequest({ ticketId: ticket.id, orderId: ticket.orderId, requestedAmount: 1, reason: "Customer requested refund" }), "Refund request created")} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Create Refund Request</button>
            ) : <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Ticket has no linked order.</p>}
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Maker-checker enforced: the approver must differ from whoever prepared the request.</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Customer</p>
          {ticket.customer && <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{ticket.customer.name} — {ticket.customer.email}</p>}
        </div>
        <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Escalations</p>
          {ticket.escalations.length === 0 ? <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>None.</p> :
            ticket.escalations.map((e) => <p key={e.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>Level {e.level}: {e.reason} {e.resolvedAt ? "(resolved)" : ""}</p>)}
        </div>
        <div className="muv-os-card rounded-2xl p-4 space-y-2" style={cardStyle}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Customer Timeline</p>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {timeline.slice(0, 40).map((e, i) => (
              <div key={i} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.65)" }}>
                <span style={{ color: "rgba(var(--text-rgb),0.4)" }}>[{e.source}]</span> {e.summary}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
