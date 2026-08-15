"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./WorkflowActions.module.css";
import type { ManufacturingWorkspaceData } from "@/lib/manufacturing/workspace-data";
import type { ManufacturingSearchResult } from "@/lib/manufacturing/search-service";

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/manufacturing/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}
async function getReport(report: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ report, ...params }).toString();
  const r = await fetch(`/api/manufacturing/reports?${qs}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Report failed");
  return d;
}
// Accepts unknown deliberately: values arrive either as plain numbers (RSC
// props, already Decimal-serialized in workspace-data.ts) or as JSON-transported
// strings (fetch()'d report data, where Prisma.Decimal.toJSON already
// stringified them) — Number() coerces either correctly.
const num = (v: unknown) => Number((v as number | string | null | undefined) ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
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

// enabled=false skips the fetch entirely (e.g. an ID-lookup report before the
// user has typed an ID) rather than firing a request that's guaranteed to
// 404/error — found via CSV proof UAT: PlanVsActualReport was firing
// report=plan-vs-actual&planId= on mount, a real (if harmless) noisy 404.
function useReportOnDemand<T>(report: string, params: Record<string, string>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  function load() {
    if (!enabled) return;
    setLoading(true);
    setErr(null);
    getReport(report, params).then((d) => setData(d)).catch((e) => setErr(e instanceof Error ? e.message : "Failed")).finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);
  return { data, loading, err, reload: load };
}

// Inline document attach (SOP/GRN/QC/Batch/Deviation/Material/Stock Count) —
// mirrors FinanceWorkspacePanel.tsx's DocAttach exactly (same StoredFile
// upload boundary, same list/upload/download shape), pointed at the
// Manufacturing document routes instead of Finance's.
function DocAttach({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [docs, setDocs] = useState<{ id: string; originalName: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  function load() {
    getReport("manufacturing-documents", { entityType, entityId }).then(setDocs).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => { load(); }, [entityId]);
  function upload(file: File) {
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.append("file", file);
    form.append("metadata", JSON.stringify({ entityType, entityId }));
    fetch("/api/manufacturing/documents/upload", { method: "POST", body: form })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error?.message ?? "Upload failed"); load(); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Upload failed"))
      .finally(() => setBusy(false));
  }
  return (
    <details>
      <summary>Documents {docs ? `(${docs.length})` : ""}</summary>
      {err && <p role="status" data-ok="false">{err}</p>}
      <ul>{docs?.map((d) => <li key={d.id}><a href={`/api/manufacturing/documents/${d.id}/download`} target="_blank" rel="noreferrer">{d.originalName}</a></li>)}</ul>
      <input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </details>
  );
}

type Ctx = { portal: string; data: ManufacturingWorkspaceData; busy: boolean; run: (action: string, payload: unknown, successText: string, next?: () => void) => void; router: ReturnType<typeof useRouter>; focusId: string | null; setFocusId: (id: string | null) => void; jump: (g: Group, s: string, focusId?: string) => void };

const GROUPS = ["overview", "production", "formulations", "materials", "quality", "warehouse", "cost", "masters", "search", "reports"] as const;
type Group = (typeof GROUPS)[number];
const GROUP_LABEL: Record<Group, string> = { overview: "Overview", production: "Production", formulations: "Formulations", materials: "Materials", quality: "Quality", warehouse: "Warehouse", cost: "Cost & Control", masters: "Masters", search: "Search", reports: "Reports Center" };
const GROUP_SECTIONS: Record<Group, { key: string; label: string }[]> = {
  overview: [],
  production: [{ key: "orders", label: "Production Orders" }, { key: "daily", label: "Daily Production" }, { key: "batches", label: "Batch Traceability" }],
  formulations: [{ key: "bom", label: "BOM / Formula" }, { key: "packaging", label: "Packaging BOM" }, { key: "sop", label: "SOP Versions" }, { key: "product-360", label: "Product 360" }],
  materials: [{ key: "master", label: "Material Master" }, { key: "stock", label: "Material Stock" }, { key: "alerts", label: "Low Stock / Expiry" }],
  quality: [{ key: "queue", label: "QC Queue" }, { key: "grn-qc", label: "GRN QC" }],
  warehouse: [{ key: "locations", label: "Locations" }, { key: "grn", label: "GRN" }, { key: "transfers", label: "Transfers & Adjustments" }, { key: "counts", label: "Stock Counts" }],
  cost: [{ key: "batch-cost", label: "Batch Cost" }, { key: "wastage", label: "Wastage" }, { key: "deviation", label: "Deviations" }],
  masters: [{ key: "machines", label: "Machines / Lines" }, { key: "shifts", label: "Shifts" }, { key: "company-stock", label: "Company Stock Mode" }],
  search: [],
  reports: [{ key: "production", label: "Production" }, { key: "material", label: "Material" }, { key: "packaging", label: "Packaging" }, { key: "quality", label: "Quality" }, { key: "efficiency", label: "Efficiency" }, { key: "costing", label: "Costing" }, { key: "traceability", label: "Traceability" }],
};

export function ManufacturingWorkspacePanel({ portal, data }: { portal: string; data: ManufacturingWorkspaceData }) {
  const router = useRouter();
  const [group, setGroup] = useState<Group>("overview");
  const [section, setSection] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  function run(action: string, payload: unknown, successText: string, next?: () => void) {
    setBusy(true);
    setMessage(null);
    post(action, payload).then(() => { setMessage({ ok: true, text: successText }); router.refresh(); next?.(); }).catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Action failed" })).finally(() => setBusy(false));
  }
  // Shared next-action jump — every "success -> go do the next real thing"
  // link in this panel routes through here, so switching group/section and
  // (optionally) pre-filling a Batch 360 lookup always stays consistent.
  function jump(g: Group, s: string, jumpFocusId?: string) { if (jumpFocusId) setFocusId(jumpFocusId); setGroup(g); setSection(s); }
  const ctx: Ctx = { portal, data, busy, run, router, focusId, setFocusId, jump };
  useEffect(() => { setSection(GROUP_SECTIONS[group][0]?.key ?? ""); }, [group]);

  // Genuinely simplified single-purpose shells (closure spec §5/6/7) — not
  // the full command-and-control nav with hidden buttons. data.roleView is
  // computed server-side in workspace-data.ts from the actor's actual
  // permission set, so a role that shouldn't see BOM/SOP/Finance/Founder
  // settings never even receives the full nav's markup.
  if (data.roleView === "OPERATOR") return <OperatorWorkspace ctx={ctx} message={message} />;
  if (data.roleView === "STORE") return <StoreWorkspace ctx={ctx} message={message} />;
  if (data.roleView === "QC") return <QcWorkspace ctx={ctx} message={message} />;

  return (
    <section className={styles.panel}>
      <div><small>MANUFACTURING</small><h2>Manufacturing OS</h2></div>
      <div className={styles.inlineActions} role="tablist" aria-label="Manufacturing groups">
        {GROUPS.map((g) => <button key={g} type="button" onClick={() => setGroup(g)} aria-pressed={group === g} style={{ fontWeight: group === g ? 700 : 400 }}>{GROUP_LABEL[g]}</button>)}
      </div>
      {GROUP_SECTIONS[group].length > 0 && (
        <div className={styles.inlineActions} role="tablist" aria-label="Manufacturing sections">
          {GROUP_SECTIONS[group].map((s) => <button key={s.key} type="button" onClick={() => setSection(s.key)} aria-pressed={section === s.key} style={{ fontWeight: section === s.key ? 700 : 400 }}>{s.label}</button>)}
        </div>
      )}
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      <div style={{ gridColumn: "1/-1" }}>
        {group === "overview" && <OverviewSection ctx={ctx} setGroup={setGroup} setSection={setSection} />}
        {group === "production" && section === "orders" && <OrdersSection ctx={ctx} />}
        {group === "production" && section === "daily" && <DailyProductionSection ctx={ctx} />}
        {group === "production" && section === "batches" && <BatchesSection ctx={ctx} />}
        {group === "formulations" && section === "bom" && <BomSection ctx={ctx} />}
        {group === "formulations" && section === "packaging" && <PackagingBomSection ctx={ctx} />}
        {group === "formulations" && section === "sop" && <SopSection ctx={ctx} />}
        {group === "formulations" && section === "product-360" && <Product360Section />}
        {group === "materials" && section === "master" && <MaterialMasterSection ctx={ctx} />}
        {group === "materials" && section === "stock" && <MaterialStockSection />}
        {group === "materials" && section === "alerts" && <MaterialAlertsSection ctx={ctx} setGroup={setGroup} />}
        {group === "quality" && section === "queue" && <QcQueueSection ctx={ctx} />}
        {group === "quality" && section === "grn-qc" && <GrnQcSection ctx={ctx} />}
        {group === "warehouse" && section === "locations" && <LocationsSection ctx={ctx} />}
        {group === "warehouse" && section === "grn" && <GrnSection ctx={ctx} />}
        {group === "warehouse" && section === "transfers" && <TransfersSection ctx={ctx} />}
        {group === "warehouse" && section === "counts" && <StockCountsSection ctx={ctx} />}
        {group === "cost" && section === "batch-cost" && <BatchCostSection ctx={ctx} />}
        {group === "cost" && section === "wastage" && <WastageSection ctx={ctx} />}
        {group === "cost" && section === "deviation" && <DeviationSection ctx={ctx} />}
        {group === "masters" && section === "machines" && <MachinesSection ctx={ctx} />}
        {group === "masters" && section === "shifts" && <ShiftsSection ctx={ctx} />}
        {group === "masters" && section === "company-stock" && <CompanyInventoryModeSection ctx={ctx} />}
        {group === "search" && <SearchSection ctx={ctx} setGroup={setGroup} setSection={setSection} />}
        {group === "reports" && <ReportsCenterSection ctx={ctx} section={section} />}
      </div>
    </section>
  );
}

// --- OVERVIEW ---------------------------------------------------------------
function OverviewSection({ ctx, setGroup, setSection }: { ctx: Ctx; setGroup: (g: Group) => void; setSection: (s: string) => void }) {
  const { data } = ctx;
  const jump = (g: Group, s: string) => { setGroup(g); setSection(s); };
  const openOrders = (data.orders ?? []).filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status));
  const todayIso = isoDate(new Date());
  const { data: today } = useReportOnDemand<{ id: string; date: string; actualOutputQuantity: number | null; status: string; qcStatus: string }[]>("daily-production", { from: new Date(todayIso).toISOString(), to: new Date(new Date(todayIso).getTime() + 86_399_999).toISOString() }, []);
  const { data: inventoryValue } = useReportOnDemand<{ totalValue: number; costedMaterialCount: number; uncostedMaterialCount: number } | null>("manufacturing-inventory-value", {}, []);
  const { data: attention } = useReportOnDemand<{ skusWithoutActiveBom: number; qcFailedBatches: number } | null>("dashboard-attention-signals", {}, []);
  const startedToday = today?.length ?? 0;
  const completedToday = today?.filter((b) => b.status === "COMPLETED").length ?? 0;
  const outputToday = today?.reduce((s, b) => s + (b.actualOutputQuantity ?? 0), 0) ?? 0;
  return (
    <div className={styles.notice} data-ok="true">
      <h3>Today</h3>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <div><dt>Batches started today</dt><dd>{today ? startedToday : "DATA REQUIRED"}</dd></div>
        <div><dt>Batches completed today</dt><dd>{today ? completedToday : "DATA REQUIRED"}</dd></div>
        <div><dt>Output today</dt><dd>{today ? num(outputToday) : "DATA REQUIRED"}</dd></div>
        <div><dt>Open production orders</dt><dd>{data.orders ? openOrders.length : "DATA REQUIRED"}</dd></div>
        <div><dt>Pending QC</dt><dd>{data.qc ? data.qc.length : "DATA REQUIRED"}</dd></div>
      </dl>
      <h3>Material</h3>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <div><dt>GRN pending QC</dt><dd>{data.grnQc ? data.grnQc.length : "DATA REQUIRED"}</dd></div>
        <div><dt>Materials low on stock</dt><dd>{data.lowStock ? data.lowStock.length : "DATA REQUIRED"}</dd></div>
        <div><dt>Near-expiry lots</dt><dd>{data.nearExpiry ? data.nearExpiry.filter((l) => !l.expired).length : "DATA REQUIRED"}</dd></div>
        <div><dt>Expired lots</dt><dd>{data.nearExpiry ? data.nearExpiry.filter((l) => l.expired).length : "DATA REQUIRED"}</dd></div>
      </dl>
      <h3>Efficiency</h3>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <div><dt>Open deviations</dt><dd>{data.deviations ? data.deviations.length : "DATA REQUIRED"}</dd></div>
        <div><dt>Wastage (30d)</dt><dd>{data.wastage ? `${data.wastage.records.length} record(s)` : "DATA REQUIRED"}</dd></div>
        <div><dt>QC failed (open)</dt><dd>{attention ? attention.qcFailedBatches : "DATA REQUIRED"}</dd></div>
      </dl>
      {(inventoryValue != null || data.cogsCoverage != null) && (
        <>
          <h3>Financial</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
            {inventoryValue != null && <div><dt>Manufacturing Inventory Value</dt><dd>{num(inventoryValue.totalValue)}{inventoryValue.uncostedMaterialCount > 0 ? ` (${inventoryValue.uncostedMaterialCount} material(s) uncosted, excluded)` : ""}</dd></div>}
            {data.companyInventoryMode != null && <div><dt>Company Stock Mode</dt><dd>{data.companyInventoryMode}</dd></div>}
            {data.cogsCoverage != null && <div><dt>COGS coverage (30d)</dt><dd>{data.cogsCoverage.coveragePct}%</dd></div>}
          </dl>
        </>
      )}
      <h3>Attention</h3>
      <div className={styles.inlineActions}>
        {(data.qc?.length ?? 0) > 0 && <button type="button" onClick={() => jump("quality", "queue")}>{data.qc!.length} batch(es) awaiting QC →</button>}
        {(data.grnQc?.length ?? 0) > 0 && <button type="button" onClick={() => jump("quality", "grn-qc")}>{data.grnQc!.length} GRN line(s) pending QC →</button>}
        {(data.lowStock?.length ?? 0) > 0 && <button type="button" onClick={() => jump("materials", "alerts")}>{data.lowStock!.length} material(s) below reorder level →</button>}
        {(data.nearExpiry?.filter((l) => l.expired).length ?? 0) > 0 && <button type="button" onClick={() => jump("materials", "alerts")}>{data.nearExpiry!.filter((l) => l.expired).length} expired lot(s) →</button>}
        {(data.deviations?.length ?? 0) > 0 && <button type="button" onClick={() => jump("cost", "deviation")}>{data.deviations!.length} open deviation(s) →</button>}
        {(data.boms?.length ?? 0) === 0 && <p>No BOMs configured yet — Production Orders cannot be created until at least one active BOM exists (BOM / SOP NOT CONFIGURED).</p>}
        {(attention?.skusWithoutActiveBom ?? 0) > 0 && <button type="button" onClick={() => jump("formulations", "bom")}>{attention!.skusWithoutActiveBom} product(s) with no active BOM →</button>}
        {(attention?.qcFailedBatches ?? 0) > 0 && <button type="button" onClick={() => jump("reports", "quality")}>{attention!.qcFailedBatches} batch(es) failed QC →</button>}
        {(data.cogsCoverage?.exceptions ?? 0) > 0 && <button type="button" onClick={() => jump("masters", "company-stock")}>{data.cogsCoverage!.exceptions} Company dispatch(es) with an incomplete cost basis (COST_BASIS_REQUIRED) →</button>}
        {data.companyInventoryMode === "MANUFACTURING_GOVERNED" && <button type="button" onClick={() => jump("masters", "company-stock")}>Company Stock Mode is GOVERNED — view stock/COGS position →</button>}
      </div>
    </div>
  );
}

// --- PRODUCTION ---------------------------------------------------------------
function OrdersSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const { data: skus } = useReportOnDemand<{ id: string; code: string; productName: string }[]>("sku-list", {}, []);
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Order #</th><th>Product</th><th>Planned batches</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {(data.orders ?? []).length === 0 && <tr><td colSpan={6}>No production orders.</td></tr>}
            {(data.orders ?? []).map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td><td>{skus?.find((s) => s.id === o.productSkuId)?.productName ?? o.productSkuId}</td><td>{o.plannedBatches}</td><td>{fmtDate(o.productionDate)}</td><td>{o.status}</td>
                <td>
                  {o.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => run("approve-production-order", { orderId: o.id }, "Order approved.")}>APPROVE</button>}
                  {o.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => run("reserve-order-materials", { orderId: o.id }, "Materials reserved — order is READY. Go to Daily Production to start.", () => ctx.jump("production", "daily"))}>RESERVE MATERIALS</button>}
                  {!["COMPLETED", "CANCELLED"].includes(o.status) && <button type="button" disabled={busy} onClick={() => run("cancel-production-order", { orderId: o.id, reason: "Cancelled from workspace" }, "Order cancelled.")}>CANCEL</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {skus && skus.length > 0 && (
        <details><summary>+ CREATE PRODUCTION ORDER</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-production-order", { productSkuId: f.get("productSkuId"), plannedBatches: Number(f.get("plannedBatches")), plannedOutput: Number(f.get("plannedOutput")), productionDate: f.get("productionDate"), idempotencyKey: key() }, "Production order created (if an active BOM exists for this product)."); }}>
            <label>Product SKU<select name="productSkuId" required>{skus.map((s) => <option key={s.id} value={s.id}>{s.productName}</option>)}</select></label>
            <label>Planned batches<input name="plannedBatches" type="number" min="1" required /></label>
            <label>Planned output<input name="plannedOutput" type="number" step="0.001" required /></label>
            <label>Production date<input name="productionDate" type="date" required defaultValue={isoDate(new Date())} /></label>
            <button disabled={busy}>CREATE ORDER</button>
          </form>
        </details>
      )}
    </div>
  );
}

function DailyProductionSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const readyOrders = (data.orders ?? []).filter((o) => ["READY", "IN_PROGRESS"].includes(o.status));
  const rawLocations = (data.locations ?? []).filter((l) => l.type === "RAW_STORE");
  const packLocations = (data.locations ?? []).filter((l) => l.type === "PACKAGING_STORE");
  const fgLocations = (data.locations ?? []).filter((l) => l.type === "FINISHED_STORE");
  const { data: shifts } = useReportOnDemand<ShiftRow[]>("shifts", { activeOnly: "true" }, []);
  const { data: machines } = useReportOnDemand<MachineRow[]>("machines", { activeOnly: "true" }, []);
  if (readyOrders.length === 0) return <p>No order is READY/IN_PROGRESS yet — approve and reserve materials for an order first (Production Orders tab).</p>;
  if (!rawLocations.length || !packLocations.length || !fgLocations.length) return <p>Configure at least one RAW_STORE, PACKAGING_STORE and FINISHED_STORE location first (Warehouse → Locations).</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; run("record-daily-production", { productionOrderId: f.get("productionOrderId"), date: f.get("date"), batchCount: Number(f.get("batchCount")), actualOutputQuantity: Number(f.get("actualOutputQuantity")), outputUnit: f.get("outputUnit"), shiftId: f.get("shiftId") || undefined, machineId: f.get("machineId") || undefined, finishedGoodsLocationId: f.get("finishedGoodsLocationId"), rawStoreLocationId: f.get("rawStoreLocationId"), packagingStoreLocationId: f.get("packagingStoreLocationId"), idempotencyKey: key() }, "Production recorded — batch created, awaiting QC. Go to Quality → QC Queue to release it.", () => { form.reset(); ctx.jump("quality", "queue"); }); }}>
      <label>Production order<select name="productionOrderId" required>{readyOrders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} ({o.plannedBatches} planned)</option>)}</select></label>
      <label>Date<input name="date" type="date" required defaultValue={isoDate(new Date())} /></label>
      <label>Number of batches<input name="batchCount" type="number" min="1" required /></label>
      <label>Actual output quantity<input name="actualOutputQuantity" type="number" step="0.001" required /></label>
      <label>Output unit<select name="outputUnit" required><option value="KG">KG</option><option value="PCS">PCS</option><option value="LITRE">LITRE</option></select></label>
      <label>Shift (optional)<select name="shiftId"><option value="">— none —</option>{shifts?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}</select></label>
      <label>Machine (optional)<select name="machineId"><option value="">— none —</option>{machines?.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></label>
      <label>Raw store<select name="rawStoreLocationId" required>{rawLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Packaging store<select name="packagingStoreLocationId" required>{packLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Finished goods store<select name="finishedGoodsLocationId" required>{fgLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <button disabled={busy}>CONFIRM PRODUCTION</button>
    </form>
  );
}

// Batch 360 (closure spec §11): adds Company Stock Release status, Company
// Dispatch History, and COGS impact per dispatch on top of the traceability
// view that already existed — reusing the new finished-batch-to-company-
// dispatch report (company-stock-service's SeeraCompanyDispatchAllocation)
// rather than duplicating that query here.
function BatchesSection({ ctx }: { ctx: Ctx }) {
  const [batchId, setBatchId] = useState(ctx.focusId ?? "");
  useEffect(() => { if (ctx.focusId) { setBatchId(ctx.focusId); ctx.setFocusId(null); } }, [ctx.focusId]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading, err } = useReportOnDemand<{ batch: { batchNumber: string; date: string; status: string; qcStatus: string; actualOutputQuantity: string; yieldPct: string }; events: { kind: string; materialId: string; canonicalQuantity: string; theoreticalQuantity: string | null }[]; consumptionVariance: { materialId: string; theoretical: number; actual: number; variance: number }[]; fgReceipt: { qcStatus: string; quantity: string } | null; wastage: { wasteQuantity: string; wastageType: string }[] }>("batch-detail", { batchId }, [batchId], !!batchId);
  const { data: dispatchHistory } = useReportOnDemand<{ batchId: string; dispatches: { allocationId: string; orderNumber: string; superStockist: string; quantity: number; unitCost: number | null; costConfidence: string; dispatchedAt: string }[] }>("finished-batch-to-company-dispatch", { batchId }, [batchId], !!batchId);
  return (
    <div>
      <label>Batch ID (from Production Orders / QC Queue / Search)<input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Paste a batch ID to view traceability" /></label>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      {data && (
        <div>
          <p><strong>{data.batch.batchNumber}</strong> — {fmtDate(data.batch.date)} — {data.batch.status} — QC: {data.batch.qcStatus} — Output {num(data.batch.actualOutputQuantity)} — Yield {data.batch.yieldPct}%</p>
          <h4>Material Events (raw-lot ↔ finished-batch traceability)</h4>
          <div className={styles.tableWrap}><table><thead><tr><th>Kind</th><th>Material</th><th>Theoretical</th><th>Actual</th></tr></thead><tbody>{data.events.map((e, i) => <tr key={i}><td>{e.kind}</td><td>{e.materialId}</td><td>{e.theoreticalQuantity ? num(e.theoreticalQuantity) : "—"}</td><td>{num(e.canonicalQuantity)}</td></tr>)}</tbody></table></div>
          <h4>Consumption Variance</h4>
          <div className={styles.tableWrap}><table><thead><tr><th>Material</th><th>Theoretical</th><th>Actual</th><th>Variance</th></tr></thead><tbody>{data.consumptionVariance.map((v, i) => <tr key={i}><td>{v.materialId}</td><td>{num(v.theoretical)}</td><td>{num(v.actual)}</td><td>{num(v.variance)}</td></tr>)}</tbody></table></div>
          {data.wastage.length > 0 && <p>Wastage: {data.wastage.map((w) => `${w.wastageType} ${num(w.wasteQuantity)}`).join(", ")}</p>}
          {data.fgReceipt && <p>Company Stock Release: {num(data.fgReceipt.quantity)} — QC {data.fgReceipt.qcStatus}{data.fgReceipt.qcStatus === "RELEASED" ? " (released into Company inventory)" : " (not yet released)"}</p>}
          <h4>Company Dispatch History &amp; COGS Impact</h4>
          {(!dispatchHistory || dispatchHistory.dispatches.length === 0) && <p>No Company dispatches allocated against this batch yet.</p>}
          {dispatchHistory && dispatchHistory.dispatches.length > 0 && (
            <div className={styles.tableWrap}><table><thead><tr><th>Order</th><th>S.S.</th><th>Qty Dispatched</th><th>Unit Cost</th><th>COGS Impact</th><th>Confidence</th><th>Date</th></tr></thead><tbody>
              {dispatchHistory.dispatches.map((d) => <tr key={d.allocationId}><td>{d.orderNumber}</td><td>{d.superStockist}</td><td>{num(d.quantity)}</td><td>{d.unitCost != null ? num(d.unitCost) : "COST_BASIS_REQUIRED"}</td><td>{d.unitCost != null ? num(d.quantity * d.unitCost) : "UNAVAILABLE"}</td><td>{d.costConfidence}</td><td>{fmtDate(d.dispatchedAt)}</td></tr>)}
            </tbody></table></div>
          )}
          <DocAttach entityType="SeeraProductionBatch" entityId={data.batch.batchNumber ? batchId : ""} />
          <div className={styles.inlineActions}>
            <a href={`/api/manufacturing/reports/pdf?report=batch-summary&batchId=${batchId}`} target="_blank" rel="noreferrer"><button type="button">EXPORT BATCH SUMMARY PDF</button></a>
            <a href={`/api/manufacturing/reports/pdf?report=traceability&batchId=${batchId}`} target="_blank" rel="noreferrer"><button type="button">EXPORT TRACEABILITY PDF</button></a>
          </div>
        </div>
      )}
    </div>
  );
}

// --- FORMULATIONS ---------------------------------------------------------------
function BomSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const { data: skus } = useReportOnDemand<{ id: string; productName: string }[]>("sku-list", {}, []);
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Product</th><th>Version</th><th>Status</th><th>Batch size</th><th>Action</th></tr></thead>
          <tbody>{(data.boms ?? []).length === 0 && <tr><td colSpan={5}>No BOMs — BOM / SOP NOT CONFIGURED.</td></tr>}
            {(data.boms ?? []).map((b) => (
              <tr key={b.id}>
                <td>{skus?.find((s) => s.id === b.productSkuId)?.productName ?? b.productSkuId}</td><td>{b.version}</td><td>{b.status}</td><td>{num(b.standardBatchSize)} {b.batchUnit}</td>
                <td>
                  {b.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => run("submit-bom-for-review", { bomId: b.id }, "Submitted for review.")}>SUBMIT FOR REVIEW</button>}
                  {b.status === "UNDER_REVIEW" && <button type="button" disabled={busy} onClick={() => run("approve-bom", { bomId: b.id }, "Approved.")}>APPROVE</button>}
                  {b.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => run("activate-bom", { bomId: b.id }, "Activated — this is now the production version.")}>ACTIVATE</button>}
                  {b.status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => run("retire-bom", { bomId: b.id }, "Retired.")}>RETIRE</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {skus && skus.length > 0 && (data.rawMaterials?.length ?? 0) > 0 && (
        <details><summary>+ CREATE BOM DRAFT</summary>
          <BomLineForm ctx={ctx} skus={skus} />
        </details>
      )}
    </div>
  );
}
function BomLineForm({ ctx, skus }: { ctx: Ctx; skus: { id: string; productName: string }[] }) {
  const { data, run, busy } = ctx;
  const [lines, setLines] = useState<{ materialId: string; qty: string }[]>([{ materialId: "", qty: "" }]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const bomLines = lines.filter((l) => l.materialId && l.qty).map((l) => { const m = data.materials?.find((x) => x.id === l.materialId); return { materialId: l.materialId, requiredQuantity: Number(l.qty), unit: m?.baseUnit ?? "KG", canonicalQuantity: Number(l.qty) }; }); run("create-bom-draft", { productSkuId: f.get("productSkuId"), standardBatchSize: Number(f.get("standardBatchSize")), batchUnit: f.get("batchUnit"), expectedOutput: f.get("expectedOutput") ? Number(f.get("expectedOutput")) : undefined, lines: bomLines }, "BOM draft created — submit it for review when ready."); }}>
      <label>Product<select name="productSkuId" required>{skus.map((s) => <option key={s.id} value={s.id}>{s.productName}</option>)}</select></label>
      <label>Standard batch size<input name="standardBatchSize" type="number" step="0.001" required /></label>
      <label>Batch unit<select name="batchUnit" required><option value="KG">KG</option><option value="LITRE">LITRE</option><option value="PCS">PCS</option></select></label>
      <label>Expected output (per batch)<input name="expectedOutput" type="number" step="0.001" /></label>
      {lines.map((l, i) => (
        <div key={i} className={styles.inlineActions}>
          <select value={l.materialId} onChange={(e) => setLines((v) => v.map((x, j) => (j === i ? { ...x, materialId: e.target.value } : x)))}>
            <option value="">Material…</option>
            {(data.rawMaterials ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="number" step="0.0001" placeholder="Qty per batch" value={l.qty} onChange={(e) => setLines((v) => v.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
        </div>
      ))}
      <button type="button" onClick={() => setLines((v) => [...v, { materialId: "", qty: "" }])}>+ ADD LINE</button>
      <button disabled={busy}>CREATE BOM DRAFT</button>
    </form>
  );
}

function PackagingBomSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const { data: skus } = useReportOnDemand<{ id: string; productName: string }[]>("sku-list", {}, []);
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Product</th><th>Pack level</th><th>Version</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{(data.packagingBoms ?? []).length === 0 && <tr><td colSpan={5}>No packaging BOMs.</td></tr>}
            {(data.packagingBoms ?? []).map((b) => (
              <tr key={b.id}>
                <td>{skus?.find((s) => s.id === b.productSkuId)?.productName ?? b.productSkuId}</td><td>{b.packLevel}</td><td>{b.version}</td><td>{b.status}</td>
                <td>
                  {b.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => run("approve-packaging-bom", { packagingBomId: b.id }, "Approved.")}>APPROVE</button>}
                  {b.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => run("activate-packaging-bom", { packagingBomId: b.id }, "Activated.")}>ACTIVATE</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {skus && skus.length > 0 && (data.packagingMaterials?.length ?? 0) > 0 && (
        <details><summary>+ CREATE PACKAGING BOM</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const m = data.packagingMaterials!.find((x) => x.id === f.get("materialId")); run("create-packaging-bom-draft", { productSkuId: f.get("productSkuId"), packLevel: f.get("packLevel"), effectiveFrom: new Date().toISOString(), lines: [{ materialId: f.get("materialId"), quantityPerUnit: Number(f.get("qty")), unit: m?.baseUnit ?? "PCS", canonicalQuantity: Number(f.get("qty")) }] }, "Packaging BOM draft created."); }}>
            <label>Product<select name="productSkuId" required>{skus.map((s) => <option key={s.id} value={s.id}>{s.productName}</option>)}</select></label>
            <label>Pack level<select name="packLevel"><option value="PRIMARY">Primary</option><option value="SECONDARY">Secondary</option><option value="TERTIARY">Tertiary</option></select></label>
            <label>Packaging material<select name="materialId" required>{data.packagingMaterials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label>Quantity per unit of output<input name="qty" type="number" step="0.0001" required /></label>
            <button disabled={busy}>CREATE PACKAGING BOM</button>
          </form>
        </details>
      )}
    </div>
  );
}

function SopSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const { data: skus } = useReportOnDemand<{ id: string; productName: string }[]>("sku-list", {}, []);
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Product</th><th>Version</th><th>Status</th><th>Action</th><th>Document</th></tr></thead>
          <tbody>{(data.sops ?? []).length === 0 && <tr><td colSpan={5}>No SOPs uploaded yet.</td></tr>}
            {(data.sops ?? []).map((s) => (
              <tr key={s.id}>
                <td>{skus?.find((x) => x.id === s.productSkuId)?.productName ?? s.productSkuId}</td><td>{s.version}</td><td>{s.status}</td>
                <td>
                  {s.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => run("approve-sop", { sopId: s.id }, "Approved.")}>APPROVE</button>}
                  {s.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => run("activate-sop", { sopId: s.id }, "Activated.")}>ACTIVATE</button>}
                </td>
                <td><DocAttach entityType="SeeraSop" entityId={s.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {skus && skus.length > 0 && (
        <details><summary>+ CREATE SOP RECORD</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-sop-draft", { productSkuId: f.get("productSkuId"), effectiveFrom: new Date().toISOString(), notes: f.get("notes") || undefined }, "SOP record created — attach the SOP document below."); }}>
            <label>Product<select name="productSkuId" required>{skus.map((s) => <option key={s.id} value={s.id}>{s.productName}</option>)}</select></label>
            <label>Notes<input name="notes" /></label>
            <button disabled={busy}>CREATE SOP RECORD</button>
          </form>
        </details>
      )}
    </div>
  );
}

// Product Manufacturing 360 (closure spec §10/J): active BOM/SOP/Packaging
// BOM, production history, Company finished stock, QC/yield/wastage, cost
// trend, dispatch qty and COGS coverage for one SKU, one round trip.
function Product360Section() {
  const { data: skus } = useReportOnDemand<{ id: string; code: string; productName: string }[]>("sku-list", {}, []);
  const [productSkuId, setProductSkuId] = useState("");
  const { data, loading, err } = useReportOnDemand<{
    activeBom: { id: string; version: number; standardBatchSize: number; batchUnit: string; lines: { materialId: string; requiredQuantity: number; unit: string }[] } | null;
    activeSop: { id: string; version: number; effectiveFrom: string } | null;
    activePackagingBom: { id: string; version: number } | null;
    finishedStock: { onHand: number; reserved: number; available: number };
    productionHistory: { id: string; batchNumber: string; date: string; status: string; qcStatus: string; actualOutputQuantity: number | null; yieldPct: number | null }[];
    qc: { id: string; batchId: string | null; parameter: string; passFail: boolean | null; sampleDate: string }[];
    avgYieldPct: number | null;
    totalWastage: number;
    totalDispatchedQty: number;
    cogsCoveragePct: number | null;
  }>("product-360", { productSkuId }, [productSkuId], !!productSkuId);
  const { data: costTrend } = useReportOnDemand<{ batchId: string; batchNumber: string; date: string; cost: { unitCost: string | number | null; confidence: string } | null }[]>("batch-cost-trend", { productSkuId }, [productSkuId], !!productSkuId);
  return (
    <div>
      <label>Product<select value={productSkuId} onChange={(e) => setProductSkuId(e.target.value)}><option value="">— select a product —</option>{skus?.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.productName}</option>)}</select></label>
      {loading && <p>Loading…</p>}
      {err && productSkuId && <p role="status" data-ok="false">{err}</p>}
      {data && (
        <div>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
            <div><dt>Active BOM</dt><dd>{data.activeBom ? `v${data.activeBom.version} (batch ${num(data.activeBom.standardBatchSize)} ${data.activeBom.batchUnit})` : "BOM / SOP NOT CONFIGURED"}</dd></div>
            <div><dt>Active SOP</dt><dd>{data.activeSop ? `v${data.activeSop.version}` : "BOM / SOP NOT CONFIGURED"}</dd></div>
            <div><dt>Active Packaging BOM</dt><dd>{data.activePackagingBom ? `v${data.activePackagingBom.version}` : "NOT CONFIGURED"}</dd></div>
            <div><dt>Company Finished Stock</dt><dd>{num(data.finishedStock.available)} available (onHand {num(data.finishedStock.onHand)}, reserved {num(data.finishedStock.reserved)})</dd></div>
            <div><dt>Avg Yield</dt><dd>{data.avgYieldPct != null ? `${data.avgYieldPct}%` : "DATA REQUIRED"}</dd></div>
            <div><dt>Total Wastage</dt><dd>{num(data.totalWastage)}</dd></div>
            <div><dt>Dispatched Qty (all-time)</dt><dd>{num(data.totalDispatchedQty)}</dd></div>
            <div><dt>COGS Coverage</dt><dd>{data.cogsCoveragePct != null ? `${data.cogsCoveragePct}%` : "UNAVAILABLE"}</dd></div>
          </dl>
          {data.activeBom && (
            <div><h4>Material Requirement (per standard batch)</h4>
              <div className={styles.tableWrap}><table><thead><tr><th>Material</th><th>Qty</th><th>Unit</th></tr></thead><tbody>
                {data.activeBom.lines.map((l, i) => <tr key={i}><td>{l.materialId}</td><td>{num(l.requiredQuantity)}</td><td>{l.unit}</td></tr>)}
              </tbody></table></div>
            </div>
          )}
          <h4>Production History</h4>
          <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Date</th><th>Status</th><th>QC</th><th>Output</th><th>Yield</th></tr></thead><tbody>
            {data.productionHistory.length === 0 && <tr><td colSpan={6}>No production history yet.</td></tr>}
            {data.productionHistory.map((b) => <tr key={b.id}><td>{b.batchNumber}</td><td>{fmtDate(b.date)}</td><td>{b.status}</td><td>{b.qcStatus}</td><td>{b.actualOutputQuantity != null ? num(b.actualOutputQuantity) : "—"}</td><td>{b.yieldPct != null ? `${b.yieldPct}%` : "—"}</td></tr>)}
          </tbody></table></div>
          <h4>QC History</h4>
          <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Parameter</th><th>Result</th><th>Date</th></tr></thead><tbody>
            {data.qc.length === 0 && <tr><td colSpan={4}>No QC entries yet.</td></tr>}
            {data.qc.map((q) => <tr key={q.id}><td>{q.batchId ?? "—"}</td><td>{q.parameter}</td><td>{q.passFail === null ? "UNTESTED" : q.passFail ? "PASS" : "FAIL"}</td><td>{fmtDate(q.sampleDate)}</td></tr>)}
          </tbody></table></div>
          <h4>Cost Trend</h4>
          <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Date</th><th>Unit Cost</th><th>Confidence</th></tr></thead><tbody>
            {(costTrend ?? []).length === 0 && <tr><td colSpan={4}>No cost data yet.</td></tr>}
            {(costTrend ?? []).map((c) => <tr key={c.batchId}><td>{c.batchNumber}</td><td>{fmtDate(c.date)}</td><td>{c.cost?.unitCost != null ? num(c.cost.unitCost) : "UNAVAILABLE"}</td><td>{c.cost?.confidence ?? "UNAVAILABLE"}</td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}

// --- MATERIALS ---------------------------------------------------------------
function MaterialMasterSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Base unit</th><th>Certificate / COA</th></tr></thead>
          <tbody>{(data.materials ?? []).length === 0 && <tr><td colSpan={5}>No materials configured.</td></tr>}
            {(data.materials ?? []).map((m) => <tr key={m.id}><td>{m.code}</td><td>{m.name}</td><td>{m.type}</td><td>{m.baseUnit}</td><td><DocAttach entityType="SeeraManufacturingMaterial" entityId={m.id} /></td></tr>)}
          </tbody>
        </table>
      </div>
      <details><summary>+ ADD MATERIAL</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-material", { code: String(f.get("code")), name: String(f.get("name")), type: f.get("type"), baseUnit: f.get("baseUnit"), reorderLevel: f.get("reorderLevel") ? Number(f.get("reorderLevel")) : undefined, lotTracked: true }, "Material created."); }}>
          <label>Code<input name="code" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Type<select name="type" required><option value="RAW_MATERIAL">Raw Material</option><option value="PACKAGING_MATERIAL">Packaging Material</option><option value="SEMI_FINISHED">Semi-Finished</option><option value="CONSUMABLE">Consumable</option></select></label>
          <label>Base unit<select name="baseUnit" required><option value="KG">KG</option><option value="GRAM">GRAM</option><option value="LITRE">LITRE</option><option value="ML">ML</option><option value="PCS">PCS</option><option value="ROLL">ROLL</option><option value="BOX">BOX</option><option value="BAG">BAG</option><option value="CARTON">CARTON</option><option value="DRUM">DRUM</option><option value="CAN">CAN</option></select></label>
          <label>Reorder level<input name="reorderLevel" type="number" step="0.001" /></label>
          <button disabled={busy}>ADD MATERIAL</button>
        </form>
      </details>
    </div>
  );
}

function MaterialStockSection() {
  const [materialId, setMaterialId] = useState("");
  const { data: mat360, loading, err } = useReportOnDemand<{ material: { name: string; code: string }; position: { physical: number; reserved: number; qcHold: number; available: number }; lots: { lotNumber: string; expiryDate: string | null }[]; belowReorder: boolean }>("material-360", { materialId }, [materialId], !!materialId);
  return (
    <div>
      <label>Material ID<input value={materialId} onChange={(e) => setMaterialId(e.target.value)} placeholder="Paste a material ID (from Material Master)" /></label>
      {materialId && loading && <p>Loading…</p>}
      {materialId && err && <p role="status" data-ok="false">{err}</p>}
      {materialId && mat360 && (
        <div>
          <p><strong>{mat360.material.name}</strong> ({mat360.material.code}) {mat360.belowReorder && <strong>BELOW REORDER LEVEL</strong>}</p>
          <p>Physical {num(mat360.position.physical)} · Reserved {num(mat360.position.reserved)} · QC Hold {num(mat360.position.qcHold)} · Available {num(mat360.position.available)}</p>
          <h4>Lots</h4>
          <ul>{mat360.lots.map((l) => <li key={l.lotNumber}>{l.lotNumber} {l.expiryDate ? `— expires ${fmtDate(l.expiryDate)}` : ""}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function MaterialAlertsSection({ ctx, setGroup }: { ctx: Ctx; setGroup: (g: Group) => void }) {
  void setGroup;
  const { data } = ctx;
  return (
    <div>
      <h3>Low Stock</h3>
      <div className={styles.tableWrap}><table><thead><tr><th>Material</th><th>Available</th><th>Reorder level</th></tr></thead><tbody>
        {(data.lowStock ?? []).length === 0 && <tr><td colSpan={3}>None below reorder level.</td></tr>}
        {(data.lowStock ?? []).map((r) => <tr key={r.material.id}><td>{r.material.name}</td><td>{num(r.position.available)}</td><td>{num(r.material.reorderLevel)}</td></tr>)}
      </tbody></table></div>
      <h3>Expiry</h3>
      <div className={styles.tableWrap}><table><thead><tr><th>Lot</th><th>Expiry</th><th>Days remaining</th></tr></thead><tbody>
        {(data.nearExpiry ?? []).length === 0 && <tr><td colSpan={3}>None near expiry.</td></tr>}
        {(data.nearExpiry ?? []).map((l) => <tr key={l.id}><td>{l.lotNumber}</td><td>{fmtDate(l.expiryDate)}</td><td>{l.expired ? "EXPIRED" : l.daysRemaining}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

// --- QUALITY ---------------------------------------------------------------
function QcQueueSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Batch #</th><th>Date</th><th>QC status</th><th>Action</th><th>Document</th></tr></thead>
        <tbody>
          {(data.qc ?? []).length === 0 && <tr><td colSpan={5}>Nothing pending QC.</td></tr>}
          {(data.qc ?? []).map((b) => (
            <tr key={b.id}>
              <td>{b.batchNumber}</td><td>{fmtDate(b.date)}</td><td>{b.qcStatus}</td>
              <td>
                <button type="button" disabled={busy} onClick={() => run("record-batch-qc", { batchId: b.id, parameter: "General", observedValue: undefined }, "QC observation recorded.")}>RECORD RESULT</button>{" "}
                <button type="button" disabled={busy} onClick={() => run("hold-batch", { batchId: b.id, reason: "Held from QC queue" }, "Batch held — record a Deviation if this needs formal review.", () => ctx.jump("cost", "deviation"))}>HOLD</button>{" "}
                <button type="button" disabled={busy} onClick={() => run("fail-batch", { batchId: b.id, reason: "Failed from QC queue" }, "Batch failed — record a Deviation if this needs formal review.", () => ctx.jump("cost", "deviation"))}>FAIL</button>{" "}
                <button type="button" disabled={busy} onClick={() => run("release-batch", { batchId: b.id }, "Batch released — now available in Company inventory. View Company Stock on Batch 360.", () => ctx.jump("production", "batches", b.id))}>RELEASE</button>
              </td>
              <td><DocAttach entityType="SeeraBatchQc" entityId={b.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GrnQcSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>GRN</th><th>Material</th><th>Accepted qty</th><th>Action</th></tr></thead>
        <tbody>
          {(data.grnQc ?? []).length === 0 && <tr><td colSpan={4}>Nothing pending.</td></tr>}
          {(data.grnQc ?? []).map((l) => (
            <tr key={l.id}>
              <td>{l.grn?.grnNumber}</td><td>{l.materialId}</td><td>{num(l.acceptedQuantity)}</td>
              <td>
                <button type="button" disabled={busy} onClick={() => run("grn-qc-release", { grnLineId: l.id, decision: "PASSED" }, "Passed.")}>PASS</button>{" "}
                <button type="button" disabled={busy} onClick={() => run("grn-qc-release", { grnLineId: l.id, decision: "FAILED" }, "Failed.")}>FAIL</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- WAREHOUSE ---------------------------------------------------------------
function LocationsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}><table><thead><tr><th>Code</th><th>Name</th><th>Type</th></tr></thead><tbody>
        {(data.locations ?? []).length === 0 && <tr><td colSpan={3}>No locations configured.</td></tr>}
        {(data.locations ?? []).map((l) => <tr key={l.id}><td>{l.code}</td><td>{l.name}</td><td>{l.type}</td></tr>)}
      </tbody></table></div>
      <details><summary>+ ADD LOCATION</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-location", { code: String(f.get("code")), name: String(f.get("name")), type: f.get("type") }, "Location created."); }}>
          <label>Code<input name="code" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Type<select name="type" required><option value="RAW_STORE">Raw Store</option><option value="PACKAGING_STORE">Packaging Store</option><option value="PRODUCTION_FLOOR">Production Floor</option><option value="WIP_AREA">WIP Area</option><option value="QC_HOLD">QC Hold</option><option value="FINISHED_STORE">Finished Store</option><option value="REJECT_SCRAP">Reject/Scrap</option></select></label>
          <button disabled={busy}>ADD LOCATION</button>
        </form>
      </details>
    </div>
  );
}

function GrnSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}><table><thead><tr><th>GRN #</th><th>Date</th><th>Vendor</th><th>Status</th><th>Action</th><th>Document</th></tr></thead><tbody>
        {(data.grns ?? []).length === 0 && <tr><td colSpan={6}>No GRNs.</td></tr>}
        {(data.grns ?? []).map((g) => <tr key={g.id}><td>{g.grnNumber}</td><td>{fmtDate(g.date)}</td><td>{g.vendorId}</td><td>{g.status}</td><td>{g.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => run("post-grn", { grnId: g.id }, "GRN posted — accepted quantity is now in stock. View it in Material Stock.", () => ctx.jump("materials", "stock"))}>POST</button>}</td><td><DocAttach entityType="SeeraGrn" entityId={g.id} /></td></tr>)}
      </tbody></table></div>
      {(data.materials?.length ?? 0) > 0 && (data.locations?.length ?? 0) > 0 && (
        <details><summary>+ CREATE GRN</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = data.materials!.find((m) => m.id === f.get("materialId")); const qty = Number(f.get("quantity")); run("create-grn", { date: isoDate(new Date()), vendorId: String(f.get("vendorId")), idempotencyKey: key(), lines: [{ materialId: f.get("materialId"), quantity: qty, unit: material?.baseUnit ?? "KG", canonicalQuantity: qty, acceptedQuantity: qty, unitCost: f.get("unitCost") ? Number(f.get("unitCost")) : undefined, locationId: f.get("locationId") }] }, "GRN created as draft — POST it to bring stock in."); }}>
            <label>Vendor (ID/name)<input name="vendorId" required /></label>
            <label>Material<select name="materialId" required>{data.materials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label>Quantity received<input name="quantity" type="number" step="0.001" required /></label>
            <label>Unit cost (optional, enables real costing)<input name="unitCost" type="number" step="0.0001" /></label>
            <label>Location<select name="locationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <button disabled={busy}>CREATE GRN</button>
          </form>
        </details>
      )}
    </div>
  );
}

function TransfersSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  if ((data.locations?.length ?? 0) < 2 || (data.materials?.length ?? 0) === 0) return <p>Add at least two locations and one material first.</p>;
  return (
    <div>
      <details open><summary>TRANSFER STOCK</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = data.materials!.find((m) => m.id === f.get("materialId")); const qty = Number(f.get("quantity")); run("transfer-stock", { materialId: f.get("materialId"), quantity: qty, unit: material?.baseUnit ?? "KG", canonicalQuantity: qty, fromLocationId: f.get("fromLocationId"), toLocationId: f.get("toLocationId"), reason: String(f.get("reason")), idempotencyKey: key() }, "Transfer posted."); }}>
          <label>Material<select name="materialId" required>{data.materials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Quantity<input name="quantity" type="number" step="0.001" required /></label>
          <label>From<select name="fromLocationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>To<select name="toLocationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>Reason<input name="reason" required /></label>
          <button disabled={busy}>TRANSFER</button>
        </form>
      </details>
      <details><summary>ADJUST STOCK (exception only)</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = data.materials!.find((m) => m.id === f.get("materialId")); const qty = Number(f.get("quantity")); run("adjust-stock", { materialId: f.get("materialId"), direction: f.get("direction"), quantity: qty, unit: material?.baseUnit ?? "KG", canonicalQuantity: qty, locationId: f.get("locationId"), reason: String(f.get("reason")), idempotencyKey: key() }, "Adjustment posted."); }}>
          <label>Material<select name="materialId" required>{data.materials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Direction<select name="direction" required><option value="INCREASE">Increase</option><option value="DECREASE">Decrease</option></select></label>
          <label>Quantity<input name="quantity" type="number" step="0.001" required /></label>
          <label>Location<select name="locationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>Reason (mandatory)<input name="reason" required /></label>
          <button disabled={busy}>ADJUST</button>
        </form>
      </details>
    </div>
  );
}

function StockCountsSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}><table><thead><tr><th>Count #</th><th>Location</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {(data.stockCounts ?? []).length === 0 && <tr><td colSpan={4}>No stock counts.</td></tr>}
        {(data.stockCounts ?? []).map((c) => (
          <tr key={c.id}>
            <td>{c.countNumber}</td><td>{c.locationId}</td><td>{c.status}</td>
            <td>{(c.status === "DRAFT" || c.status === "REVIEWED") && <button type="button" disabled={busy} onClick={() => run("approve-stock-count", { countId: c.id }, "Stock count approved — variances posted as governed adjustments.")}>APPROVE (POST VARIANCE)</button>}</td>
          </tr>
        ))}
      </tbody></table></div>
      {(data.locations?.length ?? 0) > 0 && (data.materials?.length ?? 0) > 0 && (
        <details><summary>+ START STOCK COUNT</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const materialIds = Array.from(f.getAll("materialIds")).map(String); run("start-stock-count", { locationId: f.get("locationId"), date: isoDate(new Date()), idempotencyKey: key(), materialIds }, "Stock count started — system quantities snapshotted."); }}>
            <label>Location<select name="locationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>Materials to count<select name="materialIds" multiple required>{data.materials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <button disabled={busy}>START COUNT</button>
          </form>
        </details>
      )}
    </div>
  );
}

// --- COST & CONTROL ---------------------------------------------------------------
function BatchCostSection({ ctx }: { ctx: Ctx }) {
  const { run, busy } = ctx;
  const [batchId, setBatchId] = useState("");
  return (
    <div>
      <label>Batch ID<input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Paste a batch ID" /></label>
      <div className={styles.inlineActions}>
        <button type="button" disabled={busy || !batchId} onClick={() => run("compute-batch-cost", { batchId }, "Batch cost computed — see Batch Traceability for the figure.", () => ctx.jump("production", "batches", batchId))}>COMPUTE COST</button>
        <button type="button" disabled={busy || !batchId} onClick={() => run("post-cogs-for-batch", { batchId }, "Production value transfer posted to Finance (raw material/packaging → WIP/Finished Goods).")}>POST TO FINANCE</button>
        <button type="button" onClick={() => ctx.jump("reports", "costing")}>VIEW COST GAP (Cost Exceptions) →</button>
      </div>
      <p>Cost is only RELIABLE when every consumed material has a captured GRN receipt cost — otherwise PARTIAL/UNAVAILABLE, never fabricated.</p>
    </div>
  );
}

function WastageSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}><table><thead><tr><th>Type</th><th>Total</th></tr></thead><tbody>
        {(data.wastage?.byType.length ?? 0) === 0 && <tr><td colSpan={2}>No wastage in the last 30 days.</td></tr>}
        {data.wastage?.byType.map((w) => <tr key={w.wastageType}><td>{w.wastageType}</td><td>{num(w.total)}</td></tr>)}
      </tbody></table></div>
      {(data.materials?.length ?? 0) > 0 && (
        <details><summary>+ RECORD WASTAGE</summary>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = data.materials!.find((m) => m.id === f.get("materialId")); run("record-wastage", { materialId: f.get("materialId"), wastageType: f.get("wastageType"), wasteQuantity: Number(f.get("wasteQuantity")), unit: material?.baseUnit ?? "KG", reason: String(f.get("reason")), idempotencyKey: key() }, "Wastage recorded."); }}>
            <label>Material<select name="materialId" required>{data.materials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label>Type<select name="wastageType" required><option value="PROCESS_LOSS">Process Loss</option><option value="RAW_MATERIAL_WASTAGE">Raw Material Wastage</option><option value="PACKAGING_WASTAGE">Packaging Wastage</option><option value="SPILLAGE">Spillage</option><option value="DAMAGED_PACK">Damaged Pack</option><option value="SCRAP">Scrap</option><option value="OTHER">Other</option></select></label>
            <label>Waste quantity<input name="wasteQuantity" type="number" step="0.001" required /></label>
            <label>Reason<input name="reason" required /></label>
            <button disabled={busy}>RECORD WASTAGE</button>
          </form>
        </details>
      )}
    </div>
  );
}

function DeviationSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <div>
      <div className={styles.tableWrap}><table><thead><tr><th>Type</th><th>Description</th><th>Status</th><th>Action</th><th>Document</th></tr></thead><tbody>
        {(data.deviations ?? []).length === 0 && <tr><td colSpan={5}>No open deviations.</td></tr>}
        {(data.deviations ?? []).map((d) => (
          <tr key={d.id}>
            <td>{d.deviationType}</td><td>{d.description}</td><td>{d.status}</td>
            <td>
              {d.status === "OPEN" && <button type="button" disabled={busy} onClick={() => run("review-deviation", { deviationId: d.id }, "Reviewed.")}>REVIEW</button>}
              {d.status !== "CLOSED" && <button type="button" disabled={busy} onClick={() => run("close-deviation", { deviationId: d.id, reason: "Closed from workspace" }, "Closed.")}>CLOSE</button>}
            </td>
            <td><DocAttach entityType="SeeraDeviationRecord" entityId={d.id} /></td>
          </tr>
        ))}
      </tbody></table></div>
      <details><summary>+ RECORD DEVIATION</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-deviation", { deviationType: f.get("deviationType"), description: String(f.get("description")), idempotencyKey: key() }, "Deviation recorded."); }}>
          <label>Type<select name="deviationType" required><option value="MATERIAL">Material</option><option value="PROCESS">Process</option><option value="OUTPUT">Output</option><option value="PACKAGING">Packaging</option><option value="QC">QC</option><option value="OTHER">Other</option></select></label>
          <label>Description<input name="description" required /></label>
          <button disabled={busy}>RECORD DEVIATION</button>
        </form>
      </details>
    </div>
  );
}

// --- MASTERS ---------------------------------------------------------------
type MachineRow = { id: string; code: string; name: string; type: string | null; capacity: string | null; isActive: boolean };
function MachinesSection({ ctx }: { ctx: Ctx }) {
  const { busy, run } = ctx;
  const { data: machines, reload } = useReportOnDemand<MachineRow[]>("machines", {}, []);
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Capacity</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {(machines ?? []).length === 0 && <tr><td colSpan={6}>No machines configured.</td></tr>}
            {machines?.map((m) => (
              <tr key={m.id}>
                <td>{m.code}</td><td>{m.name}</td><td>{m.type ?? "—"}</td><td>{m.capacity ?? "—"}</td><td>{m.isActive ? "ACTIVE" : "INACTIVE"}</td>
                <td><button type="button" disabled={busy} onClick={() => run("update-machine", { machineId: m.id, isActive: !m.isActive }, m.isActive ? "Machine deactivated." : "Machine activated.", reload)}>{m.isActive ? "DEACTIVATE" : "ACTIVATE"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details><summary>+ CREATE MACHINE</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-machine", { code: f.get("code"), name: f.get("name"), type: f.get("type") || undefined, capacity: f.get("capacity") || undefined, notes: f.get("notes") || undefined }, "Machine created.", () => { (e.currentTarget as HTMLFormElement).reset(); reload(); }); }}>
          <label>Code<input name="code" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Type<input name="type" placeholder="e.g. Mixer, Filler" /></label>
          <label>Capacity (optional)<input name="capacity" /></label>
          <label>Notes<input name="notes" /></label>
          <button disabled={busy}>CREATE MACHINE</button>
        </form>
      </details>
      <button type="button" disabled={busy} onClick={reload}>REFRESH</button>
    </div>
  );
}
// Founder/Admin-only governed switch (spec §10/§11). data.companyInventoryMode
// is null (section hidden entirely — see GROUP_SECTIONS render guard below)
// unless the aggregator's settings:manage-gated fetch succeeded, so this
// component only ever mounts for a role that can also change it.
function CompanyInventoryModeSection({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const mode = data.companyInventoryMode;
  if (mode == null) return <p>Company Stock Mode is Founder/Admin-only and is not visible for your role.</p>;
  const coverage = data.cogsCoverage;
  const target = mode === "LEGACY_UNBOUNDED" ? "MANUFACTURING_GOVERNED" : "LEGACY_UNBOUNDED";
  return (
    <div>
      <p>
        Current mode: <strong>{mode}</strong> —{" "}
        {mode === "LEGACY_UNBOUNDED"
          ? "Company is treated as an infinite-supply root (Sales V1 default behavior, unchanged)."
          : "Company→S.S. dispatch is stock-checked and posts real OUT movements + COGS against governed Manufacturing finished-goods."}
      </p>
      {coverage && (
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          <div><dt>COGS coverage (30d)</dt><dd>{coverage.coveragePct}%</dd></div>
          <div><dt>Dispatched units (30d)</dt><dd>{num(coverage.total)}</dd></div>
          <div><dt>Cost exceptions</dt><dd>{coverage.exceptions}</dd></div>
        </dl>
      )}
      <details>
        <summary>SWITCH TO {target}</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("set-company-inventory-mode", { mode: target, reason: String(f.get("reason")) }, `Company Stock Mode set to ${target}.`); }}>
          <p data-ok="false" className={styles.notice}>
            {target === "MANUFACTURING_GOVERNED"
              ? "This makes Company stock finite — dispatch will require sufficient governed Company stock and will be blocked otherwise. Only enable once Manufacturing finished-goods release is actively feeding Company stock."
              : "This reverts to unlimited Company stock — governed stock/COGS checks stop applying to new dispatches."}
          </p>
          <label>Reason for change<input name="reason" required minLength={5} /></label>
          <button disabled={busy}>CONFIRM — SWITCH TO {target}</button>
        </form>
      </details>
    </div>
  );
}
type ShiftRow = { id: string; name: string; startTime: string; endTime: string; isActive: boolean };
function ShiftsSection({ ctx }: { ctx: Ctx }) {
  const { busy, run } = ctx;
  const { data: shifts, reload } = useReportOnDemand<ShiftRow[]>("shifts", {}, []);
  return (
    <div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {(shifts ?? []).length === 0 && <tr><td colSpan={5}>No shifts configured.</td></tr>}
            {shifts?.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{s.startTime}</td><td>{s.endTime}</td><td>{s.isActive ? "ACTIVE" : "INACTIVE"}</td>
                <td><button type="button" disabled={busy} onClick={() => run("update-shift", { shiftId: s.id, isActive: !s.isActive }, s.isActive ? "Shift deactivated." : "Shift activated.", reload)}>{s.isActive ? "DEACTIVATE" : "ACTIVATE"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details><summary>+ CREATE SHIFT</summary>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("create-shift", { name: f.get("name"), startTime: f.get("startTime"), endTime: f.get("endTime") }, "Shift created.", () => { (e.currentTarget as HTMLFormElement).reset(); reload(); }); }}>
          <label>Shift name<input name="name" required /></label>
          <label>Start time<input name="startTime" type="time" required /></label>
          <label>End time<input name="endTime" type="time" required /></label>
          <button disabled={busy}>CREATE SHIFT</button>
        </form>
      </details>
      <button type="button" disabled={busy} onClick={reload}>REFRESH</button>
    </div>
  );
}

// --- GLOBAL SEARCH -----------------------------------------------------------
// Closure spec §9/E: search by human-readable batch/order numbers, material/
// SKU codes, lot numbers, GRN numbers, vendor names, BOM/SOP version, QC
// parameter, deviation text, document name — every group deep-links into the
// existing section that already has the matching detail view, rather than
// building 12 new detail screens.
function SearchSection({ ctx, setGroup, setSection }: { ctx: Ctx; setGroup: (g: Group) => void; setSection: (s: string) => void }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const { data, loading, err } = useReportOnDemand<ManufacturingSearchResult>("search", { q }, [q]);
  const jump = (g: Group, s: string, focusId?: string) => { if (focusId) ctx.setFocusId(focusId); setGroup(g); setSection(s); };
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setQ(input); }}>
        <label>Search Manufacturing (batch/order number, material/SKU code or name, lot, GRN, vendor, BOM/SOP version, QC parameter, deviation, document)<input value={input} onChange={(ev) => setInput(ev.target.value)} placeholder="e.g. BATCH-2026-001, RM-0012, LOT-..." /></label>
        <button disabled={loading}>SEARCH</button>
      </form>
      {err && <p role="status" data-ok="false">{err}</p>}
      {data && data.query.length < 2 && <p>Type at least 2 characters and press Search.</p>}
      {data && data.query.length >= 2 && (
        <div>
          {data.batches.length > 0 && <div><h4>Batches</h4><ul>{data.batches.map((b) => <li key={b.id}><button type="button" onClick={() => jump("production", "batches", b.id)}>{b.batchNumber} — {b.status} / QC {b.qcStatus} →</button></li>)}</ul></div>}
          {data.productionOrders.length > 0 && <div><h4>Production Orders</h4><ul>{data.productionOrders.map((o) => <li key={o.id}><button type="button" onClick={() => jump("production", "orders")}>{o.orderNumber} — {o.status} →</button></li>)}</ul></div>}
          {data.materials.length > 0 && <div><h4>Materials</h4><ul>{data.materials.map((m) => <li key={m.id}><button type="button" onClick={() => jump("materials", "master")}>{m.code} — {m.name} ({m.type}) →</button></li>)}</ul></div>}
          {data.lots.length > 0 && <div><h4>Lots</h4><ul>{data.lots.map((l) => <li key={l.id}>{l.lotNumber}{l.supplierLotRef ? ` (supplier ref ${l.supplierLotRef})` : ""} <button type="button" onClick={() => jump("materials", "master")}>view material →</button></li>)}</ul></div>}
          {data.skus.length > 0 && <div><h4>Finished SKUs</h4><ul>{data.skus.map((s) => <li key={s.id}><button type="button" onClick={() => jump("formulations", "bom")}>{s.code} — {s.productName} →</button></li>)}</ul></div>}
          {data.grns.length > 0 && <div><h4>GRNs</h4><ul>{data.grns.map((g) => <li key={g.id}><button type="button" onClick={() => jump("warehouse", "grn")}>{g.grnNumber} — {g.status} →</button></li>)}</ul></div>}
          {data.vendors.length > 0 && <div><h4>Vendors</h4><ul>{data.vendors.map((v) => <li key={v.id}><button type="button" onClick={() => jump("warehouse", "grn")}>{v.code} — {v.legalName} →</button></li>)}</ul></div>}
          {data.boms.length > 0 && <div><h4>BOM Versions</h4><ul>{data.boms.map((b) => <li key={b.id}><button type="button" onClick={() => jump("formulations", "bom")}>{b.productName} — v{b.version} ({b.status}) →</button></li>)}</ul></div>}
          {data.sops.length > 0 && <div><h4>SOP Versions</h4><ul>{data.sops.map((s) => <li key={s.id}><button type="button" onClick={() => jump("formulations", "sop")}>{s.productName} — v{s.version} ({s.status}) →</button></li>)}</ul></div>}
          {data.qc.length > 0 && <div><h4>QC Entries</h4><ul>{data.qc.map((q2) => <li key={q2.id}><button type="button" onClick={() => jump("production", "batches", q2.batchId)}>{q2.parameter} — {q2.passFail === null ? "untested" : q2.passFail ? "PASS" : "FAIL"} →</button></li>)}</ul></div>}
          {data.deviations.length > 0 && <div><h4>Deviations</h4><ul>{data.deviations.map((d) => <li key={d.id}><button type="button" onClick={() => jump("cost", "deviation")}>{d.deviationType} — {d.description.slice(0, 60)} ({d.status}) →</button></li>)}</ul></div>}
          {data.documents.length > 0 && <div><h4>Documents</h4><ul>{data.documents.map((f) => <li key={f.id}><a href={`/api/manufacturing/documents/${f.id}/download`} target="_blank" rel="noreferrer">{f.originalName}</a> ({f.entityType})</li>)}</ul></div>}
          {[data.batches, data.productionOrders, data.materials, data.lots, data.skus, data.grns, data.vendors, data.boms, data.sops, data.qc, data.deviations, data.documents].every((g) => g.length === 0) && <p>No matches for "{data.query}".</p>}
        </div>
      )}
    </div>
  );
}

// --- REPORTS CENTER -----------------------------------------------------------
function GenericReportTable({ title, report, params, deps, csvName }: { title: string; report: string; params: Record<string, string>; deps: unknown[]; csvName: string }) {
  const { data, loading, err, reload } = useReportOnDemand<Record<string, unknown>[]>(report, params, deps);
  const rows = Array.isArray(data) ? data : [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const cell = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div>
      <h4>{title}</h4>
      {loading && <p>Loading…</p>}
      {err && <p role="status" data-ok="false">{err}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && !loading && <tr><td colSpan={headers.length || 1}>No records for this filter.</td></tr>}
            {rows.map((r, i) => <tr key={i}>{headers.map((h) => <td key={h}>{cell(r[h])}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <div className={styles.inlineActions}>
        <button type="button" onClick={reload}>REFRESH</button>
        <button type="button" disabled={!rows.length} onClick={() => exportCsv(csvName, rows)}>EXPORT CSV</button>
      </div>
    </div>
  );
}

// Full Manufacturing Reports Center (closure spec §4/F): every group backed
// by a real reports-center-service.ts query (or an existing, previously
// internal-only function now exposed as a report) — no static/fake data, no
// export button without a real underlying query behind it.
function ReportsCenterSection({ ctx, section }: { ctx: Ctx; section: string }) {
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [productSkuId, setProductSkuId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const deps = [from, to, productSkuId, materialId, section];
  const params = { from: new Date(from).toISOString(), to: new Date(new Date(to).getTime() + 86_399_999).toISOString(), ...(productSkuId ? { productSkuId } : {}), ...(materialId ? { materialId } : {}) };

  const filters = (
    <div className={styles.inlineActions}>
      <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      {(section === "production" || section === "material" || section === "efficiency" || section === "costing") && <label>Product SKU ID (optional) <input value={productSkuId} onChange={(e) => setProductSkuId(e.target.value)} placeholder="paste SKU id" /></label>}
      {section === "material" && <label>Material ID (optional) <input value={materialId} onChange={(e) => setMaterialId(e.target.value)} placeholder="paste material id" /></label>}
    </div>
  );

  // key={section} forces a clean unmount/remount of the whole subtree on tab
  // switch — without it, React reconciles same-position GenericReportTable
  // instances across tabs (same component type, different props), and a
  // useEffect deps array whose LENGTH differs between two of those instances
  // throws "size changed between renders" (a real bug this closure pass's
  // browser UAT caught).
  if (section === "production") return (
    <div key={section}>{filters}
      <GenericReportTable title="Daily Production" report="daily-production" params={params} deps={deps} csvName="daily-production" />
      <GenericReportTable title="Product-wise Production" report="product-wise-production" params={params} deps={deps} csvName="product-wise-production" />
      <GenericReportTable title="Production Order Register" report="production-order-register" params={params} deps={deps} csvName="production-order-register" />
      <GenericReportTable title="Batch Register" report="batch-register" params={params} deps={deps} csvName="batch-register" />
      <GenericReportTable title="Shift-wise Output" report="shift-wise-output" params={params} deps={deps} csvName="shift-wise-output" />
      <PlanVsActualReport ctx={ctx} />
      <a href={`/api/manufacturing/reports/pdf?report=production-summary&from=${params.from}&to=${params.to}`} target="_blank" rel="noreferrer"><button type="button">EXPORT PRODUCTION SUMMARY PDF</button></a>
    </div>
  );
  if (section === "material") return (
    <div key={section}>{filters}
      <GenericReportTable title="Current Stock (Physical / Available / Reserved)" report="material-stock-report" params={{ type: "RAW_MATERIAL" }} deps={["RAW_MATERIAL"]} csvName="material-stock" />
      <GenericReportTable title="Material Consumption" report="material-consumption" params={{ ...params, type: "RAW_MATERIAL" }} deps={[...deps, "RAW_MATERIAL"]} csvName="material-consumption" />
      <GenericReportTable title="Reorder (below reorder level)" report="reorder-report" params={{}} deps={[]} csvName="reorder" />
      <GenericReportTable title="Near Expiry / Expired" report="near-expiry-report" params={{ withinDays: "30" }} deps={[]} csvName="near-expiry" />
    </div>
  );
  if (section === "packaging") return (
    <div key={section}>{filters}
      <GenericReportTable title="Packaging Stock" report="material-stock-report" params={{ type: "PACKAGING_MATERIAL" }} deps={["PACKAGING_MATERIAL"]} csvName="packaging-stock" />
      <GenericReportTable title="Packaging Consumption" report="material-consumption" params={{ ...params, type: "PACKAGING_MATERIAL" }} deps={[...deps, "PACKAGING_MATERIAL"]} csvName="packaging-consumption" />
      <GenericReportTable title="Packaging Variance (theoretical vs actual)" report="packaging-variance" params={params} deps={deps} csvName="packaging-variance" />
    </div>
  );
  if (section === "quality") return (
    <div key={section}>{filters}
      <GenericReportTable title="QC Pending / On Hold" report="qc-queue" params={{}} deps={[]} csvName="qc-pending" />
      <QcPassFailReport ctx={ctx} params={params} deps={deps} />
      <GenericReportTable title="Batch Quality History" report="batch-quality-history" params={params} deps={deps} csvName="batch-quality-history" />
      <a href={`/api/manufacturing/reports/pdf?report=qc-summary&from=${params.from}&to=${params.to}`} target="_blank" rel="noreferrer"><button type="button">EXPORT QC SUMMARY PDF</button></a>
    </div>
  );
  if (section === "efficiency") return (
    <div key={section}>{filters}
      <GenericReportTable title="Yield" report="yield-report" params={params} deps={deps} csvName="yield" />
      <GenericReportTable title="Raw Material Variance" report="raw-material-variance" params={params} deps={deps} csvName="raw-material-variance" />
      <GenericReportTable title="Packaging Variance" report="packaging-variance" params={params} deps={deps} csvName="packaging-variance-eff" />
      <GenericReportTable title="Wastage" report="wastage-report" params={params} deps={deps} csvName="wastage" />
      <GenericReportTable title="Output Variance (Planned vs Actual)" report="output-variance" params={params} deps={deps} csvName="output-variance" />
    </div>
  );
  if (section === "costing") return (
    <div key={section}>{filters}
      <GenericReportTable title="Batch Cost" report="batch-cost-report" params={params} deps={deps} csvName="batch-cost" />
      <GenericReportTable title="Product Cost" report="product-cost-report" params={params} deps={deps} csvName="product-cost" />
      <CostConfidenceReport ctx={ctx} params={params} deps={deps} />
      <GenericReportTable title="Cost Exceptions (PARTIAL / UNAVAILABLE)" report="cost-exceptions" params={{}} deps={[]} csvName="cost-exceptions" />
      <CogsCoverageReport ctx={ctx} params={params} deps={deps} />
    </div>
  );
  if (section === "traceability") return <TraceabilitySection key={section} />;
  return null;
}

function PlanVsActualReport({ ctx }: { ctx: Ctx }) {
  const { busy } = ctx;
  const [planId, setPlanId] = useState("");
  const { data, err } = useReportOnDemand<{ plan: { planNumber: string; period: string; status: string }; lines: { productSkuId: string; targetQuantity: number; targetBatches: number; actualQuantity: number; actualBatches: number; variance: number }[] }>("plan-vs-actual", { planId }, [planId], !!planId);
  return (
    <div>
      <h4>Plan vs Actual</h4>
      <label>Production Plan ID<input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="paste plan id" disabled={busy} /></label>
      {err && planId && <p role="status" data-ok="false">{err}</p>}
      {data && (
        <div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>Target Qty</th><th>Target Batches</th><th>Actual Qty</th><th>Actual Batches</th><th>Variance</th></tr></thead><tbody>
          {data.lines.map((l, i) => <tr key={i}><td>{l.productSkuId}</td><td>{num(l.targetQuantity)}</td><td>{l.targetBatches}</td><td>{num(l.actualQuantity)}</td><td>{l.actualBatches}</td><td>{num(l.variance)}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

function QcPassFailReport({ params, deps }: { ctx: Ctx; params: Record<string, string>; deps: unknown[] }) {
  const { data } = useReportOnDemand<{ total: number; passed: number; failed: number; untested: number; rows: { id: string; batchId: string | null; parameter: string; observedValue: number | null; passFail: boolean | null; sampleDate: string }[] }>("qc-pass-fail", params, deps);
  return (
    <div>
      <h4>QC Pass / Fail</h4>
      {data && <p>Total {data.total} — Passed {data.passed} — Failed {data.failed} — Untested {data.untested}</p>}
      <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Parameter</th><th>Observed</th><th>Result</th><th>Date</th></tr></thead><tbody>
        {(data?.rows ?? []).map((r) => <tr key={r.id}><td>{r.batchId ?? "—"}</td><td>{r.parameter}</td><td>{r.observedValue != null ? num(r.observedValue) : "—"}</td><td>{r.passFail === null ? "UNTESTED" : r.passFail ? "PASS" : "FAIL"}</td><td>{fmtDate(r.sampleDate)}</td></tr>)}
      </tbody></table></div>
      <button type="button" disabled={!data?.rows.length} onClick={() => exportCsv("qc-pass-fail", (data?.rows ?? []) as unknown as Record<string, unknown>[])}>EXPORT CSV</button>
    </div>
  );
}

function CostConfidenceReport({ params, deps }: { ctx: Ctx; params: Record<string, string>; deps: unknown[] }) {
  const { data } = useReportOnDemand<{ total: number; reliable: number; partial: number; unavailable: number }>("cost-confidence", params, deps);
  return (
    <div>
      <h4>Cost Confidence</h4>
      {data && <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <div><dt>Total batches costed</dt><dd>{data.total}</dd></div>
        <div><dt>RELIABLE</dt><dd>{data.reliable}</dd></div>
        <div><dt>PARTIAL</dt><dd>{data.partial}</dd></div>
        <div><dt>UNAVAILABLE</dt><dd>{data.unavailable}</dd></div>
      </dl>}
    </div>
  );
}

function CogsCoverageReport({ params, deps }: { ctx: Ctx; params: Record<string, string>; deps: unknown[] }) {
  const { data } = useReportOnDemand<{ total: number; reliable: number; coveragePct: number; exceptions: number }>("cogs-coverage", params, deps);
  return (
    <div>
      <h4>COGS Coverage</h4>
      {data && <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <div><dt>Dispatched units</dt><dd>{num(data.total)}</dd></div>
        <div><dt>Cost-reliable units</dt><dd>{num(data.reliable)}</dd></div>
        <div><dt>Coverage</dt><dd>{data.coveragePct}%</dd></div>
        <div><dt>Exceptions</dt><dd>{data.exceptions}</dd></div>
      </dl>}
    </div>
  );
}

function TraceabilitySection() {
  const [lotId, setLotId] = useState("");
  const { data: lotTrace } = useReportOnDemand<{ batchId: string; batchNumber: string; productSkuId: string; date: string; status: string; qcStatus: string; consumedFromLot: number }[]>("raw-lot-to-finished-batches", { lotId }, [lotId], !!lotId);
  return (
    <div>
      <p>Finished Batch → Raw Lots and Finished Batch → Company Dispatch → S.S. are both available on the Batch 360 view (Production → Batch Traceability) by pasting a Batch ID — paste one from Search or the QC/Production Order tabs.</p>
      <h4>Raw Lot → Finished Batches</h4>
      <label>Lot ID<input value={lotId} onChange={(e) => setLotId(e.target.value)} placeholder="paste a raw material lot id" /></label>
      <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Product</th><th>Date</th><th>Status</th><th>QC</th><th>Consumed from this lot</th></tr></thead><tbody>
        {(lotTrace ?? []).length === 0 && <tr><td colSpan={6}>No finished batches trace to this lot yet.</td></tr>}
        {(lotTrace ?? []).map((b) => <tr key={b.batchId}><td>{b.batchNumber}</td><td>{b.productSkuId}</td><td>{fmtDate(b.date)}</td><td>{b.status}</td><td>{b.qcStatus}</td><td>{num(b.consumedFromLot)}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

// =============================================================================
// DEDICATED SIMPLIFIED WORKSPACES (closure spec §5/6/7) — Operator/Store/QC
// each get a genuinely narrow, single-purpose shell instead of the full nav.
// All reuse the same governed actions/permissions as the full workspace; the
// only thing that changes is what's rendered, never what's authorized.
// =============================================================================

// --- OPERATOR ----------------------------------------------------------------
function OperatorWorkspace({ ctx, message }: { ctx: Ctx; message: { ok: boolean; text: string } | null }) {
  const { data } = ctx;
  const [tab, setTab] = useState<"today" | "progress" | "complete" | "material" | "exception">("today");
  const [activeOrderId, setActiveOrderId] = useState("");
  const readyOrders = (data.orders ?? []).filter((o) => o.status === "READY");
  const inProgressOrders = (data.orders ?? []).filter((o) => o.status === "IN_PROGRESS");
  const goComplete = (orderId: string) => { setActiveOrderId(orderId); setTab("complete"); };
  return (
    <section className={styles.panel}>
      <div><small>MANUFACTURING — OPERATOR</small><h2>Production Floor</h2></div>
      <div className={styles.inlineActions} role="tablist" aria-label="Operator workspace">
        <button type="button" onClick={() => setTab("today")} aria-pressed={tab === "today"} style={{ fontWeight: tab === "today" ? 700 : 400 }}>TODAY'S JOBS</button>
        <button type="button" onClick={() => setTab("progress")} aria-pressed={tab === "progress"} style={{ fontWeight: tab === "progress" ? 700 : 400 }}>IN PROGRESS</button>
        <button type="button" onClick={() => setTab("complete")} aria-pressed={tab === "complete"} style={{ fontWeight: tab === "complete" ? 700 : 400 }}>COMPLETE BATCH</button>
        <button type="button" onClick={() => setTab("material")} aria-pressed={tab === "material"} style={{ fontWeight: tab === "material" ? 700 : 400 }}>MATERIAL CONFIRMATION</button>
        <button type="button" onClick={() => setTab("exception")} aria-pressed={tab === "exception"} style={{ fontWeight: tab === "exception" ? 700 : 400 }}>EXCEPTION</button>
      </div>
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      {tab === "today" && (
        <div>
          {readyOrders.length === 0 && <p>No jobs ready to start right now — check back or ask your Supervisor to reserve materials for an order.</p>}
          <div className={styles.tableWrap}><table><thead><tr><th>Order #</th><th>Planned Batches</th><th>Date</th><th>Action</th></tr></thead><tbody>
            {readyOrders.map((o) => <tr key={o.id}><td>{o.orderNumber}</td><td>{o.plannedBatches}</td><td>{fmtDate(o.productionDate)}</td><td><button type="button" onClick={() => goComplete(o.id)}>START →</button></td></tr>)}
          </tbody></table></div>
        </div>
      )}
      {tab === "progress" && (
        <div>
          {inProgressOrders.length === 0 && <p>Nothing in progress.</p>}
          <div className={styles.tableWrap}><table><thead><tr><th>Order #</th><th>Planned Batches</th><th>Date</th><th>Action</th></tr></thead><tbody>
            {inProgressOrders.map((o) => <tr key={o.id}><td>{o.orderNumber}</td><td>{o.plannedBatches}</td><td>{fmtDate(o.productionDate)}</td><td><button type="button" onClick={() => goComplete(o.id)}>CONTINUE →</button></td></tr>)}
          </tbody></table></div>
        </div>
      )}
      {tab === "complete" && <OperatorCompleteBatchForm ctx={ctx} orders={[...readyOrders, ...inProgressOrders]} initialOrderId={activeOrderId} />}
      {tab === "material" && <OperatorMaterialConfirmationForm ctx={ctx} />}
      {tab === "exception" && <OperatorExceptionForm ctx={ctx} />}
    </section>
  );
}

// One SAVE PROGRESS / COMPLETE action — the backend's recordDailyProduction
// already is the single atomic "record what happened" step; there is no
// separate lightweight start/pause state machine underneath to build a
// second UI stage on top of, so START (from Today's Jobs) and COMPLETE both
// land here, honestly reflecting how the system actually works today.
function OperatorCompleteBatchForm({ ctx, orders, initialOrderId }: { ctx: Ctx; orders: { id: string; orderNumber: string }[]; initialOrderId: string }) {
  const { data, run, busy } = ctx;
  const rawLocations = (data.locations ?? []).filter((l) => l.type === "RAW_STORE");
  const packLocations = (data.locations ?? []).filter((l) => l.type === "PACKAGING_STORE");
  const fgLocations = (data.locations ?? []).filter((l) => l.type === "FINISHED_STORE");
  if (orders.length === 0) return <p>No job selected yet — go to Today's Jobs and press START.</p>;
  if (!rawLocations.length || !packLocations.length || !fgLocations.length) return <p>Stores are not configured yet — ask your Manufacturing Manager to set up locations.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("record-daily-production", { productionOrderId: f.get("productionOrderId"), date: isoDate(new Date()), batchCount: Number(f.get("batchCount")), actualOutputQuantity: Number(f.get("actualOutputQuantity")), outputUnit: f.get("outputUnit"), finishedGoodsLocationId: f.get("finishedGoodsLocationId"), rawStoreLocationId: f.get("rawStoreLocationId"), packagingStoreLocationId: f.get("packagingStoreLocationId"), idempotencyKey: key() }, "Batch completed — sent to QC.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Job<select name="productionOrderId" required defaultValue={initialOrderId || undefined}>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select></label>
      <label>Batches completed<input name="batchCount" type="number" min="1" required /></label>
      <label>Actual output quantity<input name="actualOutputQuantity" type="number" step="0.001" required /></label>
      <label>Output unit<select name="outputUnit" required><option value="KG">KG</option><option value="PCS">PCS</option><option value="LITRE">LITRE</option></select></label>
      <label>Raw store<select name="rawStoreLocationId" required>{rawLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Packaging store<select name="packagingStoreLocationId" required>{packLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Finished goods store<select name="finishedGoodsLocationId" required>{fgLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <button disabled={busy}>SAVE PROGRESS / COMPLETE BATCH</button>
    </form>
  );
}

function OperatorMaterialConfirmationForm({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("record-actual-consumption", { batchId: f.get("batchId"), materialId: f.get("materialId"), actualQuantity: Number(f.get("actualQuantity")), reason: String(f.get("reason")), idempotencyKey: key() }, "Material confirmation recorded.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Batch ID<input name="batchId" required placeholder="paste batch id" /></label>
      <label>Material<select name="materialId" required>{(data.materials ?? []).map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></label>
      <label>Actual quantity used<input name="actualQuantity" type="number" step="0.0001" required /></label>
      <label>Reason<input name="reason" required /></label>
      <button disabled={busy}>CONFIRM MATERIAL USAGE</button>
    </form>
  );
}

function OperatorExceptionForm({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = (data.materials ?? []).find((m) => m.id === f.get("materialId")); run("record-wastage", { batchId: f.get("batchId") || undefined, materialId: f.get("materialId") || undefined, wastageType: f.get("wastageType"), wasteQuantity: Number(f.get("wasteQuantity")), unit: material?.baseUnit ?? "KG", reason: String(f.get("reason")), idempotencyKey: key() }, "Exception reported.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Batch ID (optional)<input name="batchId" placeholder="paste batch id if known" /></label>
      <label>Material (optional)<select name="materialId"><option value="">— none —</option>{(data.materials ?? []).map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></label>
      <label>Type<select name="wastageType" required><option value="SPILLAGE">Spillage</option><option value="PROCESS_LOSS">Process Loss</option><option value="DAMAGED_PACK">Damaged Pack</option><option value="OTHER">Other</option></select></label>
      <label>Quantity<input name="wasteQuantity" type="number" step="0.001" required /></label>
      <label>What happened<input name="reason" required /></label>
      <button disabled={busy}>REPORT EXCEPTION</button>
    </form>
  );
}

// --- STORE ---------------------------------------------------------------
function StoreWorkspace({ ctx, message }: { ctx: Ctx; message: { ok: boolean; text: string } | null }) {
  const [tab, setTab] = useState<"receive" | "issue" | "return" | "transfer" | "stock" | "lots" | "count">("receive");
  return (
    <section className={styles.panel}>
      <div><small>MANUFACTURING — STORE</small><h2>Store Executive Workspace</h2></div>
      <div className={styles.inlineActions} role="tablist" aria-label="Store workspace">
        <button type="button" onClick={() => setTab("receive")} aria-pressed={tab === "receive"} style={{ fontWeight: tab === "receive" ? 700 : 400 }}>RECEIVE MATERIAL</button>
        <button type="button" onClick={() => setTab("issue")} aria-pressed={tab === "issue"} style={{ fontWeight: tab === "issue" ? 700 : 400 }}>ISSUE TO PRODUCTION</button>
        <button type="button" onClick={() => setTab("return")} aria-pressed={tab === "return"} style={{ fontWeight: tab === "return" ? 700 : 400 }}>RETURN MATERIAL</button>
        <button type="button" onClick={() => setTab("transfer")} aria-pressed={tab === "transfer"} style={{ fontWeight: tab === "transfer" ? 700 : 400 }}>TRANSFER</button>
        <button type="button" onClick={() => setTab("stock")} aria-pressed={tab === "stock"} style={{ fontWeight: tab === "stock" ? 700 : 400 }}>STOCK</button>
        <button type="button" onClick={() => setTab("lots")} aria-pressed={tab === "lots"} style={{ fontWeight: tab === "lots" ? 700 : 400 }}>LOTS</button>
        <button type="button" onClick={() => setTab("count")} aria-pressed={tab === "count"} style={{ fontWeight: tab === "count" ? 700 : 400 }}>STOCK COUNT</button>
      </div>
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      {tab === "receive" && <GrnSection ctx={ctx} />}
      {tab === "issue" && <StoreIssueForm ctx={ctx} />}
      {tab === "return" && <StoreReturnForm ctx={ctx} />}
      {tab === "transfer" && <StoreTransferForm ctx={ctx} />}
      {tab === "stock" && <MaterialStockSection />}
      {tab === "lots" && <StoreLotsView ctx={ctx} />}
      {tab === "count" && <StockCountsSection ctx={ctx} />}
    </section>
  );
}

function StoreIssueForm({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const wipLocations = (data.locations ?? []).filter((l) => l.type === "WIP_AREA" || l.type === "PRODUCTION_FLOOR");
  const rawLocations = (data.locations ?? []).filter((l) => l.type === "RAW_STORE");
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = (data.materials ?? []).find((m) => m.id === f.get("materialId")); const qty = Number(f.get("quantity")); run("issue-to-production", { productionOrderId: f.get("productionOrderId"), materialId: f.get("materialId"), quantity: qty, unit: material?.baseUnit ?? "KG", canonicalQuantity: qty, fromLocationId: f.get("fromLocationId"), toLocationId: f.get("toLocationId") || "WIP", idempotencyKey: key() }, "Material issued to production.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Production order (required qty is on the order's MRP gate)<select name="productionOrderId" required>{(data.orders ?? []).map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select></label>
      <label>Material<select name="materialId" required>{(data.materials ?? []).map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></label>
      <label>Quantity issued<input name="quantity" type="number" step="0.001" required /></label>
      <label>From (Raw Store)<select name="fromLocationId" required>{rawLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>To (optional)<select name="toLocationId"><option value="">— WIP —</option>{wipLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <button disabled={busy}>ISSUE TO PRODUCTION</button>
    </form>
  );
}

function StoreReturnForm({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  const rawLocations = (data.locations ?? []).filter((l) => l.type === "RAW_STORE");
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = (data.materials ?? []).find((m) => m.id === f.get("materialId")); const qty = Number(f.get("quantity")); run("return-unused-material", { productionOrderId: f.get("productionOrderId"), materialId: f.get("materialId"), quantity: qty, unit: material?.baseUnit ?? "KG", canonicalQuantity: qty, toLocationId: f.get("toLocationId"), reason: String(f.get("reason")), idempotencyKey: key() }, "Unused material returned.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Production order<select name="productionOrderId" required>{(data.orders ?? []).map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select></label>
      <label>Material<select name="materialId" required>{(data.materials ?? []).map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></label>
      <label>Quantity returned<input name="quantity" type="number" step="0.001" required /></label>
      <label>Return to<select name="toLocationId" required>{rawLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Reason<input name="reason" required /></label>
      <button disabled={busy}>RETURN MATERIAL</button>
    </form>
  );
}

// Transfer only — deliberately not the Adjust Stock path (STORE_EXECUTIVE
// holds mfg_stock_transfer:manage but not mfg_stock_adjustment:manage in the
// RBAC catalog; mfg_stock_adjustment:manage is Manufacturing Manager + Founder
// only — not even Supervisor — the tightest of the mfg_* permissions, matching
// "adjustment" being an unreconciled exception path, not routine movement).
function StoreTransferForm({ ctx }: { ctx: Ctx }) {
  const { data, run, busy } = ctx;
  if ((data.locations?.length ?? 0) < 2 || (data.materials?.length ?? 0) === 0) return <p>Add at least two locations and one material first.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const material = data.materials!.find((m) => m.id === f.get("materialId")); const qty = Number(f.get("quantity")); run("transfer-stock", { materialId: f.get("materialId"), quantity: qty, unit: material?.baseUnit ?? "KG", canonicalQuantity: qty, fromLocationId: f.get("fromLocationId"), toLocationId: f.get("toLocationId"), reason: String(f.get("reason")), idempotencyKey: key() }, "Transfer posted.", () => (e.currentTarget as HTMLFormElement).reset()); }}>
      <label>Material<select name="materialId" required>{data.materials!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label>Quantity<input name="quantity" type="number" step="0.001" required /></label>
      <label>From<select name="fromLocationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>To<select name="toLocationId" required>{data.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Reason<input name="reason" required /></label>
      <button disabled={busy}>TRANSFER</button>
    </form>
  );
}

function StoreLotsView({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const [lotId, setLotId] = useState("");
  const { data: ledger } = useReportOnDemand<{ direction: string; quantity: string; occurredAt: string; sourceType: string }[]>("lot-ledger", { lotId }, [lotId], !!lotId);
  return (
    <div>
      <h4>Near-Expiry / Expired Lots</h4>
      <div className={styles.tableWrap}><table><thead><tr><th>Lot</th><th>Expiry</th><th>Days Remaining</th></tr></thead><tbody>
        {(data.nearExpiry ?? []).length === 0 && <tr><td colSpan={3}>No lots near expiry.</td></tr>}
        {(data.nearExpiry ?? []).map((l) => <tr key={l.id}><td>{l.lotNumber}</td><td>{fmtDate(l.expiryDate)}</td><td>{l.expired ? "EXPIRED" : `${l.daysRemaining}d`}</td></tr>)}
      </tbody></table></div>
      <h4>Lot Ledger Lookup</h4>
      <label>Lot ID<input value={lotId} onChange={(e) => setLotId(e.target.value)} placeholder="paste lot id" /></label>
      <div className={styles.tableWrap}><table><thead><tr><th>Direction</th><th>Qty</th><th>Date</th><th>Source</th></tr></thead><tbody>
        {(ledger ?? []).length === 0 && <tr><td colSpan={4}>No movements — paste a Lot ID above.</td></tr>}
        {(ledger ?? []).map((m, i) => <tr key={i}><td>{m.direction}</td><td>{num(m.quantity)}</td><td>{fmtDate(m.occurredAt)}</td><td>{m.sourceType}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

// --- QC ---------------------------------------------------------------
function QcWorkspace({ ctx, message }: { ctx: Ctx; message: { ok: boolean; text: string } | null }) {
  const [tab, setTab] = useState<"pending" | "hold" | "failed" | "released" | "history">("pending");
  return (
    <section className={styles.panel}>
      <div><small>MANUFACTURING — QC</small><h2>Quality Control Workspace</h2></div>
      <div className={styles.inlineActions} role="tablist" aria-label="QC workspace">
        <button type="button" onClick={() => setTab("pending")} aria-pressed={tab === "pending"} style={{ fontWeight: tab === "pending" ? 700 : 400 }}>PENDING QC</button>
        <button type="button" onClick={() => setTab("hold")} aria-pressed={tab === "hold"} style={{ fontWeight: tab === "hold" ? 700 : 400 }}>ON HOLD</button>
        <button type="button" onClick={() => setTab("failed")} aria-pressed={tab === "failed"} style={{ fontWeight: tab === "failed" ? 700 : 400 }}>FAILED</button>
        <button type="button" onClick={() => setTab("released")} aria-pressed={tab === "released"} style={{ fontWeight: tab === "released" ? 700 : 400 }}>RELEASED</button>
        <button type="button" onClick={() => setTab("history")} aria-pressed={tab === "history"} style={{ fontWeight: tab === "history" ? 700 : 400 }}>HISTORY</button>
      </div>
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      {tab === "pending" && <QcStatusBatchList ctx={ctx} qcStatus="PENDING" showActions />}
      {tab === "hold" && <QcStatusBatchList ctx={ctx} qcStatus="HOLD" showActions />}
      {tab === "failed" && <QcStatusBatchList ctx={ctx} qcStatus="FAILED" showActions={false} />}
      {tab === "released" && <QcStatusBatchList ctx={ctx} qcStatus="RELEASED" showActions={false} />}
      {tab === "history" && <QcHistoryView />}
    </section>
  );
}

function QcStatusBatchList({ ctx, qcStatus, showActions }: { ctx: Ctx; qcStatus: "PENDING" | "HOLD" | "FAILED" | "RELEASED"; showActions: boolean }) {
  const { run, busy } = ctx;
  const { data, reload } = useReportOnDemand<{ id: string; batchNumber: string; productSkuId: string; date: string; actualOutputQuantity: number | null }[]>("qc-status-batches", { qcStatus }, [qcStatus]);
  return (
    <div>
      <div className={styles.tableWrap}><table><thead><tr><th>Batch #</th><th>Date</th><th>Output</th>{showActions && <th>Action</th>}<th>Document</th></tr></thead><tbody>
        {(data ?? []).length === 0 && <tr><td colSpan={showActions ? 5 : 4}>No batches in this status.</td></tr>}
        {(data ?? []).map((b) => (
          <tr key={b.id}>
            <td>{b.batchNumber}</td><td>{fmtDate(b.date)}</td><td>{b.actualOutputQuantity != null ? num(b.actualOutputQuantity) : "—"}</td>
            {showActions && (
              <td>
                <button type="button" disabled={busy} onClick={() => run("hold-batch", { batchId: b.id, reason: "Held from QC workspace" }, "Batch held — see ON HOLD tab.", reload)}>HOLD</button>{" "}
                <button type="button" disabled={busy} onClick={() => run("fail-batch", { batchId: b.id, reason: "Failed from QC workspace" }, "Batch failed — ask your Manufacturing Manager to review as a Deviation. See FAILED tab.", reload)}>FAIL</button>{" "}
                <button type="button" disabled={busy} onClick={() => run("release-batch", { batchId: b.id }, "Batch released — now in Company inventory. See RELEASED tab.", reload)}>PASS / RELEASE</button>
              </td>
            )}
            <td><DocAttach entityType="SeeraBatchQc" entityId={b.id} /></td>
          </tr>
        ))}
      </tbody></table></div>
      {showActions && <QcEnterResultsForm ctx={ctx} reload={reload} />}
    </div>
  );
}

function QcEnterResultsForm({ ctx, reload }: { ctx: Ctx; reload: () => void }) {
  const { run, busy } = ctx;
  return (
    <details><summary>ENTER RESULTS</summary>
      <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("record-batch-qc", { batchId: f.get("batchId"), parameter: String(f.get("parameter")), unit: f.get("unit") || undefined, observedValue: f.get("observedValue") ? Number(f.get("observedValue")) : undefined, remarks: f.get("remarks") || undefined }, "QC result recorded.", () => { (e.currentTarget as HTMLFormElement).reset(); reload(); }); }}>
        <label>Batch ID<input name="batchId" required placeholder="paste batch id" /></label>
        <label>Parameter<input name="parameter" required /></label>
        <label>Unit<input name="unit" /></label>
        <label>Observed value<input name="observedValue" type="number" step="0.0001" /></label>
        <label>Remarks<input name="remarks" /></label>
        <button disabled={busy}>SAVE RESULT</button>
      </form>
    </details>
  );
}

function QcHistoryView() {
  const { data } = useReportOnDemand<{ id: string; batchId: string | null; parameter: string; observedValue: number | null; passFail: boolean | null; sampleDate: string }[]>("batch-quality-history", { from: new Date(0).toISOString(), to: new Date().toISOString() }, []);
  return (
    <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Parameter</th><th>Observed</th><th>Result</th><th>Date</th></tr></thead><tbody>
      {(data ?? []).length === 0 && <tr><td colSpan={5}>No QC history yet.</td></tr>}
      {(data ?? []).map((r) => <tr key={r.id}><td>{r.batchId ?? "—"}</td><td>{r.parameter}</td><td>{r.observedValue != null ? num(r.observedValue) : "—"}</td><td>{r.passFail === null ? "UNTESTED" : r.passFail ? "PASS" : "FAIL"}</td><td>{fmtDate(r.sampleDate)}</td></tr>)}
    </tbody></table></div>
  );
}
