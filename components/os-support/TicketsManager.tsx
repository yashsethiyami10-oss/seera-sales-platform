"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupportTicket } from "@/actions/support";
import { useToast } from "@/components/ui/toast";

type Ticket = { id: string; ticketNumber: string; subject: string; category: string; status: string; priority: string; channel: string; slaBreached: boolean; departmentName: string };
type Department = { id: string; name: string };
type Customer = { id: string; name: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
const CATEGORIES = ["GENERAL_INQUIRY", "COMPLAINT", "PRODUCT_ISSUE", "RETURN_REPLACEMENT", "REFUND", "WARRANTY_CLAIM", "ORDER_STATUS", "BILLING", "FEEDBACK"];
const CHANNELS = ["WEBSITE", "EMAIL", "PHONE", "WHATSAPP", "SOCIAL_MEDIA", "MARKETPLACE", "WALK_IN", "MANUAL_ENTRY"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];
const STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL", "RESOLVED", "CLOSED", "REOPENED"];

export function TicketsManager({ tickets, departments, customers, filters }: { tickets: Ticket[]; departments: Department[]; customers: Customer[]; filters: { status?: string; priority?: string; category?: string; q?: string } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [channel, setChannel] = useState("MANUAL_ENTRY");
  const [category, setCategory] = useState("GENERAL_INQUIRY");
  const [priority, setPriority] = useState("NORMAL");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  async function submit() {
    setPending(true);
    const result = await createSupportTicket({ customerId, departmentId, channel, category, priority, subject, description });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Ticket ${result.data.ticketNumber} created`, { tone: "dark" });
    setSubject(""); setDescription("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Ticket</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent sm:col-span-2" style={fieldStyle} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent sm:col-span-3" style={fieldStyle} />
        </div>
        <button type="button" onClick={submit} disabled={pending || !subject || !description} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Ticket</button>
      </div>

      <form className="flex flex-wrap gap-2">
        <select name="status" defaultValue={filters.status ?? ""} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="priority" defaultValue={filters.priority ?? ""} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="category" defaultValue={filters.category ?? ""} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="q" defaultValue={filters.q ?? ""} placeholder="Search ticket # or subject" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <button type="submit" className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Filter</button>
      </form>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Ticket #", "Subject", "Category", "Department", "Priority", "Status", "SLA"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {tickets.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No tickets yet.</td></tr> :
              tickets.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs"><Link href={`/os/support/tickets/${t.id}`} style={{ color: "var(--lavender)" }}>{t.ticketNumber}</Link></td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{t.subject}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t.category}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t.departmentName}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t.priority}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t.status}</td>
                  <td className="px-4 py-3">{t.slaBreached ? <span style={{ color: "#ef4444" }}>Breached</span> : <span style={{ color: "rgba(var(--text-rgb),0.4)" }}>OK</span>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
