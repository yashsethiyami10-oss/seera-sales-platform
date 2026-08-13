"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./WorkflowActions.module.css";
import type { FinanceWorkspaceData } from "@/lib/finance/founder-workspace-data";

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

const GROUPS = ["overview", "money", "sales", "purchases", "control", "statements", "tools"] as const;
type Group = (typeof GROUPS)[number];
const GROUP_LABEL: Record<Group, string> = { overview: "Overview", money: "Money", sales: "Sales Finance", purchases: "Purchases & Costs", control: "Control", statements: "Statements", tools: "Tools" };
const GROUP_SECTIONS: Record<Group, { key: string; label: string }[]> = {
  overview: [],
  money: [{ key: "bank", label: "Bank & Cash" }, { key: "moneyin", label: "Money In" }, { key: "moneyout", label: "Money Out" }, { key: "transfer", label: "Transfer" }, { key: "statement", label: "Statement Import" }, { key: "reconcile", label: "Reconciliation" }, { key: "journals", label: "Recent Journals" }],
  sales: [{ key: "register", label: "Sales Register" }, { key: "ledger", label: "Party Ledger" }, { key: "advances", label: "Customer Advances" }, { key: "receipts", label: "Receipts" }],
  purchases: [{ key: "vendors", label: "Vendors & Bills" }, { key: "expenses", label: "Expenses" }, { key: "recurring", label: "Recurring Expenses" }, { key: "payroll", label: "Payroll" }, { key: "marketing", label: "Marketing Spend" }],
  control: [{ key: "budgets", label: "Budgets" }, { key: "approvals", label: "Approvals" }, { key: "capital", label: "Capital & Drawings" }, { key: "loans", label: "Loans" }, { key: "assets", label: "Fixed Assets" }, { key: "period", label: "Period Close" }],
  statements: [{ key: "trial", label: "Trial Balance" }, { key: "pl", label: "P&L" }, { key: "bs", label: "Balance Sheet" }, { key: "cf", label: "Cash Flow" }, { key: "forecast", label: "Forecast" }, { key: "gst", label: "GST Control" }],
  tools: [{ key: "documents", label: "Documents" }, { key: "search", label: "Search" }, { key: "reports", label: "Reports Center" }, { key: "settings", label: "Settings" }],
};

export function FinanceWorkspacePanel({ portal, data }: { portal: string; data: FinanceWorkspaceData }) {
  const router = useRouter();
  const [group, setGroup] = useState<Group>("overview");
  const [section, setSection] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isFounder = portal === "founder-admin" || portal === "company-admin";
  const visibleGroups = GROUPS.filter((g) => g !== "tools" || isFounder || true).filter((g) => g !== "control" || data.budgets !== null || data.loans !== null);

  function run(action: string, payload: unknown, successText: string, next?: () => void) {
    setBusy(true);
    setMessage(null);
    post(action, payload)
      .then(() => { setMessage({ ok: true, text: successText }); router.refresh(); next?.(); })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Action failed" }))
      .finally(() => setBusy(false));
  }
  const ctx: Ctx = { portal, isFounder, data, busy, run, router };

  useEffect(() => { setSection(GROUP_SECTIONS[group][0]?.key ?? ""); }, [group]);

  return (
    <section className={styles.panel}>
      <div>
        <small>{isFounder ? "FOUNDER FINANCE" : "ACCOUNTS"}</small>
        <h2>Company Finance</h2>
      </div>
      <div className={styles.inlineActions} role="tablist" aria-label="Finance groups">
        {visibleGroups.map((g) => (
          <button key={g} type="button" onClick={() => setGroup(g)} aria-pressed={group === g} style={{ fontWeight: group === g ? 700 : 400 }}>{GROUP_LABEL[g]}</button>
        ))}
      </div>
      {GROUP_SECTIONS[group].length > 0 && (
        <div className={styles.inlineActions} role="tablist" aria-label="Finance sections">
          {GROUP_SECTIONS[group].filter((s) => !(group === "tools" && s.key === "settings" && !isFounder)).map((s) => (
            <button key={s.key} type="button" onClick={() => setSection(s.key)} aria-pressed={section === s.key} style={{ fontWeight: section === s.key ? 700 : 400 }}>{s.label}</button>
          ))}
        </div>
      )}
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}

      <div style={{ gridColumn: "1/-1" }}>
        {group === "overview" && <OverviewSection ctx={ctx} setGroup={setGroup} setSection={setSection} />}
        {group === "money" && section === "bank" && <BankSection ctx={ctx} />}
        {group === "money" && section === "moneyin" && <MoneyInSection ctx={ctx} />}
        {group === "money" && section === "moneyout" && <MoneyOutSection ctx={ctx} />}
        {group === "money" && section === "transfer" && <TransferSection ctx={ctx} />}
        {group === "money" && section === "statement" && <StatementImportSection ctx={ctx} />}
        {group === "money" && section === "reconcile" && <ReconciliationSection ctx={ctx} />}
        {group === "money" && section === "journals" && <RecentJournalsSection />}
        {group === "sales" && section === "register" && <SalesRegisterSection />}
        {group === "sales" && section === "ledger" && <PartyLedgerSection />}
        {group === "sales" && section === "advances" && <CustomerAdvancesSection />}
        {group === "sales" && section === "receipts" && <ReceiptsSection />}
        {group === "purchases" && section === "vendors" && <VendorsSection ctx={ctx} />}
        {group === "purchases" && section === "expenses" && <ExpensesSection ctx={ctx} />}
        {group === "purchases" && section === "recurring" && <RecurringSection ctx={ctx} />}
        {group === "purchases" && section === "payroll" && <PayrollSection ctx={ctx} />}
        {group === "purchases" && section === "marketing" && <MarketingSection />}
        {group === "control" && section === "budgets" && <BudgetsSection ctx={ctx} />}
        {group === "control" && section === "approvals" && <ApprovalsSection ctx={ctx} />}
        {group === "control" && section === "capital" && <CapitalSection ctx={ctx} />}
        {group === "control" && section === "loans" && <LoansSection ctx={ctx} />}
        {group === "control" && section === "assets" && <AssetsSection ctx={ctx} />}
        {group === "control" && section === "period" && <PeriodSection ctx={ctx} />}
        {group === "statements" && <StatementsSection ctx={ctx} section={section} />}
        {group === "tools" && section === "documents" && <DocumentsSection />}
        {group === "tools" && section === "search" && <SearchSection />}
        {group === "tools" && section === "reports" && <ReportsCenterSection />}
        {group === "tools" && section === "settings" && isFounder && <SettingsSection ctx={ctx} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------
function OverviewSection({ ctx, setGroup, setSection }: { ctx: Ctx; setGroup: (g: Group) => void; setSection: (s: string) => void }) {
  const { data } = ctx;
  const jump = (g: Group, s: string) => { setGroup(g); setSection(s); };
  return (
    <div className={styles.notice} data-ok="true">
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
        {data.openingBalances && !data.openingBalances.posted && ctx.isFounder && <button type="button" onClick={() => jump("tools", "settings")}>Opening balances not yet posted →</button>}
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
// MONEY GROUP
// ---------------------------------------------------------------------------
function BankSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Account</th><th>Kind</th><th>Code</th></tr></thead>
          <tbody>
            {(data.treasuryAccounts ?? []).length === 0 && <tr><td colSpan={3}>No treasury accounts yet.</td></tr>}
            {(data.treasuryAccounts ?? []).map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.kind}</td><td>{t.code}</td></tr>)}
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

function PartyLedgerSection() {
  const { data: parties } = useReportOnDemand<{ id: string; name: string }[]>("parties", {}, []);
  const [partyId, setPartyId] = useState("");
  const { data: ledger, loading, err } = useReportOnDemand<{ balance: number; debit: number; credit: number; outstandingTotal: number; advancesAndUnapplied: number; transactions: { entryNumber: string; type: string; amount: string; postedAt: string; reason: string }[] }>("party-ledger", { partyId }, [partyId]);
  return (
    <div>
      <label>Company customer / S.S.<select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
        <option value="">Select…</option>
        {(parties ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      {partyId && loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      {partyId && ledger && (
        <>
          <p>Balance {money(ledger.balance)} · Outstanding {money(ledger.outstandingTotal)} · Advances/Unapplied {money(ledger.advancesAndUnapplied)}</p>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Entry</th><th>Type</th><th>Amount</th><th>Date</th><th>Reason</th></tr></thead>
              <tbody>
                {ledger.transactions.length === 0 && <tr><td colSpan={5}>No transactions.</td></tr>}
                {ledger.transactions.map((t) => <tr key={t.entryNumber}><td>{t.entryNumber}</td><td>{t.type}</td><td>{money(Number(t.amount))}</td><td>{fmtDate(t.postedAt)}</td><td>{t.reason}</td></tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
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
      <h3>Payables</h3>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Vendor</th><th>Invoice</th><th>Due date</th><th>Gross</th><th>Due</th><th>Status</th><th></th><th></th></tr></thead>
          <tbody>
            {(data.payables ?? []).length === 0 && <tr><td colSpan={8}>No vendor bills.</td></tr>}
            {(data.payables ?? []).map((b) => (
              <tr key={b.id}><td>{b.vendor?.legalName}</td><td>{b.vendorInvoiceNumber}</td><td>{fmtDate(b.dueDate)}</td><td>{money(Number(b.grossAmount))}</td><td>{money(b.due)}</td><td>{b.status}</td><td><ViewJournalButton journalId={b.journalId} /></td><td><DocAttach entityType="SeeraVendorBill" entityId={b.id} /></td></tr>
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
        <details><summary>+ RECORD VENDOR BILL</summary>
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

function ReportsCenterSection() {
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(isoDate(new Date()));
  const { data: byCategory } = useReportOnDemand<{ categoryId: string; categoryName: string; total: number }[]>("expense-by-category", { from, to }, [from, to]);
  const { data: byDept } = useReportOnDemand<{ dimensionId: string | null; name: string; total: number }[]>("expense-by-department", { from, to }, [from, to]);
  const { data: ageing } = useReportOnDemand<{ rows: { partyId: string; name: string; outstandingTotal: number }[]; buckets: Record<string, number> }>("receivables-ageing", {}, []);
  const { data: bySS } = useReportOnDemand<{ partyId: string; name: string; total: number }[]>("sales-by-ss", { from, to }, [from, to]);
  const { data: byProduct } = useReportOnDemand<{ product: string; total: number }[]>("sales-by-product", { from, to }, [from, to]);
  return (
    <div>
      <div className={styles.inlineActions}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <h4>Expense by Category <button type="button" disabled={!byCategory?.length} onClick={() => exportCsv("expense-by-category", byCategory ?? [])}>EXPORT CSV</button></h4>
      <div className={styles.tableWrap}><table><tbody>{byCategory?.map((c) => <tr key={c.categoryId}><td>{c.categoryName}</td><td>{money(c.total)}</td></tr>)}</tbody></table></div>
      <h4>Expense by Department <button type="button" disabled={!byDept?.length} onClick={() => exportCsv("expense-by-department", byDept ?? [])}>EXPORT CSV</button></h4>
      <div className={styles.tableWrap}><table><tbody>{byDept?.map((d) => <tr key={d.dimensionId ?? "none"}><td>{d.name}</td><td>{money(d.total)}</td></tr>)}</tbody></table></div>
      <h4>Receivables Ageing <button type="button" disabled={!ageing?.rows.length} onClick={() => exportCsv("receivables-ageing", ageing?.rows ?? [])}>EXPORT CSV</button></h4>
      {ageing && <p>Not due {money(ageing.buckets.NOT_DUE)} · 1-30d {money(ageing.buckets["1_30"])} · 31-60d {money(ageing.buckets["31_60"])} · 61-90d {money(ageing.buckets["61_90"])} · 90+d {money(ageing.buckets["90_PLUS"])}</p>}
      <h4>Company Sales by S.S. <button type="button" disabled={!bySS?.length} onClick={() => exportCsv("sales-by-ss", bySS ?? [])}>EXPORT CSV</button></h4>
      <div className={styles.tableWrap}><table><tbody>{bySS?.map((s) => <tr key={s.partyId}><td>{s.name}</td><td>{money(s.total)}</td></tr>)}</tbody></table></div>
      <h4>Company Sales by Product <button type="button" disabled={!byProduct?.length} onClick={() => exportCsv("sales-by-product", byProduct ?? [])}>EXPORT CSV</button></h4>
      <div className={styles.tableWrap}><table><tbody>{byProduct?.slice(0, 15).map((p) => <tr key={p.product}><td>{p.product}</td><td>{money(p.total)}</td></tr>)}</tbody></table></div>
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

function SettingsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const coaByCode = new Map((data.chartOfAccounts ?? []).map((a) => [a.code, a]));
  return (
    <div>
      <p>Chart of Accounts: {data.chartOfAccounts?.length ?? 0} accounts configured.</p>
      {(data.chartOfAccounts?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-coa", {}, "Chart of Accounts seeded.")}>BOOTSTRAP CHART OF ACCOUNTS</button>}
      {(data.dimensions?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-dimensions", {}, "Dimensions seeded.")}>BOOTSTRAP DEPARTMENTS</button>}
      {(data.approvalPolicies?.length ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => run("bootstrap-approval-policies", {}, "Approval policies seeded.")}>BOOTSTRAP APPROVAL POLICIES</button>}
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
