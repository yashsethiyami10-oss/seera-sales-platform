"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./WorkflowActions.module.css";
import type { FinanceWorkspaceData } from "@/lib/finance/founder-workspace-data";
import { PartyLedgerStatement } from "./PartyLedgerStatement";

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

async function getReport(report: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ report, ...params }).toString();
  const r = await fetch(`/api/finance/company-reports?${qs}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Report failed");
  return d;
}

const money = (v: number | null | undefined) => `₹${Math.round(Number(v ?? 0)).toLocaleString("en-IN")}`;

// Client-side CSV export — exports exactly the filtered rows currently
// rendered on screen (spec: "must use the SAME filtered data currently
// visible"), no separate server round trip that could drift from the view.
function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
const key = () => crypto.randomUUID();
const fmtDate = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");
const isoDate = (v: string | Date) => new Date(v).toISOString().slice(0, 10);

// --- Accounting Impact Panel (read-only) -----------------------------------
type JournalDetail = { id: string; journalNumber: string; date: string; sourceType: string; status: string; narration: string; originalJournalId: string | null; lines: { id: string; accountId: string; accountName: string; debit: number; credit: number; description: string | null }[] };
function AccountingImpactPanel({ journalId }: { journalId: string }) {
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getReport("journal-detail", { journalId }).then(setDetail).catch((e) => setErr(e instanceof Error ? e.message : "Failed")); }, [journalId]);
  if (err) return <p role="status" data-ok="false">{err}</p>;
  if (!detail) return <p>Loading…</p>;
  return (
    <div className={styles.tableWrap}>
      <p><strong>{detail.journalNumber}</strong> — {detail.sourceType} — {fmtDate(detail.date)} — {detail.status}{detail.originalJournalId ? " (reversal)" : ""}</p>
      <table>
        <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
        <tbody>{detail.lines.map((l) => <tr key={l.id}><td>{l.accountId} — {l.accountName}</td><td>{l.debit ? money(l.debit) : ""}</td><td>{l.credit ? money(l.credit) : ""}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
function ViewJournalButton({ journalId }: { journalId: string | null }) {
  const [open, setOpen] = useState(false);
  if (!journalId) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)}>{open ? "HIDE JOURNAL" : "VIEW JOURNAL"}</button>
      {open && <AccountingImpactPanel journalId={journalId} />}
    </>
  );
}

// --- Inline document attach (Expense/Vendor Bill/Loan/Fixed Asset) ---------
function DocAttach({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [docs, setDocs] = useState<{ id: string; originalName: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  function load() {
    getReport("documents-for", { entityType, entityId }).then(setDocs).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => { load(); }, [entityId]);
  function upload(file: File) {
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.append("file", file);
    form.append("metadata", JSON.stringify({ entityType, entityId }));
    fetch("/api/finance/documents/upload", { method: "POST", body: form })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error?.message ?? "Upload failed"); load(); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Upload failed"))
      .finally(() => setBusy(false));
  }
  return (
    <details>
      <summary>Documents {docs ? `(${docs.length})` : ""}</summary>
      {err && <p role="status" data-ok="false">{err}</p>}
      <ul>{docs?.map((d) => <li key={d.id}><a href={`/api/finance/documents/${d.id}/download`} target="_blank" rel="noreferrer">{d.originalName}</a></li>)}</ul>
      <input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </details>
  );
}

type Ctx = {
  portal: string;
  isFounder: boolean;
  data: FinanceWorkspaceData;
  busy: boolean;
  run: (action: string, payload: unknown, successText: string, next?: () => void) => void;
  router: ReturnType<typeof useRouter>;
};

// Information Architecture Restructure — PRIMARY nav answers "what do I want to do?"
// (Overview / Money / Sales / Purchases / Parties / Reports), never "which internal module?".
// Genuinely administrative/setup functions (Quick Entry, Categories, Employees, Treasury account
// management, Control, Documents, Search, Settings) live under one "More" overflow instead of
// competing for primary-pill space — max 6 primary pills, always.
const PRIMARY_GROUPS = ["overview", "money", "sales", "purchases", "parties", "reports"] as const;
const MORE_GROUPS = ["quickentry", "categories", "employees", "treasury", "control", "documents", "search", "settings"] as const;
const GROUPS = [...PRIMARY_GROUPS, ...MORE_GROUPS] as const;
type Group = (typeof GROUPS)[number];
const GROUP_LABEL: Record<Group, string> = { overview: "Overview", money: "Money", sales: "Sales", purchases: "Purchases", parties: "Parties", reports: "Reports", quickentry: "+ Quick Entry", categories: "Categories", employees: "Employees", treasury: "Treasury Accounts", control: "Control", documents: "Documents", search: "Search", settings: "Settings" };
const GROUP_SECTIONS: Record<Group, { key: string; label: string }[]> = {
  overview: [],
  money: [{ key: "moneyin", label: "Money In" }, { key: "moneyout", label: "Money Out" }, { key: "transfer", label: "Transfer" }, { key: "statement", label: "Statement Import" }, { key: "reconcile", label: "Reconciliation" }, { key: "journals", label: "Recent Journals" }],
  sales: [{ key: "invoices", label: "Invoices" }, { key: "register", label: "Sales Register" }, { key: "ledger", label: "Party Ledgers" }, { key: "advances", label: "Customer Advances" }, { key: "receipts", label: "Receipts" }],
  purchases: [{ key: "vendors", label: "Purchase Bills & Vendors" }, { key: "expenses", label: "Expenses" }, { key: "recurring", label: "Recurring Expenses" }, { key: "payroll", label: "Payroll" }, { key: "marketing", label: "Marketing Spend" }],
  parties: [],
  reports: [{ key: "pl", label: "P&L" }, { key: "bs", label: "Balance Sheet" }, { key: "cf", label: "Cash Flow" }, { key: "trial", label: "Trial Balance" }, { key: "forecast", label: "Forecast" }, { key: "gst", label: "GST Control" }, { key: "sales-reports", label: "Sales Reports" }, { key: "purchase-reports", label: "Purchase Reports" }],
  quickentry: [],
  categories: [],
  employees: [],
  treasury: [],
  control: [{ key: "budgets", label: "Budgets" }, { key: "approvals", label: "Approvals" }, { key: "capital", label: "Capital & Drawings" }, { key: "loans", label: "Loans" }, { key: "assets", label: "Fixed Assets" }, { key: "period", label: "Period Close" }],
  documents: [],
  search: [],
  settings: [],
};

export function FinanceWorkspacePanel({ portal, data }: { portal: string; data: FinanceWorkspaceData }) {
  const router = useRouter();
  // Bidirectional navigation (Founder closure pass, 24-Aug §7): a Money Desk transaction's "View
  // Ledger" link needs a REAL deep link into this panel's Ledgers tab with the right party
  // pre-selected — read the initial group/section (and, for Ledgers, partyType/partyId) from the
  // URL once on mount rather than always defaulting to Overview.
  const searchParams = useSearchParams();
  const initialGroup = (searchParams.get("group") as Group | null) ?? "overview";
  const [group, setGroup] = useState<Group>(GROUPS.includes(initialGroup) ? initialGroup : "overview");
  const [section, setSection] = useState<string>(searchParams.get("section") ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showInvoiceWizard, setShowInvoiceWizard] = useState(false);
  const isFounder = portal === "founder-admin" || portal === "company-admin";
  const visibleMoreGroups = MORE_GROUPS.filter((g) => g !== "control" || data.budgets !== null || data.loans !== null).filter((g) => g !== "settings" || isFounder);

  function run(action: string, payload: unknown, successText: string, next?: () => void) {
    setBusy(true);
    setMessage(null);
    post(action, payload)
      .then(() => { setMessage({ ok: true, text: successText }); router.refresh(); next?.(); })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Action failed" }))
      .finally(() => setBusy(false));
  }
  const ctx: Ctx = { portal, isFounder, data, busy, run, router };

  function jump(g: Group, s: string) { setGroup(g); setSection(s); setMoreOpen(false); }

  const mountedWithDeepLink = useRef(Boolean(searchParams.get("section")));
  useEffect(() => {
    if (mountedWithDeepLink.current) { mountedWithDeepLink.current = false; return; }
    setSection(GROUP_SECTIONS[group][0]?.key ?? "");
  }, [group]);

  return (
    <section className={styles.panel}>
      <header className={styles.workspaceHeader}>
        <div>
          <span className={styles.workspaceEyebrow}>{isFounder ? "FOUNDER FINANCE" : "ACCOUNTS"}</span>
          <h2>Finance</h2>
          <p className={styles.workspaceSubtitle}>Founder Finance Control Centre — cash, parties, invoices, purchases and financial statements, one place.</p>
        </div>
        <div className={styles.workspaceHeaderActions}>
          <a className={styles.accent} href={"/portal/"+portal+"/money-desk"}>Money Desk</a>
        </div>
      </header>
      <div className={styles.groupNav} role="tablist" aria-label="Finance groups">
        {PRIMARY_GROUPS.map((g) => (
          <button key={g} type="button" onClick={() => jump(g, "")} aria-pressed={group === g}>{GROUP_LABEL[g]}</button>
        ))}
        <div className={styles.moreMenu}>
          <button type="button" className={styles.moreMenuButton} aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>More {moreOpen ? "▴" : "▾"}</button>
          {moreOpen && (
            <div className={styles.moreMenuPanel} role="menu">
              {visibleMoreGroups.map((g) => (
                <button key={g} type="button" role="menuitem" aria-pressed={group === g} onClick={() => jump(g, "")}>{GROUP_LABEL[g]}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {GROUP_SECTIONS[group].length > 0 && (
        <div className={styles.sectionNav} role="tablist" aria-label="Finance sections">
          {GROUP_SECTIONS[group].map((s) => (
            <button key={s.key} type="button" onClick={() => setSection(s.key)} aria-pressed={section === s.key}>{s.label}</button>
          ))}
        </div>
      )}
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}

      <div style={{ gridColumn: "1/-1" }}>
        {group === "overview" && <OverviewSection ctx={ctx} jump={jump} onCreateInvoice={() => setShowInvoiceWizard(true)} />}
        {group === "quickentry" && <QuickEntrySection ctx={ctx} />}
        {group === "categories" && <CategoriesSection ctx={ctx} />}
        {group === "employees" && <EmployeesSection />}
        {group === "treasury" && <TreasuryAccountsSection ctx={ctx} />}
        {group === "money" && section === "moneyin" && <MoneyInSection ctx={ctx} />}
        {group === "money" && section === "moneyout" && <MoneyOutSection ctx={ctx} />}
        {group === "money" && section === "transfer" && <TransferSection ctx={ctx} />}
        {group === "money" && section === "statement" && <StatementImportSection ctx={ctx} />}
        {group === "money" && section === "reconcile" && <ReconciliationSection ctx={ctx} />}
        {group === "money" && section === "journals" && <RecentJournalsSection />}
        {group === "sales" && section === "invoices" && <InvoicesSection portal={portal} onCreateInvoice={() => setShowInvoiceWizard(true)} />}
        {group === "sales" && section === "register" && <SalesRegisterSection />}
        {group === "sales" && section === "ledger" && <PartyLedgerStatement portal={portal} />}
        {group === "sales" && section === "advances" && <CustomerAdvancesSection />}
        {group === "sales" && section === "receipts" && <ReceiptsSection />}
        {group === "purchases" && section === "vendors" && <VendorsSection ctx={ctx} />}
        {group === "purchases" && section === "expenses" && <ExpensesSection ctx={ctx} />}
        {group === "purchases" && section === "recurring" && <RecurringSection ctx={ctx} />}
        {group === "purchases" && section === "payroll" && <PayrollSection ctx={ctx} />}
        {group === "purchases" && section === "marketing" && <MarketingSection />}
        {group === "parties" && <PartiesSection portal={portal} jump={jump} />}
        {group === "control" && section === "budgets" && <BudgetsSection ctx={ctx} />}
        {group === "control" && section === "approvals" && <ApprovalsSection ctx={ctx} />}
        {group === "control" && section === "capital" && <CapitalSection ctx={ctx} />}
        {group === "control" && section === "loans" && <LoansSection ctx={ctx} />}
        {group === "control" && section === "assets" && <AssetsSection ctx={ctx} />}
        {group === "control" && section === "period" && <PeriodSection ctx={ctx} />}
        {group === "reports" && ["pl", "bs", "cf", "trial", "forecast", "gst"].includes(section) && <StatementsSection ctx={ctx} section={section} />}
        {group === "reports" && (section === "sales-reports" || section === "purchase-reports") && <ReportsCenterSection scope={section === "sales-reports" ? "sales" : "purchases"} />}
        {group === "documents" && <DocumentsSection />}
        {group === "search" && <SearchSection />}
        {group === "settings" && isFounder && <SettingsSection ctx={ctx} />}
      </div>
      {showInvoiceWizard && <CreateInvoiceWizard portal={portal} onClose={() => setShowInvoiceWizard(false)} onIssued={() => { setShowInvoiceWizard(false); router.refresh(); }} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------
function OverviewSection({ ctx, jump, onCreateInvoice }: { ctx: Ctx; jump: (g: Group, s: string) => void; onCreateInvoice: () => void }) {
  const { data } = ctx;
  return (
    <div className={styles.notice} data-ok="true">
      {/* Section 4/15 — Overview leads with the primary business actions, not a link dump.
          Create Invoice must be reachable in ONE click from here (the discoverability test). */}
      <div className={styles.ctaRow}>
        <button type="button" className={styles.ctaPrimary} onClick={onCreateInvoice}>+ CREATE INVOICE</button>
        <button type="button" className={styles.ctaSecondary} onClick={() => jump("money", "moneyin")}>+ MONEY IN</button>
        <button type="button" className={styles.ctaSecondary} onClick={() => jump("money", "moneyout")}>+ MONEY OUT</button>
      </div>
      <div className={styles.inlineActions}>
        <button type="button" onClick={() => jump("quickentry", "")} style={{ fontWeight: 700 }}>+ QUICK ENTRY</button>
        <button type="button" onClick={() => jump("categories", "")}>CATEGORIES →</button>
        <button type="button" onClick={() => jump("employees", "")}>EMPLOYEES →</button>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <div><dt>Bank + Cash</dt><dd>{data.cf ? money(data.cf.closingCash) : "DATA REQUIRED"}</dd></div>
        <div><dt>Revenue (YTD)</dt><dd>{data.pnl ? money(data.pnl.totalRevenue) : "DATA REQUIRED"} <small>RELIABLE</small></dd></div>
        <div><dt>Operating Expense (YTD)</dt><dd>{data.pnl ? money(data.pnl.totalOperatingExpense) : "DATA REQUIRED"}</dd></div>
        <div><dt>Operating Profit (YTD)</dt><dd>{data.pnl ? money(data.pnl.operatingProfit) : "DATA REQUIRED"} <small>PARTIAL</small></dd></div>
        <div><dt>Company Receivables</dt><dd>{data.bs ? money(data.bs.assets.find((a) => a.code === "1100")?.amount) : "DATA REQUIRED"}</dd></div>
        <div><dt>Trade Payables</dt><dd>{data.bs ? money(data.bs.liabilities.find((l) => l.code === "2000")?.amount) : "DATA REQUIRED"}</dd></div>
        <div><dt>30-day cash forecast</dt><dd>{data.forecast30 ? money(data.forecast30.expectedClosingCash) : "DATA REQUIRED"} {data.forecast30?.shortfall ? <strong>SHORTFALL RISK</strong> : null}</dd></div>
        <div><dt>Trial Balance</dt><dd>{data.trial ? (data.trial.balanced ? "Balanced ✓" : "IMBALANCED") : "DATA REQUIRED"}</dd></div>
      </dl>
      <h3>Attention</h3>
      <div className={styles.inlineActions}>
        {(data.pendingExpenseApprovals?.length ?? 0) > 0 && <button type="button" onClick={() => jump("purchases", "expenses")}>{data.pendingExpenseApprovals!.length} expense(s) awaiting approval →</button>}
        {(data.approvalQueue?.length ?? 0) > 0 && <button type="button" onClick={() => jump("control", "approvals")}>{data.approvalQueue!.length} Finance approval(s) pending →</button>}
        {(data.payables ?? []).filter((b) => b.due > 0 && new Date(b.dueDate) < new Date()).length > 0 && (
          <button type="button" onClick={() => jump("purchases", "vendors")}>{(data.payables ?? []).filter((b) => b.due > 0 && new Date(b.dueDate) < new Date()).length} overdue payable(s) →</button>
        )}
        {(data.recurringDue?.length ?? 0) > 0 && <button type="button" onClick={() => jump("purchases", "recurring")}>{data.recurringDue!.length} recurring expense(s) due →</button>}
        {data.openingBalances && !data.openingBalances.posted && ctx.isFounder && <button type="button" onClick={() => jump("settings", "")}>Opening balances not yet posted →</button>}
      </div>
      {(data.intelligence?.length ?? 0) > 0 && (
        <>
          <h3>Financial Intelligence</h3>
          <ul>
            {data.intelligence!.map((i) => (
              <li key={i.code}><strong>{i.title}</strong> — {i.why} {i.period ? `(${i.period})` : ""}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QUICK ENTRY — Founder's "record an expense/payment/receipt in 10-20
// seconds" primary action. Posts through the SAME governed lifecycle as the
// full Expenses screen (createExpense -> submitExpense -> postExpense) via
// quickEntryCreate() — this form only removes the account-mapping/treasury
// decisions the backend can safely resolve for the user, never the approval
// governance itself (see lib/finance/quick-entry-service.ts).
// ---------------------------------------------------------------------------
const QUICK_ENTRY_TYPES = [
  { value: "EXPENSE", label: "Expense" },
  { value: "ADVANCE", label: "Advance" },
  { value: "REIMBURSEMENT", label: "Reimbursement" },
  { value: "SALARY", label: "Salary" },
  { value: "PAYMENT", label: "Payment" },
  { value: "OTHER", label: "Other" },
];
const CATEGORY_GROUP_TITLE: Record<string, string> = {
  TRANSPORT_LOGISTICS: "Transport / Logistics",
  FACTORY: "Factory",
  LABOUR_STAFF: "Labour / Staff",
  ADMIN_OFFICE: "Admin / Office",
  SALES_MARKETING: "Sales / Marketing",
  PURCHASE_OPERATIONS: "Purchase / Operations",
  FINANCE: "Finance",
  OTHER: "Other",
};
type EmployeeOption = { id: string; label: string };
function EmployeePicker({ value, onChange }: { value: EmployeeOption | null; onChange: (v: EmployeeOption | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string | null; email: string; roleAssignments: { role: { name: string } }[] }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { getReport("search-employees", { q }).then(setResults).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return <p>{value.label} <button type="button" onClick={() => onChange(null)}>Change</button></p>;
  return (
    <div>
      <input placeholder="Search employee by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul>
          {results.map((r) => {
            const label = `${r.name ?? r.email}${r.roleAssignments[0] ? ` — ${r.roleAssignments[0].role.name}` : ""}`;
            return <li key={r.id}><button type="button" onClick={() => onChange({ id: r.id, label })}>{label}</button></li>;
          })}
        </ul>
      )}
    </div>
  );
}
function QuickEntrySection({ ctx }: { ctx: Ctx }) {
  const { data, busy, router } = ctx;
  const [entryType, setEntryType] = useState("EXPENSE");
  const [categoryMode, setCategoryMode] = useState<"select" | "manual">("select");
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const categories = data.expenseCategories ?? [];
  const grouped: Record<string, typeof categories> = {};
  for (const c of categories) (grouped[c.parentGroup ?? "OTHER"] ??= []).push(c);
  const coaCount = data.chartOfAccounts?.length ?? 0;

  if (coaCount === 0) {
    return <p>Chart of Accounts is not configured yet. Go to Tools → Settings and click &quot;BOOTSTRAP CHART OF ACCOUNTS&quot; before using Quick Entry.</p>;
  }
  if (categories.length === 0) {
    return (
      <div>
        <p>Quick Entry categories are not configured yet.</p>
        <button type="button" disabled={busy} onClick={() => ctx.run("seed-quick-entry-categories", {}, "Quick Entry categories seeded.")}>BOOTSTRAP QUICK ENTRY CATEGORIES</button>
      </div>
    );
  }

  function onSubmit(e: { preventDefault: () => void; currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setSaving(true);
    setResult(null);
    void (async () => {
      try {
        let documentFileId: string | undefined;
        const file = f.get("receipt") as File | null;
        if (file && file.size > 0) {
          const uploadForm = new FormData();
          uploadForm.append("file", file);
          uploadForm.append("metadata", JSON.stringify({ entityType: "SeeraExpense", entityId: "quick-entry-pending" }));
          const r = await fetch("/api/finance/documents/upload", { method: "POST", body: uploadForm });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error?.message ?? "Receipt upload failed — only PDF, PNG or JPEG under 25MB");
          documentFileId = d.id;
        }
        const payload: Record<string, unknown> = {
          entryType,
          date: f.get("date"),
          amount: Number(f.get("amount")),
          paymentMode: f.get("paymentMode"),
          remark: f.get("remark") || undefined,
          documentFileId,
          idempotencyKey: key(),
        };
        if (categoryMode === "select") payload.categoryId = f.get("categoryId");
        else { payload.manualCategoryName = f.get("manualCategoryName"); payload.saveManualCategory = f.get("saveManualCategory") === "on"; }
        if (employee) payload.employeeId = employee.id;
        const partyName = f.get("partyName");
        if (partyName) payload.partyName = partyName;
        const res = await post("quick-entry", payload);
        const status = res?.expense?.status;
        const statusText = status === "POSTED" ? "Saved & posted ✓" : status === "APPROVED" ? "Saved — approved, awaiting posting by an Accounts user." : "Saved — pending Founder/Accounts approval.";
        setResult({ ok: true, text: statusText });
        form.reset();
        setEmployee(null);
        setCategoryMode("select");
        router.refresh();
      } catch (err) {
        setResult({ ok: false, text: err instanceof Error ? err.message : "Could not save this entry" });
      } finally {
        setSaving(false);
      }
    })();
  }

  return (
    <div>
      <p>Choose what this is for, enter the amount, add a receipt if you have one, Save. That's it — the correct accounting entry is created automatically.</p>
      <form onSubmit={onSubmit}>
        <label>Entry type
          <select name="entryType" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
            {QUICK_ENTRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <div className={styles.inlineActions}>
          <button type="button" aria-pressed={categoryMode === "select"} onClick={() => setCategoryMode("select")} style={{ fontWeight: categoryMode === "select" ? 700 : 400 }}>Select category</button>
          <button type="button" aria-pressed={categoryMode === "manual"} onClick={() => setCategoryMode("manual")} style={{ fontWeight: categoryMode === "manual" ? 700 : 400 }}>Type a new one</button>
        </div>
        {categoryMode === "select" ? (
          <label>Category
            <select name="categoryId" required>
              {Object.entries(grouped).map(([group, cats]) => (
                <optgroup key={group} label={CATEGORY_GROUP_TITLE[group] ?? group}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>Category name<input name="manualCategoryName" required placeholder="e.g. Factory Cleaning" /></label>
            <label><input name="saveManualCategory" type="checkbox" /> Save as a reusable category (Founder/Admin only — otherwise this still saves, just for this entry)</label>
          </>
        )}
        <label>Amount (₹)<input name="amount" type="number" step="0.01" min="0.01" required /></label>
        <label>Paid / Received via
          <select name="paymentMode" required>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
            <option value="UPI">UPI</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
        <label>Party / Person (optional)<input name="partyName" /></label>
        <div>
          <span>Employee (optional — links to their Financial 360)</span>
          <EmployeePicker value={employee} onChange={setEmployee} />
        </div>
        <label>Remark (optional)<input name="remark" /></label>
        <label>Receipt / document (optional — PDF, PNG or JPEG)<input name="receipt" type="file" accept="image/png,image/jpeg,application/pdf" capture="environment" /></label>
        <button disabled={saving || busy}>{saving ? "Saving…" : "SAVE ENTRY"}</button>
      </form>
      {result && <p role="status" data-ok={result.ok}>{result.text}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CATEGORIES — automatic category ledgers + spending dashboard (spec Parts
// 5-7). Reuses the existing expenseByCategory report for the summary, and
// the new categoryLedger report for the per-category drill-down.
// ---------------------------------------------------------------------------
type CategorySummaryRow = { categoryId: string; categoryName: string; total: number };
type CategoryLedgerData = {
  category: { id: string; name: string; parentGroup: string };
  entries: { id: string; expenseNumber: string; date: string; amount: string; paymentMode: string; payeeName: string | null; employeeId: string | null; status: string; documentFileId: string | null; requestedById: string; description: string | null }[];
  totals: { today: number; thisMonth: number; thisYear: number };
};
function CategoriesSection({ ctx }: { ctx: Ctx }) {
  const { data, busy, run } = ctx;
  const [selected, setSelected] = useState<string | null>(null);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const { data: summary, loading, err } = useReportOnDemand<CategorySummaryRow[]>("expense-by-category", { from: monthStart, to: isoDate(now) }, []);
  const { data: ledger, loading: ledgerLoading, err: ledgerErr } = useReportOnDemand<CategoryLedgerData>("category-ledger", selected ? { categoryId: selected } : {}, [selected]);
  const coaCount = data.chartOfAccounts?.length ?? 0;
  const categoryCount = data.expenseCategories?.length ?? 0;
  if (categoryCount === 0) {
    return (
      <div>
        {coaCount === 0 ? (
          <p>Chart of Accounts is not set up yet. Go to Tools → Settings and click &quot;BOOTSTRAP CHART OF ACCOUNTS&quot; first, then come back here.</p>
        ) : (
          <>
            <p>No expense categories are set up yet.</p>
            <button type="button" disabled={busy} onClick={() => run("seed-quick-entry-categories", {}, "Quick Entry categories seeded.")}>BOOTSTRAP QUICK ENTRY CATEGORIES</button>
          </>
        )}
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <button type="button" onClick={() => setSelected(null)}>← All categories</button>
        {ledgerLoading && <p>Loading…</p>}
        {ledgerErr && <p role="status" data-ok="false">{ledgerErr}</p>}
        {ledger && (
          <>
            <h3>{ledger.category.name}</h3>
            <div className={styles.inlineActions}>
              <span>Today: {money(ledger.totals.today)}</span>
              <span>This month: {money(ledger.totals.thisMonth)}</span>
              <span>This year: {money(ledger.totals.thisYear)}</span>
              <button type="button" onClick={() => exportCsv(`${ledger.category.name}-ledger`, ledger.entries.map((e) => ({ Date: fmtDate(e.date), Expense: e.expenseNumber, Amount: e.amount, Mode: e.paymentMode, Party: e.payeeName ?? "", Status: e.status, Remark: e.description ?? "" })))}>EXPORT CSV</button>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Paid via</th><th>Party/Person</th><th>Status</th><th>Remark</th><th>Receipt</th></tr></thead>
                <tbody>
                  {ledger.entries.length === 0 && <tr><td colSpan={7}>No entries yet.</td></tr>}
                  {ledger.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.date)}</td><td>{money(Number(e.amount))}</td><td>{e.paymentMode}</td><td>{e.payeeName ?? "—"}</td><td>{e.status}</td><td>{e.description ?? "—"}</td>
                      <td>{e.documentFileId ? <a href={`/api/finance/documents/${e.documentFileId}/download`} target="_blank" rel="noreferrer">View</a> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <p>This month's spending by category — click any category to see its full ledger.</p>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Category</th><th>This month</th></tr></thead>
          <tbody>
            {summary && summary.length === 0 && <tr><td colSpan={2}>No expenses posted this month yet.</td></tr>}
            {summary?.map((row) => (
              <tr key={row.categoryId}><td><button type="button" onClick={() => setSelected(row.categoryId)}>{row.categoryName}</button></td><td>{money(row.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMPLOYEES — one-click Employee Financial 360 (spec Part 8-9).
// ---------------------------------------------------------------------------
type Employee360Data = {
  employee: { id: string; name: string | null; email: string; status: string; roleAssignments: { role: { name: string; code: string } }[] };
  entries: { id: string; expenseNumber: string; date: string; entryType: string; amount: string; paymentMode: string; status: string; description: string | null; documentFileId: string | null }[];
  payroll: { id: string; month: string; netPayable: string; status: string; paymentDate: string | null }[];
  summary: { salaryPaidThisMonth: number; advanceBalance: number; reimbursementPending: number; reimbursementPaid: number; incentiveThisYear: number; otherPaymentsThisMonth: number };
};
function Employee360({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const { data, loading, err } = useReportOnDemand<Employee360Data>("employee-financial-360", { employeeId }, [employeeId]);
  return (
    <div>
      <button type="button" onClick={onBack}>← All employees</button>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      {data && (
        <>
          <h3>{data.employee.name ?? data.employee.email}</h3>
          <p>{data.employee.roleAssignments[0]?.role.name ?? "—"} · {data.employee.status}</p>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
            <div><dt>Salary paid this month</dt><dd>{money(data.summary.salaryPaidThisMonth)}</dd></div>
            <div><dt>Advance balance</dt><dd>{money(data.summary.advanceBalance)}</dd></div>
            <div><dt>Reimbursement pending</dt><dd>{money(data.summary.reimbursementPending)}</dd></div>
            <div><dt>Reimbursement paid</dt><dd>{money(data.summary.reimbursementPaid)}</dd></div>
            <div><dt>Other payments this month</dt><dd>{money(data.summary.otherPaymentsThisMonth)}</dd></div>
          </dl>
          <h4>Timeline</h4>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Mode</th><th>Status</th><th>Remark</th><th>Receipt</th></tr></thead>
              <tbody>
                {data.entries.length === 0 && <tr><td colSpan={7}>No entries yet.</td></tr>}
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td><td>{e.entryType}</td><td>{money(Number(e.amount))}</td><td>{e.paymentMode}</td><td>{e.status}</td><td>{e.description ?? "—"}</td>
                    <td>{e.documentFileId ? <a href={`/api/finance/documents/${e.documentFileId}/download`} target="_blank" rel="noreferrer">View</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.payroll.length > 0 && (
            <>
              <h4>Payroll register</h4>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Month</th><th>Net payable</th><th>Status</th><th>Paid on</th></tr></thead>
                  <tbody>{data.payroll.map((p) => <tr key={p.id}><td>{p.month}</td><td>{money(Number(p.netPayable))}</td><td>{p.status}</td><td>{fmtDate(p.paymentDate)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
function EmployeesSection() {
  const [selected, setSelected] = useState<EmployeeOption | null>(null);
  if (selected) return <Employee360 employeeId={selected.id} onBack={() => setSelected(null)} />;
  return (
    <div>
      <p>Search for an employee to open their one-click Financial 360 — Salary, Advances, Reimbursements, Incentives and every payment in one timeline.</p>
      <EmployeePicker value={null} onChange={(v) => v && setSelected(v)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MONEY GROUP
// ---------------------------------------------------------------------------
function BankSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const accounts = data.allTreasuryAccounts ?? data.treasuryAccounts ?? [];
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Account</th><th>Kind</th><th>Code</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={5}>No treasury accounts yet.</td></tr>}
            {accounts.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.kind}</td>
                <td>{t.code}</td>
                <td>{t.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <button type="button" disabled={busy} onClick={() => run("set-treasury-account-active", { treasuryAccountId: t.id, isActive: !t.isActive }, t.isActive ? "Account deactivated." : "Account activated.")}>
                    {t.isActive ? "DEACTIVATE" : "ACTIVATE"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details><summary>+ ADD BANK / CASH ACCOUNT</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-treasury-account", { kind: f.get("kind"), code: String(f.get("code")), name: String(f.get("name")), bankName: f.get("bankName") || undefined, openingBalance: f.get("openingBalance") ? Number(f.get("openingBalance")) : undefined }, "Account created. Next: post its Opening Balance from Tools → Settings."); }}>
          <label>Kind<select name="kind" required><option value="BANK">Bank</option><option value="CASH">Cash</option></select></label>
          <label>Code<input name="code" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Bank name<input name="bankName" /></label>
          <label>Opening balance<input name="openingBalance" type="number" step="0.01" /></label>
          <button disabled={busy}>CREATE ACCOUNT</button>
        </form>
      </details>
    </div>
  );
}

function MoneyInSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("money-in", { type: f.get("type"), date: f.get("date"), amount: Number(f.get("amount")), treasuryAccountId: f.get("treasuryAccountId"), mode: String(f.get("mode")), reference: f.get("reference") || undefined, description: f.get("description") || undefined, idempotencyKey: key() }, "Money In recorded. Next: check Sales Finance → Customer Advances if this was a customer payment.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Type<select name="type" required><option value="OTHER_INCOME">Other income</option><option value="INVOICE_RECEIPT">Invoice receipt</option><option value="OTHER_OPERATING_REVENUE">Other operating revenue</option><option value="REFUND_RECOVERY">Refund recovery</option><option value="BANK_INTEREST">Bank interest</option><option value="OTHER_RECEIPT">Other receipt</option></select><small>Customer Advances from the S.S./Distributor payment-proof pipeline post automatically once Accounts verifies them — use this form only for money not already flowing through that pipeline.</small></label>
      <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required /></label>
      <label>Account<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Mode<input name="mode" required /></label>
      <label>Reference<input name="reference" /></label>
      <label>Description<input name="description" /></label>
      <button disabled={busy}>RECORD MONEY IN</button>
    </form>
  );
}

function MoneyOutSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("money-out", { type: f.get("type"), date: f.get("date"), amount: Number(f.get("amount")), treasuryAccountId: f.get("treasuryAccountId"), mode: String(f.get("mode")), reference: f.get("reference") || undefined, idempotencyKey: key() }, "Money Out recorded.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Type<select name="type" required><option value="OTHER">Other</option><option value="TAX_PAYMENT">Tax payment</option><option value="ADVANCE_TO_EMPLOYEE_VENDOR">Advance to employee/vendor</option><option value="REIMBURSEMENT">Reimbursement</option><option value="REFUND">Refund</option></select><small>Vendor payments, Salary and Loan repayments have their own forms (Purchases/Control) — use this only for other direct cash-outs.</small></label>
      <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required /></label>
      <label>Account<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Mode<input name="mode" required /></label>
      <label>Reference<input name="reference" /></label>
      <button disabled={busy}>RECORD MONEY OUT</button>
    </form>
  );
}

function TransferSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  if ((data.treasuryAccounts ?? []).length < 2) return <p>Add at least two Bank/Cash accounts to transfer between them.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("transfer-funds", { fromTreasuryAccountId: f.get("from"), toTreasuryAccountId: f.get("to"), amount: Number(f.get("amount")), date: f.get("date"), idempotencyKey: key() }, "Transfer posted."); }}>
      <label>From<select name="from" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>To<select name="to" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required /></label>
      <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
      <button disabled={busy}>TRANSFER</button>
    </form>
  );
}

type CsvRow = { date: string; description: string; reference?: string; debit?: number; credit?: number; balance?: number };
function parseStatementCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0]?.toLowerCase().split(",").map((h) => h.trim()) ?? [];
  const idx = (name: string) => header.indexOf(name);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(",");
    return {
      date: cols[idx("date")]?.trim() ?? "",
      description: cols[idx("description")]?.trim() ?? "",
      reference: idx("reference") >= 0 ? cols[idx("reference")]?.trim() : undefined,
      debit: idx("debit") >= 0 ? Number(cols[idx("debit")] || 0) : undefined,
      credit: idx("credit") >= 0 ? Number(cols[idx("credit")] || 0) : undefined,
      balance: idx("balance") >= 0 ? Number(cols[idx("balance")] || 0) : undefined,
    };
  }).filter((r) => r.date);
}

function StatementImportSection({ ctx }: { ctx: Ctx }) {
  const { data, busy } = ctx;
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ imported: number; skippedDuplicates: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onFile(file: File) {
    setFileName(file.name);
    file.text().then((text) => setRows(parseStatementCsv(text))).catch(() => setErr("Could not read file"));
  }
  function commit() {
    if (!accountId || rows.length === 0) return;
    setErr(null);
    post("import-bank-statement", { treasuryAccountId: accountId, fileName, rows: rows.map((r) => ({ date: r.date, description: r.description, reference: r.reference, debit: r.debit, credit: r.credit, balance: r.balance })) })
      .then((d) => { setResult({ imported: d.importRecord.lines.length, skippedDuplicates: d.skippedDuplicates }); ctx.router.refresh(); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Import failed"));
  }
  return (
    <div>
      <p>CSV columns expected: <code>date,description,reference,debit,credit,balance</code> (header row required).</p>
      <label>Bank account<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
        <option value="">Select account…</option>
        {(data.treasuryAccounts ?? []).filter((t) => t.kind === "BANK").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      {rows.length > 0 && (
        <>
          <p>Preview — {rows.length} row(s) parsed from {fileName}:</p>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th></tr></thead>
              <tbody>{rows.slice(0, 20).map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.description}</td><td>{r.reference}</td><td>{r.debit ? money(r.debit) : ""}</td><td>{r.credit ? money(r.credit) : ""}</td></tr>)}</tbody>
            </table>
          </div>
          <button type="button" disabled={busy || !accountId} onClick={commit}>COMMIT IMPORT</button>
        </>
      )}
      {result && <p role="status" data-ok="true">Imported {result.imported}, duplicates skipped {result.skippedDuplicates}. Next: go to Reconciliation.</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
    </div>
  );
}

function ReconciliationSection({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const [accountId, setAccountId] = useState("");
  return (
    <div>
      <label>Bank account<select value={accountId} onChange={(e) => { setAccountId(e.target.value); }} required>
        <option value="">Select account…</option>
        {(data.treasuryAccounts ?? []).filter((t) => t.kind === "BANK").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      {accountId && <ReconciliationList ctx={ctx} accountId={accountId} />}
    </div>
  );
}

function ReconciliationList({ ctx, accountId }: { ctx: Ctx; accountId: string }) {
  const [suggestions, setSuggestions] = useState<{ bankLineId: string; description: string; amount: number; date: string; candidates: { journalLineId: string; journalId: string; narration: string; date: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void refresh(); }, [accountId]);
  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest-bank-matches", payload: { treasuryAccountId: accountId } }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message ?? "Could not load suggestions");
      setSuggestions(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  function match(bankLineId: string, journalLineId: string) {
    post("confirm-bank-match", { bankLineId, journalLineId }).then(() => refresh()).catch((e) => setErr(e instanceof Error ? e.message : "Match failed"));
  }
  return (
    <div>
      <p>Unmatched: {suggestions.length}. Matched lines drop off this list once confirmed.</p>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Suggested match</th><th>Action</th></tr></thead>
          <tbody>
            {!loading && suggestions.length === 0 && <tr><td colSpan={5}>Nothing unmatched.</td></tr>}
            {suggestions.map((s) => (
              <tr key={s.bankLineId}>
                <td>{fmtDate(s.date)}</td><td>{s.description}</td><td>{money(s.amount)}</td>
                <td>{s.candidates[0] ? s.candidates[0].narration : "No candidate — check manually"}</td>
                <td>{s.candidates[0] && <button type="button" onClick={() => match(s.bankLineId, s.candidates[0]!.journalLineId)}>MATCH</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SALES FINANCE GROUP
// ---------------------------------------------------------------------------
function useReportOnDemand<T>(report: string, params: Record<string, string>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  function load() {
    setLoading(true);
    setErr(null);
    getReport(report, params).then((d) => setData(d)).catch((e) => setErr(e instanceof Error ? e.message : "Failed")).finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);
  return { data, loading, err, reload: load };
}

function RecentJournalsSection() {
  const { data, loading, err } = useReportOnDemand<{ id: string; journalNumber: string; date: string; sourceType: string; narration: string; status: string; total: number }[]>("recent-journals", {}, []);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <p>Every posted journal — Money In/Out, Transfers, Sales Invoices, Credit/Debit Notes, Payroll, Capital/Drawings, Manual Journals and Asset purchases alike — since they are all just journals with a different source type.</p>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Journal #</th><th>Date</th><th>Source</th><th>Narration</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data && data.length === 0 && <tr><td colSpan={7}>No journals yet.</td></tr>}
            {data?.map((j) => (
              <tr key={j.id}>
                <td>{j.journalNumber}</td><td>{fmtDate(j.date)}</td><td>{j.sourceType}</td><td>{j.narration}</td><td>{money(j.total)}</td><td>{j.status}</td>
                <td><button type="button" onClick={() => setOpen((v) => (v === j.id ? null : j.id))}>{open === j.id ? "HIDE" : "VIEW IMPACT"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <AccountingImpactPanel journalId={open} />}
    </div>
  );
}

function SalesRegisterSection() {
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(isoDate(new Date()));
  const { data, loading, err } = useReportOnDemand<{ id: string; documentNumber: string; type: string; issueDate: string; buyerName: string; taxable: number; cgst: number; sgst: number; igst: number; gross: number; paid: number; balance: number; status: string }[]>("sales-register", { from, to }, [from, to]);
  return (
    <div>
      <div className={styles.inlineActions}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" disabled={!data?.length} onClick={() => exportCsv("sales-register", data ?? [])}>EXPORT CSV</button>
      </div>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Party</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Gross</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {data && data.length === 0 && <tr><td colSpan={10}>No documents in range.</td></tr>}
            {data?.map((d) => <tr key={d.id}><td>{d.documentNumber}</td><td>{fmtDate(d.issueDate)}</td><td>{d.buyerName}</td><td>{money(d.taxable)}</td><td>{money(d.cgst)}</td><td>{money(d.sgst)}</td><td>{money(d.igst)}</td><td>{money(d.gross)}</td><td>{money(d.balance)}</td><td>{d.status}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sales §6/15 — Invoices is now a first-class destination: Create Invoice front and center, then
// the real, already-issued Company documents beneath it. Reuses the SAME "sales-register" report
// SalesRegisterSection already reads (no second report engine) — this view frames it around the
// invoice workflow (a PDF link per row, Create Invoice CTA) rather than as a bare accounting table.
function InvoicesSection({ portal, onCreateInvoice }: { portal: string; onCreateInvoice: () => void }) {
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(isoDate(new Date()));
  const { data, loading, err } = useReportOnDemand<{ id: string; documentNumber: string; type: string; issueDate: string; buyerName: string; gross: number; balance: number; status: string }[]>("sales-register", { from, to }, [from, to]);
  return (
    <div>
      <div className={styles.ctaRow}>
        <button type="button" className={styles.ctaPrimary} onClick={onCreateInvoice}>+ CREATE INVOICE</button>
      </div>
      <div className={styles.inlineActions}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Invoice</th><th>Type</th><th>Date</th><th>Party</th><th>Amount</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data && data.length === 0 && <tr><td colSpan={8}>No invoices in this period yet — create your first one above.</td></tr>}
            {data?.map((d) => (
              <tr key={d.id}>
                <td>{d.documentNumber}</td><td>{d.type}</td><td>{fmtDate(d.issueDate)}</td><td>{d.buyerName}</td><td>{money(d.gross)}</td><td>{money(d.balance)}</td><td><span className={styles.statusPill}>{d.status}</span></td>
                <td>{d.status !== "DRAFT" && <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer">PDF</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Parties §10 — one unified directory across every party type the existing architecture already
// supports (Retail/Institutional Customer, Distributor, Super Stockist, Vendor), reusing the SAME
// ledger-parties report PartyLedgerStatement's own picker uses. Clicking a party deep-links into
// that SAME mature ledger screen (outstanding/transactions/invoices/receipts) — no new party or
// ledger read model invented here.
const PARTY_DIRECTORY_TYPES: { value: string; label: string; ledgerType?: string }[] = [
  { value: "RETAILER", label: "Customers" },
  { value: "DISTRIBUTOR", label: "Distributors" },
  { value: "SUPER_STOCKIST", label: "Super Stockists" },
  { value: "VENDOR", label: "Vendors" },
];
function PartiesSection({ portal, jump }: { portal: string; jump: (g: Group, s: string) => void }) {
  const [partyType, setPartyType] = useState(PARTY_DIRECTORY_TYPES[0]!.value);
  const [q, setQ] = useState("");
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    getReport("ledger-parties", { partyType }).then(setParties).catch(() => setParties([])).finally(() => setLoading(false));
  }, [partyType]);
  const filtered = parties.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  function openLedger(partyId: string) {
    // Vendors don't have a "Party Ledger" tab of their own in this codebase yet — a Vendor's real
    // ledger is Purchases -> Vendors & Bills (VendorsSection), the same mature screen it already
    // has; every other party type deep-links into the existing PartyLedgerStatement via the URL
    // params it already supports.
    if (partyType === "VENDOR") { jump("purchases", "vendors"); return; }
    window.location.href = `/portal/${portal}/finance-os?group=sales&section=ledger&partyType=${partyType}&partyId=${partyId}`;
  }
  return (
    <div className={styles.financeSection}>
      <div className={styles.financeSectionHeader}>
        <div><h3>Parties</h3><p>Search across every customer, distributor, super stockist and vendor. Select one to see outstanding, transactions and ledger.</p></div>
      </div>
      <div className={styles.sectionNav} role="tablist" aria-label="Party type">
        {PARTY_DIRECTORY_TYPES.map((t) => (
          <button key={t.value} type="button" onClick={() => setPartyType(t.value)} aria-pressed={partyType === t.value}>{t.label}</button>
        ))}
      </div>
      <input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minHeight: 44, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 9, font: "inherit" }} />
      {loading && <p>Loading…</p>}
      {!loading && filtered.length === 0 && <p className={styles.emptyHint}>No {PARTY_DIRECTORY_TYPES.find((t) => t.value === partyType)?.label.toLowerCase()} found.</p>}
      <div className={styles.partyGrid}>
        {filtered.map((p) => (
          <button key={p.id} type="button" className={styles.partyCard} onClick={() => openLedger(p.id)}>
            <strong>{p.name}</strong>
            <small>View outstanding, transactions & ledger →</small>
          </button>
        ))}
      </div>
    </div>
  );
}

// Sales §6 — Create Invoice wizard. Reuses the EXISTING billing engine end to end
// (createBillingDraft/updateBillingDraft/issueBillingDraft via the new but thin
// create-company-invoice-draft/update-company-invoice-draft/issue-company-invoice actions —
// same functions Distributor/S.S. self-billing already calls, just with issuerType:"COMPANY",
// already a first-class, already-governed value in that engine). No new numbering, GST, ledger or
// PDF logic — the server computes all of it exactly as it does for every other billing document.
type InvoiceLine = { skuId: string; skuLabel: string; brand: string; quantity: string; rate: string; taxRate: number | null };
type InvoiceSku = { value: string; label: string; brand: string; meta?: string; taxRate: number | null; hsn: string | null };
function CreateInvoiceWizard({ portal, onClose, onIssued }: { portal: string; onClose: () => void; onIssued: () => void }) {
  const [step, setStep] = useState(0); // 0 party, 1 items, 2 tax/total, 3 terms, 4 review
  const STEP_LABEL = ["Party", "Items", "Tax & Total", "Terms", "Review"];
  const [partyType, setPartyType] = useState("RETAILER");
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [buyerId, setBuyerId] = useState("");
  const [skus, setSkus] = useState<InvoiceSku[]>([]);
  const [lines, setLines] = useState<InvoiceLine[]>([{ skuId: "", skuLabel: "", brand: "", quantity: "1", rate: "", taxRate: null }]);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [issuedDocumentNumber, setIssuedDocumentNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    getReport("ledger-parties", { partyType }).then(setParties).catch(() => setParties([]));
  }, [partyType]);
  useEffect(() => {
    getReport("invoice-wizard-skus", {}).then((rows: InvoiceSku[]) => setSkus(rows)).catch(() => setSkus([]));
  }, []);

  const buyerName = parties.find((p) => p.id === buyerId)?.name ?? "";
  function updateLine(i: number, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { skuId: "", skuLabel: "", brand: "", quantity: "1", rate: "", taxRate: null }]); }
  function removeLine(i: number) { setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)); }

  const validLines = lines.filter((l) => l.skuId && Number(l.quantity) > 0 && l.rate !== "");
  // Client-side preview only, purely for the Review step's "what will this look like" table —
  // the SAME priceModeForBrand/deriveInclusiveTax|ExclusiveTax math the server authoritatively
  // uses (document-lines.ts) is intentionally re-derived here just for display; the server
  // recomputes everything itself from the real SKU record when the draft is actually created —
  // this preview can never be what gets posted, only a preview of it.
  const preview = validLines.map((l) => {
    const qty = Number(l.quantity), rate = Number(l.rate), taxRate = l.taxRate ?? 0;
    const gross = qty * rate;
    const isMuv = /^muv$/i.test(l.brand.trim());
    const taxable = isMuv ? gross / (1 + taxRate / 100) : gross;
    const tax = isMuv ? gross - taxable : gross * (taxRate / 100);
    const total = isMuv ? gross : taxable + tax;
    return { ...l, gross, taxable, tax, total };
  });
  const subtotal = preview.reduce((s, l) => s + l.gross, 0);
  const taxableTotal = preview.reduce((s, l) => s + l.taxable, 0);
  const taxTotal = preview.reduce((s, l) => s + l.tax, 0);
  const grandTotal = preview.reduce((s, l) => s + l.total, 0);
  const anyUnconfiguredTax = validLines.some((l) => l.taxRate == null);

  function buildLinesPayload() {
    return validLines.map((l) => ({ skuId: l.skuId, quantity: Number(l.quantity), rate: Number(l.rate), taxRate: l.taxRate }));
  }

  async function saveDraft() {
    setBusy(true); setErr(null);
    try {
      const result = await post("create-company-invoice-draft", {
        type: "TAX_INVOICE",
        buyerType: partyType,
        buyerId,
        sourcePortal: portal,
        paymentTerms: paymentTerms || undefined,
        notes: notes || undefined,
        lines: buildLinesPayload(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      setDocumentId(result.id);
      return result.id as string;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save draft");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice() {
    setBusy(true); setErr(null);
    try {
      const id = documentId ?? (await saveDraft());
      const result = await post("issue-company-invoice", { documentId: id });
      setIssuedDocumentNumber(result.documentNumber);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not issue invoice");
    } finally {
      setBusy(false);
    }
  }

  if (issuedDocumentNumber) {
    return (
      <div className={styles.wizardOverlay} onClick={onClose}>
        <div className={styles.wizardCard} onClick={(e) => e.stopPropagation()}>
          <div className={styles.wizardHeader}><h2>Invoice Issued</h2><button type="button" className={styles.wizardClose} onClick={onIssued}>×</button></div>
          <p><strong>{issuedDocumentNumber}</strong> has been issued to {buyerName}.</p>
          <div className={styles.ctaRow}>
            <a className={styles.ctaPrimary} href={`/api/documents/${documentId}/download`} target="_blank" rel="noreferrer">GENERATE PDF / PRINT</a>
            <button type="button" className={styles.ctaSecondary} onClick={onIssued}>DONE</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wizardOverlay} onClick={onClose}>
      <div className={styles.wizardCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.wizardHeader}>
          <div><span className={styles.workspaceEyebrow}>SALES</span><h2>Create Invoice</h2></div>
          <button type="button" className={styles.wizardClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.wizardSteps}>
          {STEP_LABEL.map((label, i) => (
            <span key={label} className={styles.wizardStep} data-active={step === i} data-done={step > i}>{i + 1}. {label}</span>
          ))}
        </div>
        {err && <p role="status" data-ok="false">{err}</p>}

        {step === 0 && (
          <div className={styles.list}>
            <label>Party type
              <select value={partyType} onChange={(e) => { setPartyType(e.target.value); setBuyerId(""); }}>
                {PARTY_DIRECTORY_TYPES.filter((t) => t.value !== "VENDOR").map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>{PARTY_DIRECTORY_TYPES.find((t) => t.value === partyType)?.label ?? "Party"}
              <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">{parties.length === 0 ? "No parties found for this type" : "Choose…"}</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <div className={styles.ctaRow}>
              <button type="button" className={styles.ctaSecondary} onClick={onClose}>Cancel</button>
              <button type="button" className={styles.ctaPrimary} disabled={!buyerId} onClick={() => setStep(1)}>Next: Items</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className={styles.list}>
            {lines.map((line, i) => (
              <div key={i} className={styles.wizardLineRow}>
                <select value={line.skuId} onChange={(e) => { const sku = skus.find((s) => s.value === e.target.value); updateLine(i, { skuId: e.target.value, skuLabel: sku?.label ?? "", brand: sku?.brand ?? "", taxRate: sku?.taxRate ?? null }); }}>
                  <option value="">Choose product…</option>
                  {skus.map((s) => <option key={s.value} value={s.value}>{s.label}{s.taxRate == null ? " — GST not configured" : ""}</option>)}
                </select>
                <input type="number" min="1" step="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                <input type="number" min="0" step="0.01" placeholder="Rate" value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} />
                <span>{line.taxRate != null ? `${line.taxRate}% GST` : "—"}</span>
                <button type="button" onClick={() => removeLine(i)} aria-label="Remove line">×</button>
              </div>
            ))}
            <button type="button" className={styles.ctaSecondary} onClick={addLine}>+ Add item</button>
            <div className={styles.ctaRow}>
              <button type="button" className={styles.ctaSecondary} onClick={() => setStep(0)}>Back</button>
              <button type="button" className={styles.ctaPrimary} disabled={validLines.length === 0} onClick={() => setStep(2)}>Next: Tax &amp; Total</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.list}>
            {anyUnconfiguredTax && <p className={styles.emptyHint}>One or more items has no governed GST rate configured yet — Founder/Admin must set it under Masters before this invoice can be ISSUED (it can still be saved as a Draft).</p>}
            <div className={styles.wizardTotals}>
              <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div><span>Taxable Amount</span><span>{money(taxableTotal)}</span></div>
              <div><span>GST</span><span>{money(taxTotal)}</span></div>
              <div data-total="true"><span>Grand Total</span><span>{money(grandTotal)}</span></div>
            </div>
            <div className={styles.ctaRow}>
              <button type="button" className={styles.ctaSecondary} onClick={() => setStep(1)}>Back</button>
              <button type="button" className={styles.ctaPrimary} onClick={() => setStep(3)}>Next: Terms</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.list}>
            <label>Payment terms (optional)<input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 15 days" /></label>
            <label>Notes (optional)<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <div className={styles.ctaRow}>
              <button type="button" className={styles.ctaSecondary} onClick={() => setStep(2)}>Back</button>
              <button type="button" className={styles.ctaPrimary} onClick={() => setStep(4)}>Review</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.list}>
            <p><strong>Bill to:</strong> {buyerName}</p>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th></tr></thead>
                <tbody>{preview.map((l, i) => <tr key={i}><td>{l.skuLabel}</td><td>{l.quantity}</td><td>{money(Number(l.rate))}</td><td>{money(l.tax)}</td><td>{money(l.total)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className={styles.wizardTotals}>
              <div data-total="true"><span>Grand Total</span><span>{money(grandTotal)}</span></div>
            </div>
            {paymentTerms && <p><strong>Terms:</strong> {paymentTerms}</p>}
            <div className={styles.ctaRow}>
              <button type="button" className={styles.ctaSecondary} onClick={() => setStep(3)}>Back</button>
              <button type="button" className={styles.ctaSecondary} disabled={busy} onClick={() => void saveDraft()}>{busy ? "Saving…" : "SAVE DRAFT"}</button>
              <button type="button" className={styles.ctaPrimary} disabled={busy || anyUnconfiguredTax} onClick={() => void issueInvoice()}>{busy ? "Issuing…" : "ISSUE INVOICE"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerAdvancesSection() {
  const { data, loading, err } = useReportOnDemand<{ id: string; paymentNumber: string; payerId: string; date: string; amountMatched: number; applied: number; unapplied: number }[]>("customer-advances", {}, []);
  return (
    <div>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Payment</th><th>Party</th><th>Date</th><th>Matched</th><th>Applied</th><th>Unapplied</th></tr></thead>
          <tbody>
            {data && data.length === 0 && <tr><td colSpan={6}>No advances on record.</td></tr>}
            {data?.map((p) => <tr key={p.id}><td>{p.paymentNumber}</td><td>{p.payerId}</td><td>{fmtDate(p.date)}</td><td>{money(p.amountMatched)}</td><td>{money(p.applied)}</td><td>{money(p.unapplied)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p>Allocation against a specific invoice happens from the Payment Inbox (existing Payments screen) — this register is the read-only Customer Advance position.</p>
    </div>
  );
}

function ReceiptsSection() {
  const { data, loading, err } = useReportOnDemand<{ id: string; documentNumber: string; date: string; buyerName: string; amount: number }[]>("receipts", {}, []);
  return (
    <div>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Receipt</th><th>Date</th><th>Party</th><th>Amount</th><th>PDF</th></tr></thead>
          <tbody>
            {data && data.length === 0 && <tr><td colSpan={5}>No Company-issued receipts yet.</td></tr>}
            {data?.map((r) => <tr key={r.id}><td>{r.documentNumber}</td><td>{fmtDate(r.date)}</td><td>{r.buyerName}</td><td>{money(r.amount)}</td><td><a href={`/api/documents/${r.id}/download`} target="_blank" rel="noreferrer">View</a></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PURCHASES & COSTS GROUP
// ---------------------------------------------------------------------------
function VendorsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  return (
    <div>
      <div className={styles.financeSectionHeader}>
        <div><h3>Purchases &amp; Vendors</h3><p>Payables at a glance, then create a Purchase Bill or add a Vendor below.</p></div>
      </div>
      {(data.vendors ?? []).length === 0 && <p className={styles.emptyHint}>Add a Vendor first (below), then Create Purchase Bill becomes available.</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Vendor</th><th>Invoice</th><th>Due date</th><th>Gross</th><th>Due</th><th>Status</th><th></th><th></th><th></th></tr></thead>
          <tbody>
            {(data.payables ?? []).length === 0 && <tr><td colSpan={9}>No vendor bills.</td></tr>}
            {(data.payables ?? []).map((b) => (
              <tr key={b.id}><td>{b.vendor?.legalName}</td><td>{b.vendorInvoiceNumber}</td><td>{fmtDate(b.dueDate)}</td><td>{money(Number(b.grossAmount))}</td><td>{money(b.due)}</td><td>{b.status}</td><td><ViewJournalButton journalId={b.journalId} /></td><td><DocAttach entityType="SeeraVendorBill" entityId={b.id} /></td><td><a href={`/api/finance/vendor-bill-pdf?billId=${b.id}`} target="_blank" rel="noreferrer">PURCHASE BILL PDF</a></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <details><summary>+ ADD VENDOR</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-vendor", { code: String(f.get("code")), legalName: String(f.get("legalName")), gstin: f.get("gstin") || undefined, phone: f.get("phone") || undefined }, "Vendor created. Next: record its first bill below."); }}>
          <label>Code<input name="code" required /></label>
          <label>Legal name<input name="legalName" required /></label>
          <label>GSTIN<input name="gstin" /></label>
          <label>Phone<input name="phone" /></label>
          <button disabled={busy}>ADD VENDOR</button>
        </form>
      </details>
      {(data.vendors ?? []).length > 0 && (
        <details open><summary>+ CREATE PURCHASE BILL</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-vendor-bill", { vendorId: f.get("vendorId"), vendorInvoiceNumber: String(f.get("vendorInvoiceNumber")), invoiceDate: f.get("invoiceDate"), dueDate: f.get("dueDate"), category: f.get("category"), taxable: Number(f.get("taxable")), cgst: f.get("cgst") ? Number(f.get("cgst")) : undefined, sgst: f.get("sgst") ? Number(f.get("sgst")) : undefined, igst: f.get("igst") ? Number(f.get("igst")) : undefined, idempotencyKey: key() }, "Vendor bill posted. Next: record payment when ready."); }}>
            <label>Vendor<select name="vendorId" required>{(data.vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.legalName}</option>)}</select></label>
            <label>Vendor invoice #<input name="vendorInvoiceNumber" required /></label>
            <label>Invoice date<input name="invoiceDate" type="date" required defaultValue={isoDate(new Date())} /></label>
            <label>Due date<input name="dueDate" type="date" required /></label>
            <label>Category<select name="category" required>{(data.expenseCategories ?? []).map((c) => <option key={c.id} value={c.chartOfAccountId}>{c.name}</option>)}</select></label>
            <label>Taxable<input name="taxable" type="number" step="0.01" required /></label>
            <label>CGST<input name="cgst" type="number" step="0.01" /></label>
            <label>SGST<input name="sgst" type="number" step="0.01" /></label>
            <label>IGST<input name="igst" type="number" step="0.01" /></label>
            <button disabled={busy}>RECORD VENDOR BILL</button>
          </form>
        </details>
      )}
      {(data.payables ?? []).some((b) => b.due > 0) && (data.treasuryAccounts ?? []).length > 0 && (
        <details><summary>RECORD VENDOR PAYMENT</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = (data.treasuryAccounts ?? []).find((x) => x.id === f.get("treasuryAccountId")); run("record-vendor-payment", { vendorId: f.get("vendorId"), billId: f.get("billId"), amount: Number(f.get("amount")), treasuryAccountId: f.get("treasuryAccountId"), treasuryAccountCoaCode: t ? coaByCode.get(t.chartOfAccountId)?.code : undefined, paymentMode: String(f.get("paymentMode")), paymentDate: f.get("paymentDate"), idempotencyKey: key() }, "Vendor payment recorded."); }}>
            <label>Bill<select name="billId" onChange={(e) => { const opt = e.currentTarget.selectedOptions[0]; if (!opt) return; const form = e.currentTarget.form!; (form.elements.namedItem("vendorId") as HTMLInputElement).value = opt.dataset.vendorId ?? ""; }} required>
              {(data.payables ?? []).filter((b) => b.due > 0).map((b) => <option key={b.id} value={b.id} data-vendor-id={b.vendorId}>{b.vendor?.legalName} — {b.vendorInvoiceNumber} ({money(b.due)} due)</option>)}
            </select></label>
            <input type="hidden" name="vendorId" />
            <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required /></label>
            <label>Account<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Mode<input name="paymentMode" required /></label>
            <label>Date<input name="paymentDate" type="date" required defaultValue={isoDate(new Date())} /></label>
            <button disabled={busy}>PAY VENDOR</button>
          </form>
        </details>
      )}
    </div>
  );
}

function ExpensesSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Expense #</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th><th></th><th></th></tr></thead>
          <tbody>
            {(data.recentExpenses ?? []).length === 0 && <tr><td colSpan={7}>No expenses yet.</td></tr>}
            {(data.recentExpenses ?? []).map((e) => (
              <tr key={e.id}>
                <td>{e.expenseNumber}</td><td>{fmtDate(e.date)}</td><td>{money(Number(e.amount))}</td><td>{e.status}</td>
                <td>
                  {e.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => run("submit-expense", { expenseId: e.id }, "Submitted.")}>SUBMIT</button>}
                  {e.status === "SUBMITTED" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => run("decide-expense", { expenseId: e.id, decision: "APPROVED", reason: "Approved" }, "Approved.")}>APPROVE</button>{" "}
                      <button type="button" disabled={busy} onClick={() => run("decide-expense", { expenseId: e.id, decision: "REJECTED", reason: "Rejected" }, "Rejected.")}>REJECT</button>
                    </>
                  )}
                  {e.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => run("post-expense", { expenseId: e.id, paidNow: false }, "Posted to payable.")}>POST (UNPAID)</button>}
                  {e.status === "POSTED" && <button type="button" disabled={busy} onClick={() => run("reverse-expense", { expenseId: e.id, reason: "Correction" }, "Reversed.")}>REVERSE</button>}
                </td>
                <td><ViewJournalButton journalId={e.journalId} /></td>
                <td><DocAttach entityType="SeeraExpense" entityId={e.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data.expenseCategories ?? []).length > 0 && (
        <details><summary>+ ADD EXPENSE</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-expense", { date: f.get("date"), amount: Number(f.get("amount")), payeeType: "VENDOR", payeeName: f.get("payeeName") || undefined, categoryId: f.get("categoryId"), paymentMode: String(f.get("paymentMode")), description: f.get("description") || undefined, idempotencyKey: key() }, "Expense created as draft. Next: SUBMIT it.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
            <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
            <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required /></label>
            <label>Category<select name="categoryId" required>{(data.expenseCategories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Payee<input name="payeeName" /></label>
            <label>Payment mode<input name="paymentMode" required /></label>
            <label>Description<input name="description" /></label>
            <button disabled={busy}>ADD EXPENSE</button>
          </form>
        </details>
      )}
    </div>
  );
}

function RecurringSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Name</th><th>Amount</th><th>Frequency</th><th>Next due</th><th>Active</th><th>Action</th></tr></thead>
          <tbody>
            {(data.recurringTemplates ?? []).length === 0 && <tr><td colSpan={6}>No recurring templates.</td></tr>}
            {(data.recurringTemplates ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td><td>{money(Number(t.expectedAmount))}</td><td>{t.frequency}</td><td>{fmtDate(t.nextDueDate)}</td><td>{t.isActive ? "Yes" : "No"}</td>
                <td>
                  {t.isActive && (
                    <>
                      <button type="button" disabled={busy} onClick={() => run("generate-expense-from-recurring", { templateId: t.id, idempotencyKey: key() }, "Draft expense created.")}>CREATE DRAFT EXPENSE</button>{" "}
                      <button type="button" disabled={busy} onClick={() => run("skip-recurring-occurrence", { templateId: t.id }, "Skipped to next occurrence.")}>SKIP</button>{" "}
                      <button type="button" disabled={busy} onClick={() => run("set-recurring-active", { templateId: t.id, isActive: false }, "Deactivated.")}>DEACTIVATE</button>
                    </>
                  )}
                  {!t.isActive && <button type="button" disabled={busy} onClick={() => run("set-recurring-active", { templateId: t.id, isActive: true }, "Reactivated.")}>REACTIVATE</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data.expenseCategories ?? []).length > 0 && (
        <details><summary>+ CREATE RECURRING TEMPLATE</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-recurring-expense", { name: String(f.get("name")), categoryId: f.get("categoryId"), payeeName: f.get("payeeName") || undefined, expectedAmount: Number(f.get("expectedAmount")), frequency: f.get("frequency"), nextDueDate: f.get("nextDueDate") }, "Template created."); }}>
            <label>Name<input name="name" required /></label>
            <label>Category<select name="categoryId" required>{(data.expenseCategories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Payee<input name="payeeName" /></label>
            <label>Expected amount<input name="expectedAmount" type="number" step="0.01" required /></label>
            <label>Frequency<select name="frequency" required><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select></label>
            <label>Next due<input name="nextDueDate" type="date" required /></label>
            <button disabled={busy}>CREATE TEMPLATE</button>
          </form>
        </details>
      )}
    </div>
  );
}

function PayrollSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const [month, setMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const { data: register, loading, err, reload } = useReportOnDemandLocal(month);
  return (
    <div>
      <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Employee</th><th>Net payable</th><th>Approved TA/DA</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {register && register.length === 0 && <tr><td colSpan={5}>No payroll entries for this month.</td></tr>}
            {register?.map((p) => (
              <tr key={p.id}>
                <td>{p.employeeId}</td><td>{money(Number(p.netPayable))}</td><td>{money(Number(p.approvedTaDa))}</td><td>{p.status}{p.journalId ? " (accrued)" : ""}</td>
                <td>
                  {!p.journalId && <button type="button" disabled={busy} onClick={() => run("accrue-payroll-entry", { entryId: p.id }, "Accrued.", reload)}>ACCRUE</button>}
                  {p.journalId && p.status !== "PAID" && (data.treasuryAccounts?.length ?? 0) > 0 && (
                    <button type="button" disabled={busy} onClick={() => { const t = data.treasuryAccounts?.[0]; if (!t) return; const coa = data.chartOfAccounts?.find((a) => a.id === t.chartOfAccountId); run("pay-salary", { entryId: p.id, treasuryAccountId: t.id, treasuryAccountCoaCode: coa?.code, paymentDate: isoDate(new Date()), idempotencyKey: key() }, "Salary paid.", reload); }}>PAY</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details><summary>+ CREATE PAYROLL ENTRY</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-payroll-entry", { employeeId: String(f.get("employeeId")), month, basicSalary: Number(f.get("basicSalary")), allowances: f.get("allowances") ? Number(f.get("allowances")) : undefined, incentives: f.get("incentives") ? Number(f.get("incentives")) : undefined, deductions: f.get("deductions") ? Number(f.get("deductions")) : undefined, idempotencyKey: key() }, "Payroll entry created — approved TA/DA pulled automatically from approved claims.", reload); }}>
          <label>Employee (user ID)<input name="employeeId" required /></label>
          <label>Basic salary<input name="basicSalary" type="number" step="0.01" required /></label>
          <label>Allowances<input name="allowances" type="number" step="0.01" /></label>
          <label>Incentives<input name="incentives" type="number" step="0.01" /></label>
          <label>Deductions<input name="deductions" type="number" step="0.01" /></label>
          <button disabled={busy}>CREATE ENTRY</button>
        </form>
      </details>
    </div>
  );
}
function useReportOnDemandLocal(month: string) {
  const [data, setData] = useState<{ id: string; employeeId: string; netPayable: string; approvedTaDa: string; status: string; journalId: string | null }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void reload(); }, [month]);
  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const d = await getReport("payroll-register", { month });
      setData(d as typeof data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }
  return { data, loading, err, reload };
}

function MarketingSection() {
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(isoDate(new Date()));
  const { data, loading, err } = useReportOnDemand<{ total: number; byCategory: { categoryId: string; name: string; amount: number }[]; count: number }>("marketing-spend", { from, to }, [from, to]);
  return (
    <div>
      <div className={styles.inlineActions}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      {data && <p>Total marketing spend: {money(data.total)} across {data.count} expense(s).</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Category</th><th>Amount</th></tr></thead>
          <tbody>{data?.byCategory.length === 0 && <tr><td colSpan={2}>No marketing spend in range.</td></tr>}{data?.byCategory.map((c) => <tr key={c.categoryId}><td>{c.name}</td><td>{money(c.amount)}</td></tr>)}</tbody>
        </table>
      </div>
      <p>No fabricated ROAS — revenue attribution per campaign is not currently a governed data source.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONTROL GROUP
// ---------------------------------------------------------------------------
function BudgetsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Budget</th><th>Period</th></tr></thead>
          <tbody>{(data.budgets ?? []).length === 0 && <tr><td colSpan={2}>No budgets.</td></tr>}
            {(data.budgets ?? []).map((b) => <tr key={b.id}><td>{b.name}</td><td>{fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)}</td></tr>)}
          </tbody>
        </table>
      </div>
      {(data.expenseCategories ?? []).length > 0 && (
        <details><summary>+ CREATE BUDGET</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-budget", { name: String(f.get("name")), periodStart: f.get("periodStart"), periodEnd: f.get("periodEnd"), lines: [{ categoryId: f.get("categoryId"), amount: Number(f.get("amount")) }] }, "Budget created."); }}>
            <label>Name<input name="name" required /></label>
            <label>Period start<input name="periodStart" type="date" required /></label>
            <label>Period end<input name="periodEnd" type="date" required /></label>
            <label>Category<select name="categoryId" required>{(data.expenseCategories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Budget amount<input name="amount" type="number" step="0.01" required /></label>
            <button disabled={busy}>CREATE BUDGET</button>
          </form>
        </details>
      )}
    </div>
  );
}

function ApprovalsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Type</th><th>Requested by</th><th>Amount</th><th>Reason</th><th>Action</th></tr></thead>
          <tbody>
            {(data.approvalQueue ?? []).length === 0 && <tr><td colSpan={5}>No pending Finance approvals.</td></tr>}
            {(data.approvalQueue ?? []).map((a) => {
              const req = a.request as { amount?: number; reason?: string };
              return (
                <tr key={a.id}>
                  <td>{a.type.replace("FINANCE_", "")}</td><td>{a.requestedById}</td><td>{req.amount ? money(req.amount) : "—"}</td><td>{req.reason ?? "—"}</td>
                  <td>
                    <button type="button" disabled={busy} onClick={() => run("decide-finance-approval", { approvalId: a.id, decision: "APPROVED", reason: "Approved" }, "Approved.")}>APPROVE</button>{" "}
                    <button type="button" disabled={busy} onClick={() => run("decide-finance-approval", { approvalId: a.id, decision: "REJECTED", reason: "Rejected" }, "Rejected.")}>REJECT</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>Expense approvals are usually decided directly from Purchases → Expenses; this queue also covers other Finance approval categories as they're configured to require approval.</p>
    </div>
  );
}

function CapitalSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy, isFounder } = ctx;
  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  return (
    <div>
      {data.capital && <p>Founder capital: introduced {money(data.capital.totalIntroduced)}, drawn {money(data.capital.totalDrawn)}, net {money(data.capital.netCapital)}</p>}
      {isFounder && (data.treasuryAccounts?.length ?? 0) > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = (data.treasuryAccounts ?? []).find((x) => x.id === f.get("treasuryAccountId")); run(String(f.get("kind")), { amount: Number(f.get("amount")), date: f.get("date"), treasuryAccountId: f.get("treasuryAccountId"), treasuryAccountCoaCode: t ? coaByCode.get(t.chartOfAccountId)?.code : undefined, idempotencyKey: key() }, "Recorded."); }}>
          <label>Type<select name="kind" required><option value="record-capital-introduced">Capital introduced</option><option value="record-drawings">Drawings</option></select></label>
          <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required /></label>
          <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
          <label>Account<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <button disabled={busy}>RECORD</button>
        </form>
      )}
    </div>
  );
}

function LoansSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Lender</th><th>Principal</th><th>Outstanding</th><th>Status</th><th>Transactions</th><th></th></tr></thead>
          <tbody>{(data.loans ?? []).length === 0 && <tr><td colSpan={6}>No loans.</td></tr>}
            {(data.loans ?? []).map((l) => {
              const txns = (l as unknown as { transactions?: { id: string; type: string; amount: number; date: string; journalId: string | null }[] }).transactions ?? [];
              return (
                <tr key={l.id}>
                  <td>{l.lenderName}</td><td>{money(Number(l.principal))}</td><td>{money(Number(l.outstanding))}</td><td>{l.status}</td>
                  <td>{txns.length > 0 ? <details><summary>{txns.length} transaction(s)</summary><ul>{txns.map((t) => <li key={t.id}>{t.type} {money(t.amount)} ({fmtDate(t.date)}) <ViewJournalButton journalId={t.journalId} /></li>)}</ul></details> : "—"}</td>
                  <td><DocAttach entityType="SeeraLoan" entityId={l.id} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details><summary>+ CREATE LOAN</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-loan", { lenderName: String(f.get("lenderName")), principal: Number(f.get("principal")), interestRate: f.get("interestRate") ? Number(f.get("interestRate")) : undefined, startDate: f.get("startDate") }, "Loan created. Next: record disbursement."); }}>
          <label>Lender<input name="lenderName" required /></label>
          <label>Principal<input name="principal" type="number" step="0.01" required /></label>
          <label>Interest rate %<input name="interestRate" type="number" step="0.01" /></label>
          <label>Start date<input name="startDate" type="date" required defaultValue={isoDate(new Date())} /></label>
          <button disabled={busy}>CREATE LOAN</button>
        </form>
      </details>
      {(data.loans?.length ?? 0) > 0 && (data.treasuryAccounts?.length ?? 0) > 0 && (
        <>
          <details><summary>RECORD DISBURSEMENT</summary>
            <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = (data.treasuryAccounts ?? []).find((x) => x.id === f.get("treasuryAccountId")); run("record-loan-disbursement", { loanId: f.get("loanId"), amount: Number(f.get("amount")), date: f.get("date"), treasuryAccountId: f.get("treasuryAccountId"), treasuryAccountCoaCode: t ? coaByCode.get(t.chartOfAccountId)?.code : undefined, idempotencyKey: key() }, "Disbursement recorded."); }}>
              <label>Loan<select name="loanId" required>{(data.loans ?? []).map((l) => <option key={l.id} value={l.id}>{l.lenderName}</option>)}</select></label>
              <label>Amount<input name="amount" type="number" step="0.01" required /></label>
              <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
              <label>Account<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <button disabled={busy}>RECORD DISBURSEMENT</button>
            </form>
          </details>
          <details><summary>RECORD REPAYMENT</summary>
            <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = (data.treasuryAccounts ?? []).find((x) => x.id === f.get("treasuryAccountId")); run("record-loan-repayment", { loanId: f.get("loanId"), principalAmount: Number(f.get("principalAmount")), interestAmount: f.get("interestAmount") ? Number(f.get("interestAmount")) : 0, date: f.get("date"), treasuryAccountId: f.get("treasuryAccountId"), treasuryAccountCoaCode: t ? coaByCode.get(t.chartOfAccountId)?.code : undefined, idempotencyKey: key() }, "Repayment recorded."); }}>
              <label>Loan<select name="loanId" required>{(data.loans ?? []).filter((l) => Number(l.outstanding) > 0).map((l) => <option key={l.id} value={l.id}>{l.lenderName} (₹{Number(l.outstanding).toLocaleString("en-IN")} outstanding)</option>)}</select></label>
              <label>Principal<input name="principalAmount" type="number" step="0.01" required /></label>
              <label>Interest<input name="interestAmount" type="number" step="0.01" /></label>
              <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
              <label>Account<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <button disabled={busy}>RECORD REPAYMENT</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}

function AssetsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  const assets = (data.fixedAssets ?? []) as { id: string; name: string; category: string; cost: unknown; netBookValue: number | null; netBookValueNote: string | null; status: string; journalId: string | null }[];
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Asset</th><th>Category</th><th>Cost</th><th>Net Book Value</th><th>Status</th><th></th><th></th></tr></thead>
          <tbody>{assets.length === 0 && <tr><td colSpan={7}>No fixed assets.</td></tr>}
            {assets.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.category}</td><td>{money(Number(a.cost))}</td><td>{a.netBookValueNote ?? money(a.netBookValue)}</td><td>{a.status}</td><td><ViewJournalButton journalId={a.journalId} /></td><td><DocAttach entityType="SeeraFixedAsset" entityId={a.id} /></td></tr>)}
          </tbody>
        </table>
      </div>
      {(data.treasuryAccounts?.length ?? 0) > 0 && (
        <details><summary>+ ADD ASSET</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = (data.treasuryAccounts ?? []).find((x) => x.id === f.get("treasuryAccountId")); run("create-fixed-asset", { name: String(f.get("name")), category: String(f.get("category")), purchaseDate: f.get("purchaseDate"), cost: Number(f.get("cost")), location: f.get("location") || undefined, usefulLifeMonths: f.get("usefulLifeMonths") ? Number(f.get("usefulLifeMonths")) : undefined, residualValue: f.get("residualValue") ? Number(f.get("residualValue")) : undefined, treasuryAccountId: f.get("treasuryAccountId"), treasuryAccountCoaCode: t ? coaByCode.get(t.chartOfAccountId)?.code : undefined, idempotencyKey: key() }, "Asset added."); }}>
            <label>Name<input name="name" required /></label>
            <label>Category<input name="category" required /></label>
            <label>Purchase date<input name="purchaseDate" type="date" required defaultValue={isoDate(new Date())} /></label>
            <label>Cost<input name="cost" type="number" step="0.01" required /></label>
            <label>Location<input name="location" /></label>
            <label>Useful life (months)<input name="usefulLifeMonths" type="number" /></label>
            <label>Residual value<input name="residualValue" type="number" step="0.01" /></label>
            <label>Paid from<select name="treasuryAccountId" required>{(data.treasuryAccounts ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <button disabled={busy}>ADD ASSET</button>
          </form>
        </details>
      )}
    </div>
  );
}

function PeriodSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  if (!data.periodChecklist) return <p>DATA REQUIRED</p>;
  return (
    <div>
      <h3>Period close — {data.periodCode}</h3>
      {data.periodChecklist.blockers.length === 0 ? (
        <button type="button" disabled={busy} onClick={() => run("lock-period", { periodCode: data.periodCode }, "Period locked.")}>LOCK PERIOD</button>
      ) : (
        <ul>{data.periodChecklist.blockers.map((b) => <li key={b.code}>{b.title}</li>)}</ul>
      )}
      <details><summary>REOPEN A LOCKED PERIOD</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("reopen-period", { periodCode: String(f.get("periodCode")), reason: String(f.get("reason")) }, "Period reopened."); }}>
          <label>Period code (YYYY-MM)<input name="periodCode" defaultValue={data.periodCode} required /></label>
          <label>Reason<input name="reason" required minLength={3} /></label>
          <button disabled={busy}>REOPEN WITH REASON</button>
        </form>
      </details>
      <h3>History</h3>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Period</th><th>Locked</th></tr></thead>
          <tbody>{(data.periods ?? []).map((p) => <tr key={p.id}><td>{p.code}</td><td>{p.lockedAt ? `Locked (${p.lockReason ?? ""})` : "Open"}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STATEMENTS GROUP
// ---------------------------------------------------------------------------
const STATEMENT_PDF_KEY: Record<string, string> = { trial: "trial-balance", pl: "pl", bs: "bs", cf: "cf", gst: "gst" };
function StatementPdfLink({ section }: { section: string }) {
  const key = STATEMENT_PDF_KEY[section];
  if (!key) return null;
  const yearStart = isoDate(new Date(new Date().getFullYear(), 0, 1));
  const now = isoDate(new Date());
  return <a href={`/api/finance/statements/pdf?statement=${key}&from=${yearStart}&to=${now}`} target="_blank" rel="noreferrer"><button type="button">EXPORT PDF</button></a>;
}
function StatementsSection({ ctx, section }: { ctx: Ctx; section: string }) {
  const { data } = ctx;
  if (section === "trial") return (
    <div>
      <h3>Trial Balance {data.trial && `(${data.trial.balanced ? "balanced" : "IMBALANCED"})`}</h3>
      <StatementPdfLink section={section} />
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
          <tbody>{(data.trial?.rows ?? []).map((r) => <tr key={r.code}><td>{r.code} — {r.name}</td><td>{r.closingDebit ? money(r.closingDebit) : ""}</td><td>{r.closingCredit ? money(r.closingCredit) : ""}</td></tr>)}</tbody>
          <tfoot><tr><td>TOTAL</td><td>{data.trial ? money(data.trial.totalDebit) : ""}</td><td>{data.trial ? money(data.trial.totalCredit) : ""}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
  if (section === "pl") return <div><StatementPdfLink section={section} />{data.pnl ? <p>Revenue {money(data.pnl.totalRevenue)} (RELIABLE) − Opex {money(data.pnl.totalOperatingExpense)} = Operating profit {money(data.pnl.operatingProfit)}. <em>{data.pnl.cogsNote}</em></p> : <p>DATA REQUIRED</p>}</div>;
  if (section === "bs") return <div><StatementPdfLink section={section} />{data.bs ? <p>Assets {money(data.bs.totalAssets)} = Liabilities {money(data.bs.totalLiabilities)} + Equity {money(data.bs.totalEquity)} {data.bs.balanced ? "✓" : "— MISMATCH"}</p> : <p>DATA REQUIRED</p>}</div>;
  if (section === "cf") return <div><StatementPdfLink section={section} />{data.cf ? <p>Opening {money(data.cf.openingCash)} → Operating {money(data.cf.operating)}, Investing {money(data.cf.investing)}, Financing {money(data.cf.financing)} → Closing {money(data.cf.closingCash)}</p> : <p>DATA REQUIRED</p>}</div>;
  if (section === "forecast") return data.forecast30 ? <p>30-day forecast: current cash {money(data.forecast30.currentCash)}, committed outflow {money(data.forecast30.committedOutflow)}, forecast outflow {money(data.forecast30.forecastOutflow)} → expected closing {money(data.forecast30.expectedClosingCash)} {data.forecast30.shortfall ? <strong>SHORTFALL RISK</strong> : null}</p> : <p>DATA REQUIRED</p>;
  if (section === "gst") return <div><StatementPdfLink section={section} />{data.gst ? <p>Output GST {money(data.gst.outputCgst + data.gst.outputSgst + data.gst.outputIgst)} − Input GST {money(data.gst.inputCgst + data.gst.inputSgst + data.gst.inputIgst)} = Net indicative liability {money(data.gst.netIndicativeLiability)}. Missing GSTIN on {data.gst.missingGstinCount} invoice(s).</p> : <p>DATA REQUIRED</p>}</div>;
  return null;
}

// ---------------------------------------------------------------------------
// TOOLS GROUP
// ---------------------------------------------------------------------------
function DocumentsSection() {
  const { data, loading, err } = useReportOnDemand<{ id: string; originalName: string; mimeType: string; entityType: string; entityId: string; createdAt: string }[]>("document-vault", {}, []);
  return (
    <div>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>File</th><th>Category</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {data && data.length === 0 && <tr><td colSpan={4}>No Finance documents uploaded yet. Upload from a specific Expense/Vendor Bill/Loan/Asset once created.</td></tr>}
            {data?.map((f) => <tr key={f.id}><td>{f.originalName}</td><td>{f.entityType.replace("Seera", "")}</td><td>{fmtDate(f.createdAt)}</td><td><a href={`/api/finance/documents/${f.id}/download`} target="_blank" rel="noreferrer">Download</a></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchSection() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Record<string, { id: string; label: string; amount?: number }[]> | null>(null);
  const [loading, setLoading] = useState(false);
  function search() {
    if (q.trim().length < 2) return;
    setLoading(true);
    getReport("search", { q }).then((d) => setResult(d)).finally(() => setLoading(false));
  }
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); search(); }}>
        <label>Search invoice #, vendor, journal #, amount, reference…<input value={q} onChange={(e) => setQ(e.target.value)} minLength={2} /></label>
        <button disabled={loading}>SEARCH</button>
      </form>
      {result && Object.entries(result).map(([entity, items]) => items.length > 0 && (
        <div key={entity}>
          <h4>{entity}</h4>
          <ul>{items.map((i) => <li key={i.id}>{i.label}{i.amount ? ` — ${money(i.amount)}` : ""}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

// Reports IA regroup (mission §11: Sales reports vs Purchase reports as distinct groups under
// Reports). Kept as ONE component with all its existing fetches unchanged (every hook here already
// existed and worked) — only which already-fetched section RENDERS is scope-gated, so nothing about
// the underlying report engines/queries changes, just which subset is visible on which tab.
function ReportsCenterSection({ scope }: { scope: "sales" | "purchases" }) {
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(isoDate(new Date()));
  const { data: byCategory } = useReportOnDemand<{ categoryId: string; categoryName: string; total: number }[]>("expense-by-category", { from, to }, [from, to]);
  const { data: byDept } = useReportOnDemand<{ dimensionId: string | null; name: string; total: number }[]>("expense-by-department", { from, to }, [from, to]);
  const { data: byTerritory } = useReportOnDemand<{ territoryId: string | null; name: string; total: number }[]>("expense-by-territory", { from, to }, [from, to]);
  const { data: byCostCentre } = useReportOnDemand<{ costCentre: string; total: number }[]>("cost-centre-summary", { from, to }, [from, to]);
  const { data: ageing } = useReportOnDemand<{ rows: { partyId: string; name: string; outstandingTotal: number }[]; buckets: Record<string, number> }>("receivables-ageing", {}, []);
  const { data: bySS } = useReportOnDemand<{ partyId: string; name: string; total: number }[]>("sales-by-ss", { from, to }, [from, to]);
  const { data: byProduct } = useReportOnDemand<{ product: string; total: number }[]>("sales-by-product", { from, to }, [from, to]);
  const { data: purchases } = useReportOnDemand<{ id: string; billNumber: string; vendorName: string; invoiceDate: string; gross: number; paid: number; balance: number; status: string }[]>("purchase-register", { from, to }, [from, to]);
  const { data: payablesAgeing } = useReportOnDemand<{ rows: { partyId: string; name: string; outstandingTotal: number }[]; buckets: Record<string, number> }>("payables-ageing", {}, []);
  return (
    <div>
      <div className={styles.inlineActions}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {scope === "sales" && (
        <>
          <h4>Receivables Ageing <button type="button" disabled={!ageing?.rows.length} onClick={() => exportCsv("receivables-ageing", ageing?.rows ?? [])}>EXPORT CSV</button></h4>
          {ageing && <p>Not due {money(ageing.buckets.NOT_DUE)} · 1-30d {money(ageing.buckets["1_30"])} · 31-60d {money(ageing.buckets["31_60"])} · 61-90d {money(ageing.buckets["61_90"])} · 90+d {money(ageing.buckets["90_PLUS"])}</p>}
          <h4>Company Sales by S.S. <button type="button" disabled={!bySS?.length} onClick={() => exportCsv("sales-by-ss", bySS ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><tbody>{bySS?.map((s) => <tr key={s.partyId}><td>{s.name}</td><td>{money(s.total)}</td></tr>)}</tbody></table></div>
          <h4>Company Sales by Product <button type="button" disabled={!byProduct?.length} onClick={() => exportCsv("sales-by-product", byProduct ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><tbody>{byProduct?.slice(0, 15).map((p) => <tr key={p.product}><td>{p.product}</td><td>{money(p.total)}</td></tr>)}</tbody></table></div>
          <h4>Territory Sales Summary <button type="button" disabled={!byTerritory?.length} onClick={() => exportCsv("expense-by-territory", byTerritory ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><tbody>{byTerritory?.map((t) => <tr key={t.territoryId ?? "corporate"}><td>{t.name}</td><td>{money(t.total)}</td></tr>)}</tbody></table></div>
        </>
      )}
      {scope === "purchases" && (
        <>
          <h4>Purchase Register <button type="button" disabled={!purchases?.length} onClick={() => exportCsv("purchase-register", purchases ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><thead><tr><th>Bill #</th><th>Vendor</th><th>Date</th><th>Gross</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{purchases?.map((p) => <tr key={p.id}><td>{p.billNumber}</td><td>{p.vendorName}</td><td>{new Date(p.invoiceDate).toLocaleDateString("en-IN")}</td><td>{money(p.gross)}</td><td>{money(p.paid)}</td><td>{money(p.balance)}</td><td>{p.status}</td></tr>)}</tbody></table></div>
          <h4>Payables Ageing <button type="button" disabled={!payablesAgeing?.rows.length} onClick={() => exportCsv("payables-ageing", payablesAgeing?.rows ?? [])}>EXPORT CSV</button></h4>
          {payablesAgeing && <p>Not due {money(payablesAgeing.buckets.NOT_DUE)} · 1-30d {money(payablesAgeing.buckets["1_30"])} · 31-60d {money(payablesAgeing.buckets["31_60"])} · 61-90d {money(payablesAgeing.buckets["61_90"])} · 90+d {money(payablesAgeing.buckets["90_PLUS"])}</p>}
          <h4>Expense by Category <button type="button" disabled={!byCategory?.length} onClick={() => exportCsv("expense-by-category", byCategory ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><tbody>{byCategory?.map((c) => <tr key={c.categoryId}><td>{c.categoryName}</td><td>{money(c.total)}</td></tr>)}</tbody></table></div>
          <h4>Expense by Department <button type="button" disabled={!byDept?.length} onClick={() => exportCsv("expense-by-department", byDept ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><tbody>{byDept?.map((d) => <tr key={d.dimensionId ?? "none"}><td>{d.name}</td><td>{money(d.total)}</td></tr>)}</tbody></table></div>
          <h4>Cost Centre Summary (Territory-less expenses only) <button type="button" disabled={!byCostCentre?.length} onClick={() => exportCsv("cost-centre-summary", byCostCentre ?? [])}>EXPORT CSV</button></h4>
          <div className={styles.tableWrap}><table><tbody>{byCostCentre?.map((c) => <tr key={c.costCentre}><td>{c.costCentre}</td><td>{money(c.total)}</td></tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
}

// --- Opening Balance Wizard (10-step, Founder-only, one-time) --------------
type OtherLine = { accountId: string; side: "debit" | "credit"; amount: string; description: string };
function OpeningBalanceWizard({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const [step, setStep] = useState(1);
  const [effectiveDate, setEffectiveDate] = useState(isoDate(new Date()));
  const [bankAmounts, setBankAmounts] = useState<Record<string, string>>({});
  const [cashAmounts, setCashAmounts] = useState<Record<string, string>>({});
  const [receivables, setReceivables] = useState("");
  const [customerAdvances, setCustomerAdvances] = useState("");
  const [payables, setPayables] = useState("");
  const [loans, setLoans] = useState("");
  const [drawings, setDrawings] = useState("");
  const [other, setOther] = useState<OtherLine[]>([]);

  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  const bankAccounts = (data.treasuryAccounts ?? []).filter((t) => t.kind === "BANK");
  const cashAccounts = (data.treasuryAccounts ?? []).filter((t) => t.kind === "CASH");
  const treasuryCoaCode = (treasuryAccountId: string) => { const t = (data.treasuryAccounts ?? []).find((x) => x.id === treasuryAccountId); return t ? coaByCode.get(t.chartOfAccountId)?.code : undefined; };

  type Line = { accountId: string; debit?: number; credit?: number; treasuryAccountId?: string; description?: string };
  function buildLines(): Line[] {
    const lines: Line[] = [];
    for (const [treasuryAccountId, amt] of Object.entries(bankAmounts)) { const n = Number(amt); if (n > 0) { const code = treasuryCoaCode(treasuryAccountId); if (code) lines.push({ accountId: code, debit: n, treasuryAccountId }); } }
    for (const [treasuryAccountId, amt] of Object.entries(cashAmounts)) { const n = Number(amt); if (n > 0) { const code = treasuryCoaCode(treasuryAccountId); if (code) lines.push({ accountId: code, debit: n, treasuryAccountId }); } }
    if (Number(receivables) > 0) lines.push({ accountId: "1100", debit: Number(receivables), description: "Opening receivables" });
    if (Number(customerAdvances) > 0) lines.push({ accountId: "2010", credit: Number(customerAdvances), description: "Opening customer advances" });
    if (Number(payables) > 0) lines.push({ accountId: "2000", credit: Number(payables), description: "Opening payables" });
    if (Number(loans) > 0) lines.push({ accountId: "2050", credit: Number(loans), description: "Opening loans" });
    if (Number(drawings) > 0) lines.push({ accountId: "3010", debit: Number(drawings), description: "Opening drawings" });
    for (const o of other) { const n = Number(o.amount); if (n > 0 && o.accountId) lines.push({ accountId: o.accountId, [o.side]: n, description: o.description || undefined }); }
    return lines;
  }
  const enteredLines = buildLines();
  const debitTotal = enteredLines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const creditTotal = enteredLines.reduce((s, l) => s + (l.credit ?? 0), 0);
  // Founder Capital is always the auto-computed balancing plug — never a
  // second manually-typed figure that could itself introduce an imbalance.
  const capitalPlug = Math.round((debitTotal - creditTotal) * 100) / 100;
  const previewLines: Line[] = [...enteredLines, capitalPlug > 0 ? { accountId: "3000", credit: capitalPlug, description: "Opening Founder Capital (auto-balanced)" } : capitalPlug < 0 ? { accountId: "3000", debit: -capitalPlug, description: "Opening Founder Capital (auto-balanced)" } : null].filter(Boolean) as Line[];

  const steps = ["Effective Date", "Bank Balances", "Cash", "Receivables / Customer Advances", "Payables", "Loans", "Capital / Drawings", "Other Accounts", "Preview", "Confirm & Post"];
  const next = () => setStep((s) => Math.min(steps.length, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div>
      <p><strong>Step {step} of {steps.length}: {steps[step - 1]}</strong> — this establishes the Company's starting financial position. It can only be posted once.</p>
      {step === 1 && <label>Effective date<input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>}
      {step === 2 && (bankAccounts.length === 0 ? <p>No Bank accounts yet — add one from Money → Bank &amp; Cash first, or skip.</p> : bankAccounts.map((t) => <label key={t.id}>{t.name}<input type="number" step="0.01" value={bankAmounts[t.id] ?? ""} onChange={(e) => setBankAmounts((v) => ({ ...v, [t.id]: e.target.value }))} /></label>))}
      {step === 3 && (cashAccounts.length === 0 ? <p>No Cash accounts yet — add one from Money → Bank &amp; Cash first, or skip.</p> : cashAccounts.map((t) => <label key={t.id}>{t.name}<input type="number" step="0.01" value={cashAmounts[t.id] ?? ""} onChange={(e) => setCashAmounts((v) => ({ ...v, [t.id]: e.target.value }))} /></label>))}
      {step === 4 && (
        <>
          <label>Trade Receivables (debit)<input type="number" step="0.01" value={receivables} onChange={(e) => setReceivables(e.target.value)} /></label>
          <label>Customer Advances (credit)<input type="number" step="0.01" value={customerAdvances} onChange={(e) => setCustomerAdvances(e.target.value)} /></label>
        </>
      )}
      {step === 5 && <label>Trade Payables (credit)<input type="number" step="0.01" value={payables} onChange={(e) => setPayables(e.target.value)} /></label>}
      {step === 6 && <label>Loans outstanding (credit)<input type="number" step="0.01" value={loans} onChange={(e) => setLoans(e.target.value)} /></label>}
      {step === 7 && (
        <>
          <p>Founder Capital is auto-balanced from everything else you enter in this wizard — it is never typed directly, so the opening journal can never be imbalanced by construction.</p>
          <label>Opening Drawings already taken, if any (debit)<input type="number" step="0.01" value={drawings} onChange={(e) => setDrawings(e.target.value)} /></label>
        </>
      )}
      {step === 8 && (
        <div>
          {other.map((o, i) => (
            <div key={i} className={styles.inlineActions}>
              <select value={o.accountId} onChange={(e) => setOther((v) => v.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)))}>
                <option value="">Account…</option>
                {(data.chartOfAccounts ?? []).map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
              <select value={o.side} onChange={(e) => setOther((v) => v.map((x, j) => (j === i ? { ...x, side: e.target.value as "debit" | "credit" } : x)))}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
              <input type="number" step="0.01" placeholder="Amount" value={o.amount} onChange={(e) => setOther((v) => v.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <input placeholder="Description" value={o.description} onChange={(e) => setOther((v) => v.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <button type="button" onClick={() => setOther((v) => v.filter((_, j) => j !== i))}>REMOVE</button>
            </div>
          ))}
          <button type="button" onClick={() => setOther((v) => [...v, { accountId: "", side: "debit", amount: "", description: "" }])}>+ ADD LINE</button>
        </div>
      )}
      {step === 9 && (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>{previewLines.map((l, i) => <tr key={i}><td>{l.accountId} — {coaByCode.get(l.accountId)?.name ?? l.description ?? ""}</td><td>{l.debit ? money(l.debit) : ""}</td><td>{l.credit ? money(l.credit) : ""}</td></tr>)}</tbody>
            <tfoot><tr><td>TOTAL</td><td>{money(previewLines.reduce((s, l) => s + (l.debit ?? 0), 0))}</td><td>{money(previewLines.reduce((s, l) => s + (l.credit ?? 0), 0))}</td></tr></tfoot>
          </table>
          <p>{previewLines.length < 2 ? "Enter at least one balance before continuing." : "Balanced by construction ✓"}</p>
        </div>
      )}
      {step === 10 && (
        <div>
          <p><strong>This will permanently establish the Company's opening financial position as of {effectiveDate}.</strong> It cannot be run a second time.</p>
          <button type="button" disabled={busy || previewLines.length < 2} onClick={() => run("post-opening-balances", { effectiveDate, lines: previewLines, idempotencyKey: key() }, "Opening balances posted.")}>CONFIRM &amp; POST OPENING BALANCES</button>
        </div>
      )}
      <div className={styles.inlineActions}>
        {step > 1 && <button type="button" onClick={back}>BACK</button>}
        {step < steps.length && <button type="button" onClick={next}>NEXT</button>}
      </div>
    </div>
  );
}

function TreasuryAccountsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const accounts = (data.allTreasuryAccounts ?? data.treasuryAccounts ?? []) as { id: string; kind: string; code: string; name: string; bankName?: string | null; accountType?: string | null; maskedAccountNumber?: string | null; ifsc?: string | null; openingBalance?: unknown; isActive: boolean; chartOfAccountId: string }[];
  const coaById = new Map((data.chartOfAccounts ?? []).map((a) => [a.id, a]));
  return (
    <div className={styles.financeSection}>
      <div className={styles.financeSectionHeader}>
        <div><h3>Treasury Accounts</h3><p>Every active Cash/Bank account appears automatically in Money Desk and guided entries.</p></div>
        <span className={styles.badge}>{accounts.filter((a) => a.isActive).length} ACTIVE</span>
      </div>
      <form className={styles.treasuryForm} onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run("create-treasury-account", {
          kind: String(f.get("kind")),
          code: String(f.get("code")).trim(),
          name: String(f.get("name")).trim(),
          bankName: String(f.get("bankName") || "").trim() || undefined,
          accountType: String(f.get("accountType") || "").trim() || undefined,
          maskedAccountNumber: String(f.get("maskedAccountNumber") || "").trim() || undefined,
          ifsc: String(f.get("ifsc") || "").trim() || undefined,
          openingBalance: f.get("openingBalance") ? Number(f.get("openingBalance")) : undefined,
          openingBalanceDate: f.get("openingBalanceDate") ? String(f.get("openingBalanceDate")) : undefined,
        }, "Treasury account added. It is now available in Money Desk.");
        (e.currentTarget as HTMLFormElement).reset();
      }}>
        <label>Account kind *
          <select name="kind" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK">Bank</option></select>
        </label>
        <label>Account code *<input name="code" required placeholder="CASH-COUNTER-01" /></label>
        <label>Account name *<input name="name" required placeholder="Main Cash / HDFC Current" /></label>
        <label>Bank name (Bank only)<input name="bankName" placeholder="HDFC Bank" /></label>
        <label>Account type / subtype<input name="accountType" placeholder="Current / Savings" /></label>
        <label>Account number (last 4 only)<input name="maskedAccountNumber" inputMode="numeric" maxLength={4} placeholder="4521" /></label>
        <label>IFSC<input name="ifsc" placeholder="HDFC0001234" /></label>
        <label>Reference opening balance<input name="openingBalance" type="number" step="0.01" min="0" placeholder="0" /></label>
        <label>Opening balance date<input name="openingBalanceDate" type="date" /></label>
        <p className={styles.treasuryNote}>Opening balance here is for account reference/display. Use the one-time Opening Balance Wizard below to post the actual GL opening balance.</p>
        <div className={styles.wide}><button type="submit" disabled={busy}>+ ADD TREASURY ACCOUNT</button></div>
      </form>
      <div className={styles.treasuryGrid}>
        {accounts.length === 0 && <p className={styles.emptyHint}>No Treasury accounts yet. Add your first Cash or Bank account above.</p>}
        {accounts.map((a) => {
          const coa = coaById.get(a.chartOfAccountId);
          return (
            <article key={a.id} className={styles.treasuryCard} data-inactive={!a.isActive}>
              <div className={styles.treasuryCardTop}>
                <div><strong>{a.name}</strong><div className={styles.treasuryMeta}>{a.kind} · {a.code}{a.bankName ? " · "+a.bankName : ""}</div></div>
                <span className={styles.statusPill} data-inactive={!a.isActive}>{a.isActive ? "ACTIVE" : "INACTIVE"}</span>
              </div>
              <div className={styles.treasuryBalance}>₹{Number(a.openingBalance ?? 0).toLocaleString("en-IN")}</div>
              <div className={styles.treasuryMeta}>Opening/reference balance · GL account {coa?.code ?? "—"}{a.ifsc ? " · IFSC "+a.ifsc : ""}</div>
              <button type="button" disabled={busy} onClick={() => run("set-treasury-account-active", { treasuryAccountId: a.id, isActive: !a.isActive }, a.isActive ? "Treasury account deactivated." : "Treasury account activated.")}>{a.isActive ? "DEACTIVATE" : "ACTIVATE"}</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SettingsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy, portal } = ctx;
  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  return (
    <div className={styles.financeSection}>
      <div className={styles.financeSectionHeader}>
        <div><h3>Finance Settings & Masters</h3><p>All accounting configuration used by Money Desk lives here. Treasury Accounts moved to its own screen — <a href={`/portal/${portal}/finance-os?group=treasury`}>Manage Treasury Accounts →</a></p></div>
      </div>
      <p>Chart of Accounts: {data.chartOfAccounts?.length ?? 0} accounts configured.</p>
      {(data.chartOfAccounts?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-coa", {}, "Chart of Accounts seeded.")}>BOOTSTRAP CHART OF ACCOUNTS</button>}
      {(data.dimensions?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-dimensions", {}, "Dimensions seeded.")}>BOOTSTRAP DEPARTMENTS</button>}
      {(data.approvalPolicies?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-approval-policies", {}, "Approval policies seeded.")}>BOOTSTRAP APPROVAL POLICIES</button>}
      {(data.treasuryAccounts?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-treasury", {}, "Default Cash and Bank accounts created.")}>BOOTSTRAP TREASURY (Cash + Bank)</button>}
      <button type="button" disabled={busy} onClick={() => run("bootstrap-materials", {}, "Detergent-cake raw materials seeded.")}>SEED DETERGENT-CAKE RAW MATERIALS</button>
      <button type="button" disabled={busy} onClick={() => run("bootstrap-location", {}, "Main Raw Material Store location created.")}>SEED DEFAULT RAW MATERIAL LOCATION</button>
      <details open>
        <summary>COMPANY PROFILE (document identity — invoice/bill/ledger header, signature, seal)</summary>
        <CompanyProfileSection />
      </details>
      {data.openingBalances && !data.openingBalances.posted && (data.treasuryAccounts?.length ?? 0) > 0 && (
        <details><summary>OPENING BALANCE WIZARD (one-time)</summary>
          <OpeningBalanceWizard ctx={ctx} />
        </details>
      )}
      {(data.approvalPolicies ?? []).length > 0 && (
        <div className={styles.tableWrap}>
          <table><thead><tr><th>Category</th><th>Threshold</th><th>Requires approval</th></tr></thead>
            <tbody>{(data.approvalPolicies ?? []).map((p) => <tr key={p.id}><td>{p.category}</td><td>{money(Number(p.thresholdAmount))}</td><td>{p.requiresApproval ? "Yes" : "No"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Money Desk 2.0 (Part AD) — Founder-only Company Profile: the real legal/bank/branding identity
// used to render a professional Sales Invoice / Purchase Bill / Ledger Statement (partySnapshot's
// COMPANY branch, document-lines.ts). Self-contained (own fetch-on-mount + local form state),
// same pattern as SmartFinanceEntry/GuidedMoneyIn, rather than wiring into the page-level
// FinanceWorkspaceData loader for a screen that's read/written only here.
type CompanyProfile = {
  legalName: string; tradeName: string | null; gstin: string | null; pan: string | null;
  registeredAddress: unknown; state: string; stateCode: string; phone: string | null; email: string | null;
  website: string | null; bankName: string | null; bankAccountName: string | null; bankAccountNumber: string | null;
  ifsc: string | null; upiId: string | null; signatoryName: string | null; signatoryDesignation: string | null;
  invoicePrefix: string; termsAndConditions: string | null; logoFileId: string | null; signatureFileId: string | null; sealFileId: string | null;
};
function CompanyProfileSection() {
  const [profile, setProfile] = useState<CompanyProfile | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    post("get-company-profile", {})
      .then((p: CompanyProfile | null) => {
        setProfile(p);
        const addr = (p?.registeredAddress ?? {}) as Record<string, unknown>;
        setForm({
          legalName: p?.legalName ?? "", tradeName: p?.tradeName ?? "", gstin: p?.gstin ?? "", pan: p?.pan ?? "",
          addressLine: (addr.line as string) ?? "", addressCity: (addr.city as string) ?? "", addressPincode: (addr.pincode as string) ?? "",
          state: p?.state ?? "", stateCode: p?.stateCode ?? "", phone: p?.phone ?? "", email: p?.email ?? "", website: p?.website ?? "",
          bankName: p?.bankName ?? "", bankAccountName: p?.bankAccountName ?? "", bankAccountNumber: p?.bankAccountNumber ?? "",
          ifsc: p?.ifsc ?? "", upiId: p?.upiId ?? "", signatoryName: p?.signatoryName ?? "", signatoryDesignation: p?.signatoryDesignation ?? "",
          invoicePrefix: p?.invoicePrefix ?? "SEERA", termsAndConditions: p?.termsAndConditions ?? "",
        });
      })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load Company Profile" }));
  }, []);

  function field(key: string) { return form[key] ?? ""; }
  function setField(key: string, value: string) { setForm((s) => ({ ...s, [key]: value })); }

  function save() {
    if (!form.legalName?.trim()) { setMessage({ ok: false, text: "Legal name is required" }); return; }
    setBusy(true);
    setMessage(null);
    post("update-company-profile", {
      legalName: form.legalName, tradeName: form.tradeName || undefined, gstin: form.gstin || undefined, pan: form.pan || undefined,
      address: { line: form.addressLine, city: form.addressCity, pincode: form.addressPincode },
      state: form.state, stateCode: form.stateCode, phone: form.phone || undefined, email: form.email || undefined, website: form.website || undefined,
      bankName: form.bankName || undefined, bankAccountName: form.bankAccountName || undefined, bankAccountNumber: form.bankAccountNumber || undefined,
      ifsc: form.ifsc || undefined, upiId: form.upiId || undefined, signatoryName: form.signatoryName || undefined, signatoryDesignation: form.signatoryDesignation || undefined,
      invoicePrefix: form.invoicePrefix || undefined, termsAndConditions: form.termsAndConditions || undefined,
    })
      .then((p: CompanyProfile) => setProfile(p))
      .then(() => setMessage({ ok: true, text: "Company Profile saved." }))
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save Company Profile" }))
      .finally(() => setBusy(false));
  }

  function uploadAsset(kind: "LOGO" | "SIGNATURE" | "SEAL", file: File) {
    setBusy(true);
    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const bytesBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      post("upload-company-branding-asset", { kind, originalName: file.name, mimeType: file.type, bytesBase64 })
        .then((p: CompanyProfile) => { setProfile(p); setMessage({ ok: true, text: `${kind === "LOGO" ? "Logo" : kind === "SIGNATURE" ? "Signature" : "Seal"} uploaded.` }); })
        .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed" }))
        .finally(() => setBusy(false));
    };
    reader.onerror = () => { setBusy(false); setMessage({ ok: false, text: "Could not read file" }); };
    reader.readAsDataURL(file);
  }

  if (profile === undefined) return <p>Loading Company Profile…</p>;

  return (
    <div>
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      {!profile && <p className={styles.emptyHint}>Not configured yet — every document currently renders with the "SEERA" fallback name only. Fill this in to show real GSTIN/address/bank details and a real signature/seal on invoices, bills, and ledger statements.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.5rem" }}>
        <label>Legal name *<input value={field("legalName")} onChange={(e) => setField("legalName", e.target.value)} /></label>
        <label>Trade/brand name<input value={field("tradeName")} onChange={(e) => setField("tradeName", e.target.value)} /></label>
        <label>GSTIN<input value={field("gstin")} onChange={(e) => setField("gstin", e.target.value)} /></label>
        <label>PAN<input value={field("pan")} onChange={(e) => setField("pan", e.target.value)} /></label>
        <label>Address line<input value={field("addressLine")} onChange={(e) => setField("addressLine", e.target.value)} /></label>
        <label>City<input value={field("addressCity")} onChange={(e) => setField("addressCity", e.target.value)} /></label>
        <label>Pincode<input value={field("addressPincode")} onChange={(e) => setField("addressPincode", e.target.value)} /></label>
        <label>State *<input value={field("state")} onChange={(e) => setField("state", e.target.value)} /></label>
        <label>State code *<input value={field("stateCode")} onChange={(e) => setField("stateCode", e.target.value)} placeholder="e.g. 09" /></label>
        <label>Phone<input value={field("phone")} onChange={(e) => setField("phone", e.target.value)} /></label>
        <label>Email<input value={field("email")} onChange={(e) => setField("email", e.target.value)} /></label>
        <label>Website<input value={field("website")} onChange={(e) => setField("website", e.target.value)} /></label>
        <label>Bank name<input value={field("bankName")} onChange={(e) => setField("bankName", e.target.value)} /></label>
        <label>Bank account name<input value={field("bankAccountName")} onChange={(e) => setField("bankAccountName", e.target.value)} /></label>
        <label>Bank account number<input value={field("bankAccountNumber")} onChange={(e) => setField("bankAccountNumber", e.target.value)} /></label>
        <label>IFSC<input value={field("ifsc")} onChange={(e) => setField("ifsc", e.target.value)} /></label>
        <label>UPI ID<input value={field("upiId")} onChange={(e) => setField("upiId", e.target.value)} /></label>
        <label>Authorized signatory name<input value={field("signatoryName")} onChange={(e) => setField("signatoryName", e.target.value)} /></label>
        <label>Signatory designation<input value={field("signatoryDesignation")} onChange={(e) => setField("signatoryDesignation", e.target.value)} placeholder="e.g. Director" /></label>
        <label>Invoice number prefix<input value={field("invoicePrefix")} onChange={(e) => setField("invoicePrefix", e.target.value)} /></label>
      </div>
      <label style={{ display: "block", marginTop: "0.5rem" }}>Invoice/bill Terms &amp; Conditions
        <textarea value={field("termsAndConditions")} onChange={(e) => setField("termsAndConditions", e.target.value)} rows={3} style={{ width: "100%" }} />
      </label>
      <button type="button" disabled={busy} onClick={save} style={{ marginTop: "0.5rem" }}>{busy ? "SAVING…" : "SAVE COMPANY PROFILE"}</button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0.5rem", marginTop: "1rem" }}>
        {/* Part I (Final 100% Completion Execution Contract) — a real image preview, not just a
            "(configured)" text label. The preview <img> hits company-branding-asset directly
            (a governed, settings:manage-gated read of the real uploaded bytes) — never a second
            copy of the file, and it degrades to nothing (no broken-image icon) when unconfigured. */}
        <label>Logo{profile?.logoFileId && <img src="/api/finance/company-branding-asset?kind=LOGO" alt="Company logo" style={{ display: "block", maxHeight: 60, marginTop: 4 }} />}<input type="file" accept="image/png,image/jpeg" disabled={busy || !profile} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAsset("LOGO", f); }} /></label>
        <label>Authorized signature{profile?.signatureFileId && <img src="/api/finance/company-branding-asset?kind=SIGNATURE" alt="Authorized signature" style={{ display: "block", maxHeight: 60, marginTop: 4 }} />}<input type="file" accept="image/png,image/jpeg" disabled={busy || !profile} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAsset("SIGNATURE", f); }} /></label>
        <label>Company seal{profile?.sealFileId && <img src="/api/finance/company-branding-asset?kind=SEAL" alt="Company seal" style={{ display: "block", maxHeight: 60, marginTop: 4 }} />}<input type="file" accept="image/png,image/jpeg" disabled={busy || !profile} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAsset("SEAL", f); }} /></label>
      </div>
      {!profile && <p className={styles.emptyHint}>Save the legal details above first — signature/seal upload needs a saved profile to attach to.</p>}
    </div>
  );
}
