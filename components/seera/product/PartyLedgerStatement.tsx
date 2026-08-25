"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./WorkflowActions.module.css";

async function getReport(report: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ report, ...params }).toString();
  const r = await fetch(`/api/finance/company-reports?${qs}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Report failed");
  return d;
}

const money = (v: number | null | undefined) => `₹${Math.round(Number(v ?? 0)).toLocaleString("en-IN")}`;
const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");
// Local-calendar-date, not UTC: `.toISOString()` would show "yesterday" for any IST (UTC+5:30)
// user between midnight and 5:30am, silently excluding today's transactions from the default
// statement window.
const isoDate = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;

// Same client-side export convention as FinanceWorkspacePanel's exportCsv — exports exactly the
// filtered rows currently on screen, so CSV values can never drift from what the UI shows.
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

type PartyType = "DISTRIBUTOR" | "SUPER_STOCKIST" | "VENDOR" | "EMPLOYEE";
const PARTY_TYPE_LABEL: Record<PartyType, string> = { DISTRIBUTOR: "Distributor", SUPER_STOCKIST: "Super Stockist", VENDOR: "Vendor", EMPLOYEE: "Employee" };

type LedgerLine = { skuCode: string; product: string; pack: string; uom: string; quantity: number; rate: number; taxable: number; gst: number; lineTotal: number };
type LedgerRow = { id: string; date: string; particulars: string; voucher: string; debit: number; credit: number; balance: number; sourceType: string; sourceId: string; reason?: string | null; territory?: string | null; costCentre?: string | null; treasury?: string | null; paymentReference?: string | null; createdBy?: string | null; postedAt: string | null; lines?: LedgerLine[] | null; moneyDeskTransactionId?: string | null };
type Statement = { party: { id: string; name: string; type: PartyType; address?: string | null; mobile?: string | null; gstin?: string | null; territory?: string | null }; period: { from: string; to: string }; normalSide: "DEBIT" | "CREDIT"; openingBalance: number; rows: LedgerRow[]; totals: { debit: number; credit: number; closingBalance: number } };

function balanceText(v: number, normalSide: "DEBIT" | "CREDIT") {
  if (Math.round(v) === 0) return `${money(0)}`;
  const isNormal = (v > 0) === (normalSide === "DEBIT");
  return `${money(Math.abs(v))} ${isNormal ? "Dr" : "Cr"}`;
}

export function PartyLedgerStatement({ portal }: { portal: string }) {
  // Bidirectional navigation (§7): a Money Desk transaction / other screen can deep-link here with
  // ?partyType=VENDOR&partyId=xxx already selected, instead of always landing on the empty picker.
  const searchParams = useSearchParams();
  const deepLinkPartyType = searchParams.get("partyType") as PartyType | null;
  const [partyType, setPartyType] = useState<PartyType>(deepLinkPartyType && deepLinkPartyType in PARTY_TYPE_LABEL ? deepLinkPartyType : "DISTRIBUTOR");
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [partyId, setPartyId] = useState(searchParams.get("partyId") ?? "");
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const hasDeepLinkedParty = useRef(Boolean(deepLinkPartyType && searchParams.get("partyId")));
  useEffect(() => {
    if (hasDeepLinkedParty.current) { hasDeepLinkedParty.current = false; } else { setPartyId(""); setStatement(null); }
    getReport("ledger-parties", { partyType }).then(setParties).catch(() => setParties([]));
  }, [partyType]);

  function load() {
    if (!partyId) return;
    setLoading(true);
    setErr(null);
    getReport("party-ledger-statement", { partyType, partyId, from, to })
      .then(setStatement)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load ledger"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { if (partyId) load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [partyId]);

  const docTypes = useMemo(() => [...new Set((statement?.rows ?? []).map((r) => r.particulars))], [statement]);
  const filteredRows = useMemo(() => {
    if (!statement) return [];
    const term = search.trim().toLowerCase();
    return statement.rows.filter((r) => (!docTypeFilter || r.particulars === docTypeFilter) && (!term || r.voucher.toLowerCase().includes(term) || (r.paymentReference ?? "").toLowerCase().includes(term)));
  }, [statement, search, docTypeFilter]);

  const pdfUrl = statement ? `/api/finance/statements/ledger-pdf?${new URLSearchParams({ partyType, partyId, from, to }).toString()}` : null;

  async function handleShare() {
    if (!pdfUrl || !statement) return;
    setShareNote(null);
    try {
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      const file = new File([blob], `Ledger-${statement.party.name}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: `Ledger Statement — ${statement.party.name}` });
      } else {
        setShareNote("Native sharing isn't available in this browser/device — the PDF has been downloaded instead; share it manually via WhatsApp or email.");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setShareNote("Could not prepare the statement for sharing — try Download PDF instead.");
    }
  }

  return (
    <div>
      <style>{`@media print { .money-desk-no-print { display: none !important; } .money-desk-ledger-print { box-shadow: none !important; } body { background: #fff !important; } }`}</style>
      <div className={`${styles.inlineActions} money-desk-no-print`} role="tablist" aria-label="Party type">
        {(Object.keys(PARTY_TYPE_LABEL) as PartyType[]).map((t) => (
          <button key={t} type="button" onClick={() => setPartyType(t)} aria-pressed={partyType === t} style={{ fontWeight: partyType === t ? 700 : 400 }}>{PARTY_TYPE_LABEL[t]}</button>
        ))}
      </div>
      <div className="money-desk-no-print" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginTop: "0.5rem" }}>
        <label>{PARTY_TYPE_LABEL[partyType]}
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">{parties.length === 0 ? `No ${PARTY_TYPE_LABEL[partyType].toLowerCase()}s found` : "Select…"}</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" disabled={!partyId || loading} onClick={load}>Apply</button>
        {statement && (
          <>
            <label>Document type
              <select value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}>
                <option value="">All</option>
                {docTypes.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Search voucher / reference <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. INV-1024" /></label>
          </>
        )}
      </div>

      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}

      {statement && (
        <>
          <div className="money-desk-no-print" style={{ display: "flex", gap: "0.5rem", margin: "0.75rem 0" }}>
            {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer"><button type="button">DOWNLOAD PDF</button></a>}
            <button type="button" onClick={() => window.print()}>PRINT</button>
            <button type="button" onClick={() => exportCsv(`ledger-${statement.party.name}`, filteredRows.map((r) => ({ Date: fmtDate(r.date), Particulars: r.particulars, Voucher: r.voucher, Debit: r.debit, Credit: r.credit, Balance: r.balance, "Source Type": r.sourceType, "Source Reference": r.sourceId, Territory: r.territory ?? "", "Cost Centre": r.costCentre ?? "", Treasury: r.treasury ?? "" })))}>DOWNLOAD CSV</button>
            <button type="button" onClick={handleShare}>SHARE</button>
          </div>
          {shareNote && <p role="status" data-ok="false">{shareNote}</p>}

          <div className="money-desk-ledger-print">
            <h3 style={{ marginBottom: 0 }}>SEERA — LEDGER STATEMENT</h3>
            <p style={{ margin: "0.25rem 0" }}>
              <strong>{statement.party.name}</strong> ({PARTY_TYPE_LABEL[statement.party.type]})
              {statement.party.territory ? ` · ${statement.party.territory}` : ""}
              {statement.party.gstin ? ` · GSTIN ${statement.party.gstin}` : ""}
              {statement.party.mobile ? ` · ${statement.party.mobile}` : ""}
            </p>
            {statement.party.address && <p style={{ margin: "0.25rem 0", opacity: 0.8 }}>{statement.party.address}</p>}
            <p style={{ margin: "0.25rem 0" }}>Statement Period: {fmtDate(statement.period.from)} to {fmtDate(statement.period.to)}</p>
            <p style={{ margin: "0.25rem 0" }}><strong>Opening Balance: {balanceText(statement.openingBalance, statement.normalSide)}</strong></p>

            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Particulars</th><th>Voucher</th><th>Debit</th><th>Credit</th><th>Running Balance</th><th className="money-desk-no-print"></th></tr></thead>
                <tbody>
                  {filteredRows.length === 0 && <tr><td colSpan={7}>No transactions in this period.</td></tr>}
                  {filteredRows.map((r) => (
                    <Fragment key={r.id}>
                      <tr>
                        <td>{fmtDate(r.date)}</td>
                        <td>{r.particulars}</td>
                        <td>{r.voucher}</td>
                        <td>{r.debit > 0 ? money(r.debit) : "—"}</td>
                        <td>{r.credit > 0 ? money(r.credit) : "—"}</td>
                        <td>{balanceText(r.balance, statement.normalSide)}</td>
                        <td className="money-desk-no-print"><button type="button" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>{expandedId === r.id ? "Hide" : "Details"}</button></td>
                      </tr>
                      {expandedId === r.id && (
                        <tr className="money-desk-no-print">
                          <td colSpan={7}>
                            <div style={{ padding: "0.5rem 0" }}>
                              {r.reason && <p><strong>Reason:</strong> {r.reason}</p>}
                              {r.territory && <p><strong>Territory:</strong> {r.territory}</p>}
                              {!r.territory && r.costCentre && <p><strong>Cost Centre:</strong> {r.costCentre}</p>}
                              {r.treasury && <p><strong>Treasury:</strong> {r.treasury}</p>}
                              {r.paymentReference && <p><strong>Payment Reference:</strong> {r.paymentReference}</p>}
                              {r.createdBy && <p><strong>Created By:</strong> {r.createdBy}</p>}
                              {r.postedAt && <p><strong>Posted At:</strong> {new Date(r.postedAt).toLocaleString("en-IN")}</p>}
                              <p><strong>Source:</strong> {r.sourceType.replace(/^Seera/, "")}
                                {r.sourceType === "SeeraCommercialDocument" && <> — <a href={`/api/documents/${r.sourceId}/download`} target="_blank" rel="noreferrer">View Document</a></>}
                                {r.moneyDeskTransactionId && <> — <a href={`/portal/${portal}/money-desk/${r.moneyDeskTransactionId}`}>View Money Desk Transaction</a></>}
                              </p>
                              {r.lines && r.lines.length > 0 && (
                                <div className={styles.tableWrap}>
                                  <table>
                                    <thead><tr><th>Product</th><th>SKU</th><th>Pack</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Line Total</th></tr></thead>
                                    <tbody>
                                      {r.lines.map((l, i) => <tr key={i}><td>{l.product}</td><td>{l.skuCode}</td><td>{l.pack}</td><td>{l.uom}</td><td>{l.quantity}</td><td>{money(l.rate)}</td><td>{money(l.taxable)}</td><td>{money(l.gst)}</td><td>{money(l.lineTotal)}</td></tr>)}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: "0.75rem" }}>
              <strong>Total Debit: {money(statement.totals.debit)}</strong> &nbsp;
              <strong>Total Credit: {money(statement.totals.credit)}</strong> &nbsp;
              <strong>Closing Balance: {balanceText(statement.totals.closingBalance, statement.normalSide)}</strong>
            </p>
            <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>Generated on {new Date().toLocaleString("en-IN")} — computer-generated statement.</p>
          </div>
        </>
      )}
    </div>
  );
}
