import Link from "next/link";
import { notFound } from "next/navigation";
import type { PrismaClient, UiLanguage } from "@prisma/client";
import type { SurfaceItem } from "@/lib/foundation/product-surface";
import { requireSurfaceAccess } from "@/lib/foundation/surface-access";
import { PageHeading } from "@/components/seera/foundation/States";
import styles from "./ProductSurface.module.css";
import { PartnerLifecycleActions } from "./WorkflowActions";
import { DeliveryActions } from "./DeliveryActions";
import { RetailerActions } from "./RetailerActions";
import { DocumentShareActions } from "./DocumentShareActions";
import { PartnerAccessPanel } from "./PartnerAccessPanel";
import { BillingProfilePanel } from "./BillingProfilePanel";
import { InvoiceNumberingPanel } from "./InvoiceNumberingPanel";
import { invoiceNumberingStatus } from "@/lib/sales-distribution/billing-service";
import { ReassignDistributorPanel } from "./ReassignDistributorPanel";
import { CreditPolicyPanel } from "./CreditPolicyPanel";
import { DistributorClosureSettlementPanel } from "./DistributorClosureSettlementPanel";
import { AssignRetailerCommercialPartyPanel } from "./AssignRetailerCommercialPartyPanel";
import { canonicalDistributorExposure, superStockistDistributorCollectionsSnapshot } from "@/lib/sales-distribution/credit-service";
import { MoneyDeskTransactionActions } from "./MoneyDeskTransactionActions";
import { companyOrderNextStep } from "@/lib/sales-distribution/business-rules";
import { partnerObligationsPreview } from "@/lib/sales-distribution/travel-lifecycle-service";
import { distributorClosureStockPosition } from "@/lib/sales-distribution/distributor-management-service";
import { moneyDeskTransactionDetail } from "@/lib/finance/money-desk-service";
import { listTreasuryAccounts } from "@/lib/finance/treasury-service";
import { STATUS_BUCKET, STATUS_LABEL, ORDER_TYPE_LABEL, BUCKET_TONE } from "@/lib/sales-distribution/orders-overview-service";
import { attendanceRecordDetail, employeeMonthlySummary, dailyActivityTimeline } from "@/lib/sales-distribution/attendance-service";
import { AttendanceStatusCorrectionActions } from "./AttendanceStatusCorrectionActions";

type Field = { label: string; value: string };
const money = (v: unknown) =>
    `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
  text = (v: unknown) =>
    v == null || v === ""
      ? "—"
      : v instanceof Date
        ? v.toLocaleString("en-IN")
        : String(v);
// P0 fix: an order line's `packSnapshot` is already a COMPLETE, self-describing quantity string
// when a commercial unit (BOX/BAG) was actually selected at order time — e.g. "2 BOX (80 PC)"
// (see workflow-service.ts's placeRetailerOrder/createCompanyOrder, which both write that exact
// "(N PC)" suffix). The display used to prepend the raw base-PC orderedQuantity in front of it
// regardless ("80 2 BOX (80 PC)"), which both double-counted the same quantity and made every
// order look like it was sold in bare pieces. A line with no configured commercial unit (no
// "(N PC)" suffix — packSnapshot is just the physical pack description, e.g. "500 g") still needs
// the real ordered quantity shown, so that case keeps it, multiplied against the pack description.
const orderLineQuantityLabel = (l: { orderedQuantity: unknown; packSnapshot: string | null }) =>
  l.packSnapshot && l.packSnapshot.includes("PC)")
    ? l.packSnapshot
    : `${text(l.orderedQuantity)}${l.packSnapshot ? ` × ${l.packSnapshot}` : ""}`;
const Fields = ({ items }: { items: Field[] }) => (
  <dl className={styles.detail}>
    {items.map((x) => (
      <div key={x.label}>
        <dt>{x.label}</dt>
        <dd>{x.value}</dd>
      </div>
    ))}
  </dl>
);
export async function OperationalDetail({
  db,
  userId,
  portal,
  item,
  id,
  language,
  query = {},
  canManageLifecycle = false,
  canExecuteDelivery = false,
  canManageFollowUp = false,
  canShareDocument = false,
  canManageAccess = false,
  canManageCredit = false,
  canManageCommercialParty = false,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  item: SurfaceItem;
  id: string;
  language: UiLanguage;
  query?: Record<string, string | string[] | undefined>;
  canManageLifecycle?: boolean;
  canExecuteDelivery?: boolean;
  canManageFollowUp?: boolean;
  canShareDocument?: boolean;
  canManageAccess?: boolean;
  canManageCredit?: boolean;
  canManageCommercialParty?: boolean;
}) {
  const hi = language === "HI",
    back = `/portal/${portal}/${item.slug}`,
    scope = await requireSurfaceAccess(db, userId, portal, item),
    party = scope.partyIds,
    employees = scope.employeeIds,
    retailerIds = scope.retailerIds,
    head = (title: string) => (
      <PageHeading
        title={title}
        description={
          portal === "sales-executive"
            ? hi
              ? "इस ग्राहक का पूरा इतिहास — विज़िट, ऑर्डर और फॉलो-अप।"
              : "Full history for this customer — visits, orders, and follow-ups."
            : hi
              ? "अधिकृत व्यावसायिक विवरण और इतिहास।"
              : "Authorized business detail and history."
        }
        action={
          <Link className={styles.back} href={back}>
            {hi ? "सूची पर वापस" : "Back to list"}
          </Link>
        }
      />
    );
  if (item.slug === "attendance") {
    const qYear = Number(Array.isArray(query.year) ? query.year[0] : query.year) || undefined;
    const qMonth = Number(Array.isArray(query.month) ? query.month[0] : query.month) || undefined;
    const qDay = Number(Array.isArray(query.day) ? query.day[0] : query.day) || undefined;
    const statusLabelAll: Record<string, string> = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", ON_LEAVE: "On Leave", WEEK_OFF: "Week Off", HOLIDAY: "Holiday", EXCEPTION: "Exception" };

    if (qYear && qMonth && qDay) {
      // Section 9 — Daily Activity Detail drill-down from the monthly summary.
      const dayDate = new Date(Date.UTC(qYear, qMonth - 1, qDay));
      const [dayDetail, timeline] = await Promise.all([
        attendanceRecordDetail(db, userId, id, dayDate),
        dailyActivityTimeline(db, userId, id, dayDate),
      ]);
      return (
        <>
          {head(`${dayDetail.employee.name} — ${dayDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`)}
          <div className={styles.detail}>
            <div><dt>Status</dt><dd>{dayDetail.status ? statusLabelAll[dayDetail.status] : "Not evaluated"}</dd></div>
            <div><dt>Reason</dt><dd>{dayDetail.reason}</dd></div>
          </div>
          <section className={styles.timeline}>
            <h2>Activity timeline</h2>
            {!timeline.hasAnyData ? (
              <p>No recorded activity for this day. This is not a fabricated gap — the underlying session/visit/order data simply doesn't exist for this date.</p>
            ) : (
              timeline.events.map((e, i) => (
                <article key={i}>
                  <time>{new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</time>
                  <p>{e.label}</p>
                </article>
              ))
            )}
          </section>
          <p><Link className={styles.back} href={`${back}/${id}?year=${qYear}&month=${qMonth}`}>← Back to monthly summary</Link></p>
        </>
      );
    }

    if (qYear && qMonth) {
      // Section 6/7 — Employee Monthly Summary, reached from the Monthly Attendance sheet.
      const summary = await employeeMonthlySummary(db, userId, id, qYear, qMonth);
      const monthLabel = new Date(Date.UTC(qYear, qMonth - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      return (
        <>
          {head(`${summary.employee.name} — ${monthLabel}`)}
          <p className="meta">{summary.roleLabel}</p>
          {summary.attendance && (
            <section className={styles.card}>
              <h3>Attendance</h3>
              <Fields
                items={[
                  { label: "Present", value: String(summary.attendance.present) },
                  { label: "Absent", value: String(summary.attendance.absent) },
                  { label: "Late", value: String(summary.attendance.late) },
                  { label: "Leave", value: String(summary.attendance.onLeave) },
                  { label: "Weekly Off", value: String(summary.attendance.weekOff) },
                  { label: "Holiday", value: String(summary.attendance.holiday) },
                  { label: "Sunday Worked", value: String(summary.attendance.sundayWorked) },
                  { label: "Holiday Worked", value: String(summary.attendance.holidayWorked) },
                  { label: "Not Evaluated", value: String(summary.attendance.notEvaluated) },
                ]}
              />
            </section>
          )}
          <section className={styles.card}>
            <h3>Work Performance</h3>
            <p className="meta">Answers "what work was performed" — a separate reporting layer from attendance above, per design.</p>
            <Fields
              items={[
                { label: "Field Working Days", value: String(summary.performance.fieldWorkingDays) },
                { label: "Customer Visits", value: String(summary.performance.customerVisits) },
                { label: "Productive Visits", value: String(summary.performance.productiveVisits) },
                { label: "No-Order Visits", value: String(summary.performance.noOrderVisits) },
                { label: "Orders", value: String(summary.performance.orders) },
                { label: "Sales Value", value: money(summary.performance.salesValue) },
                { label: "New Customers", value: String(summary.performance.newCustomers) },
                { label: "Reorders", value: summary.performance.reorders == null ? "Not available" : String(summary.performance.reorders) },
                { label: "Photos", value: String(summary.performance.photos) },
                { label: "Working Sessions", value: String(summary.performance.workingSessions) },
                { label: "Travel Distance", value: summary.taDa ? `${summary.taDa.totalKm.toFixed(1)} km` : "Not available" },
                { label: "TA/DA", value: summary.taDa && summary.taDa.totalTaDa != null ? money(summary.taDa.totalTaDa) : "Not available" },
              ]}
            />
          </section>
          <section className={styles.card}>
            <h3>Daily details</h3>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {summary.days.map((d) => (
                    <tr key={d.day}>
                      <td>{qYear}-{String(qMonth).padStart(2, "0")}-{String(d.day).padStart(2, "0")}</td>
                      <td>{d.status ? statusLabelAll[d.status] : "Not evaluated"}{d.offDayWorked ? ` (${d.offDayWorked === "SUNDAY_WORKED" ? "Sunday Worked" : "Holiday Worked"})` : ""}</td>
                      <td>{d.status && <Link href={`${back}/${id}?year=${qYear}&month=${qMonth}&day=${d.day}`}>View daily details →</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p><Link className={styles.back} href={`${back}?view=monthly&year=${qYear}&month=${qMonth}`}>← Back to monthly sheet</Link></p>
        </>
      );
    }

    const detail = await attendanceRecordDetail(db, userId, id, new Date());
    const statusLabel = statusLabelAll;
    return (
      <>
        {head(detail.employee.name)}
        <div className={styles.detail}>
          <div><dt>Date</dt><dd>{new Date(detail.businessDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</dd></div>
          <div><dt>Attendance status</dt><dd>{detail.status ? statusLabel[detail.status] : "Not yet evaluated"}</dd></div>
          <div><dt>Source</dt><dd>{detail.source === "SYSTEM" ? "System auto-marked" : detail.source === "MANUAL" ? "Manually corrected" : "—"}</dd></div>
          <div><dt>First activity</dt><dd>{text(detail.firstActivityAt)}</dd></div>
          <div><dt>Last activity</dt><dd>{text(detail.lastActivityAt)}</dd></div>
          <div><dt>Visits</dt><dd>{detail.visitCount}</dd></div>
          <div><dt>Orders</dt><dd>{detail.orderCount} ({money(detail.orderValue)})</dd></div>
        </div>
        <section className={styles.card}>
          <h3>Why</h3>
          <p>{detail.reason}</p>
        </section>
        {detail.sessions.length > 0 && (
          <section className={styles.card}>
            <h3>Field sessions this day</h3>
            <Fields
              items={detail.sessions.map((s, i) => ({
                label: `Session ${i + 1}`,
                value: `${text(s.startedAt)} → ${s.endedAt ? text(s.endedAt) : "still open"} · ${s.workingType.replaceAll("_", " ")} · ${s.visitCount} visit${s.visitCount === 1 ? "" : "s"}`,
              }))}
            />
          </section>
        )}
        <section className={styles.card}>
          <h3>Correct attendance</h3>
          {/* attendanceRecordDetail() above already required network:manage to load this page at
              all, so no further gate is needed here — same reasoning as every other detail branch
              in this file that renders an action panel unconditionally once the page itself loaded. */}
          <AttendanceStatusCorrectionActions employeeId={detail.employee.id} date={detail.businessDate} currentStatus={detail.status} />
        </section>
        <section className={styles.timeline}>
          <h2>Audit history</h2>
          {detail.auditHistory.length === 0 ? (
            <p>No changes recorded yet.</p>
          ) : (
            detail.auditHistory.map((a) => (
              <article key={a.id}>
                <time>{text(a.occurredAt)}</time>
                <strong>{a.isSystem ? "SYSTEM" : a.actorName}</strong>
                <p>
                  {a.action}
                  {a.afterState && typeof a.afterState === "object" && "status" in (a.afterState as Record<string, unknown>)
                    ? ` — ${(a.afterState as Record<string, unknown>).status}${a.beforeState && typeof a.beforeState === "object" && "status" in (a.beforeState as Record<string, unknown>) ? ` (was ${(a.beforeState as Record<string, unknown>).status})` : ""}`
                    : ""}
                </p>
              </article>
            ))
          )}
        </section>
      </>
    );
  }
  if (item.slug === "money-desk") {
    const detail = await moneyDeskTransactionDetail(db, userId, id);
    const ledgerHref = detail.ledgerLink ? `/portal/${portal}/finance-os?group=sales&section=ledger&partyType=${detail.ledgerLink.partyType}&partyId=${detail.ledgerLink.partyId}` : null;
    return (
      <>
        {head(detail.transactionNumber)}
        <section className={styles.card}>
          <h3>{hi ? "लेनदेन सारांश" : "Transaction Summary"}</h3>
          <Fields
            items={[
              { label: hi ? "उद्देश्य" : "Purpose", value: hi ? detail.purposeHindiLabel : detail.purposeLabel },
              { label: hi ? "दिशा" : "Direction", value: detail.direction },
              { label: hi ? "राशि" : "Amount", value: money(detail.amount) },
              { label: hi ? "स्थिति" : "Status", value: detail.status },
              { label: hi ? "तिथि" : "Transaction Date", value: text(detail.date) },
              { label: hi ? "संदर्भ" : "Reference", value: text(detail.reference) },
            ]}
          />
        </section>
        {detail.smartFinance && (
          <section className={styles.card}>
            <h3>{hi ? "स्मार्ट फाइनेंस" : "Smart Finance"}</h3>
            <Fields
              items={[
                { label: hi ? "स्रोत" : "Source", value: hi ? "स्मार्ट फाइनेंस प्रविष्टि (टाइप / बोला गया)" : "Smart Finance Entry (typed / spoken)" },
                { label: hi ? "मूल निर्देश" : "Original instruction", value: `“${detail.smartFinance.originalInstruction}”` },
                ...(detail.smartFinance.confidence ? [{ label: hi ? "विश्वास" : "Confidence", value: detail.smartFinance.confidence }] : []),
              ]}
            />
          </section>
        )}
        {(detail.counterpartyName || detail.employee) && (
          <section className={styles.card}>
            <h3>{hi ? "पार्टी / कर्मचारी" : "Party / Employee"}</h3>
            <Fields
              items={[
                ...(detail.counterpartyName ? [{ label: hi ? "पार्टी" : "Party", value: `${detail.counterpartyName}${detail.counterpartyType ? ` (${detail.counterpartyType})` : ""}` }] : []),
                ...(detail.employee ? [{ label: hi ? "कर्मचारी" : "Employee", value: detail.employee.name }] : []),
              ]}
            />
          </section>
        )}
        {detail.sourceDocuments.length > 0 && (
          <section className={styles.card}>
            <h3>{hi ? "स्रोत दस्तावेज़" : "Source Documents"}</h3>
            <Fields items={detail.sourceDocuments.filter((d) => d.type !== "Invoice").map((d) => ({ label: d.type, value: d.label }))} />
            {/* P0-2 (Money Desk 2.0 Final Gap Closure) — a real, downloadable invoice PDF link, not
                just a bare id in a text field. Reuses the SAME governed /api/documents/[id]/download
                route (downloadDocument) every other issued document already uses — no second
                download path. */}
            {detail.sourceDocuments.filter((d) => d.type === "Invoice").map((d) => (
              <p key={d.id || d.label}>
                <strong>{hi ? "इनवॉइस" : "Invoice"}:</strong>{" "}
                {d.id ? (
                  <Link href={`/api/documents/${d.id}/download`} className={styles.button}>
                    {d.label} — {hi ? "PDF डाउनलोड करें" : "Download PDF"}
                  </Link>
                ) : (
                  <span>{d.label}</span>
                )}
              </p>
            ))}
          </section>
        )}
        {/* P0-3 (Money Desk 2.0 Final Gap Closure) — Payment Receipt PDF link for any POSTED
            Money-In transaction. Uses the transaction's own id (moneyDeskReceiptSnapshot reads
            straight off moneyDeskTransactionDetail), not a SeeraCommercialDocument id — this is a
            deliberately separate, read-only download path from the Invoice link above. */}
        {(detail.direction === "CASH_IN" || detail.direction === "BANK_IN") && detail.status === "POSTED" && (
          <section className={styles.card}>
            <h3>{hi ? "भुगतान रसीद" : "Payment Receipt"}</h3>
            <p>
              <Link href={`/api/finance/money-desk-receipt-pdf?transactionId=${detail.id}`} className={styles.button}>
                {detail.transactionNumber} — {hi ? "रसीद PDF डाउनलोड करें" : "Download Receipt PDF"}
              </Link>
            </p>
          </section>
        )}
        <section className={styles.card}>
          <h3>{hi ? "ट्रेजरी" : "Treasury"}</h3>
          <Fields items={[{ label: hi ? "खाता" : "Account", value: detail.treasury ? `${detail.treasury.name} (${detail.treasury.kind})` : "—" }]} />
        </section>
        <section className={styles.card}>
          <h3>{hi ? "क्षेत्र / कॉस्ट सेंटर" : "Territory / Cost Centre"}</h3>
          <Fields items={[{ label: hi ? "मान" : "Value", value: detail.territory ?? detail.costCentre ?? "—" }]} />
        </section>
        {detail.lineItems.length > 0 && (
          <section className={styles.card}>
            <h3>{hi ? "उत्पाद / आइटम" : "Products / Items"}</h3>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>SKU</th><th>{hi ? "मात्रा" : "Qty"}</th><th>{hi ? "दर" : "Rate"}</th></tr></thead>
                <tbody>{detail.lineItems.map((l, i) => <tr key={i}><td>{l.skuId}</td><td>{l.quantity}</td><td>{l.rate != null ? money(l.rate) : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
        <section className={styles.card}>
          <h3>{hi ? "लेजर प्रभाव" : "Ledger Impact"}</h3>
          {ledgerHref ? (
            <p><Link className={styles.button} href={ledgerHref}>{hi ? `${detail.ledgerLink!.label} लेजर देखें` : `View ${detail.ledgerLink!.label} Ledger`}</Link></p>
          ) : (
            <p>{hi ? "इस लेनदेन का कोई पार्टी लेजर प्रभाव नहीं है (सामान्य खाता बही में पोस्ट)।" : "This transaction has no party-ledger effect (posted to the general ledger)."}</p>
          )}
        </section>
        <section className={styles.card}>
          <h3>{hi ? "ऑडिट" : "Audit"}</h3>
          <Fields
            items={[
              { label: hi ? "बनाया गया" : "Created By", value: detail.requestedBy },
              ...(detail.requiresApproval ? [{ label: hi ? "स्वतंत्र अनुमोदन" : "Requires Independent Approval", value: detail.isSelf ? (hi ? "हाँ — आप स्वयं इसे स्वीकृत नहीं कर सकते" : "Yes — you created this and cannot approve it yourself") : (hi ? "हाँ" : "Yes") }] : []),
              ...(detail.approvedBy ? [{ label: hi ? "स्वीकृत द्वारा" : "Approved By", value: `${detail.approvedBy} (${text(detail.approvedAt)})` }] : []),
              ...(detail.voidedBy ? [{ label: hi ? "रद्द किया गया" : "Voided By", value: `${detail.voidedBy} (${text(detail.voidedAt)}) — ${detail.voidReason ?? ""}` }] : []),
              ...(detail.failureReason ? [{ label: hi ? "विफलता कारण" : "Failure Reason", value: detail.failureReason }] : []),
            ]}
          />
        </section>
        <MoneyDeskTransactionActions
          language={language}
          transactionId={detail.id}
          amount={detail.amount}
          canApprove={detail.canApprove}
          canVoid={detail.canVoid}
          canEdit={detail.canEdit}
          canRetry={detail.canRetry}
          // Part L — only fetched when an edit is actually possible for this row (avoids a needless
          // query on the common view-only path); lets EDIT / CORRECT offer a treasury-account picker
          // so a "Needs Attention" entry stuck for want of one (requireTreasuryAccountId in
          // money-desk-service.ts) can actually be corrected, not just endlessly retried.
          treasuryAccounts={detail.canEdit ? (await listTreasuryAccounts(db, userId)).map((a) => ({ id: a.id, name: a.name, kind: a.kind })) : []}
        />
      </>
    );
  }
  if (item.kind === "orders") {
    const x = await db.seeraSalesOrder.findFirst({
      where: {
        id,
        ...(party
          ? {
              OR: [
                { buyerPartnerId: { in: party } },
                { sellerPartnerId: { in: party } },
              ],
            }
          : {}),
        ...(employees ? { salespersonId: { in: employees } } : {}),
        ...(retailerIds ? { retailerId: { in: retailerIds } } : {}),
      },
      include: {
        buyerPartner: { select: { legalName: true } },
        sellerPartner: { select: { legalName: true } },
        retailer: { select: { businessName: true, mobile: true } },
        lines: true,
        deliveries: { orderBy: { createdAt: "desc" } },
        promises: { orderBy: { createdAt: "desc" } },
        paymentProofs: { orderBy: { submittedAt: "desc" }, take: 1 },
      },
    });
    if (!x) notFound();
    const nextStep = x.type === "COMPANY_REPLENISHMENT" ? companyOrderNextStep(x, x.paymentProofs[0]?.status) : null;
    if (portal === "founder-admin") {
      // Founder UI Implementation & Visual Gap Closure mission — replaces the raw
      // SKU/Ordered/Accepted/Cancelled/Remaining/Dispatched/Delivered database matrix as the PRIMARY
      // view with readable order items ("SEERA CAKE-WHITE · 80 PCS · ₹20/unit · ₹1,600"); the same
      // matrix is kept (nothing removed), just moved into a collapsed "Fulfilment details" section —
      // secondary, not the first thing a Founder sees. Scoped to founder-admin only: every other
      // portal's order-detail view below is completely untouched.
      const customerName = x.retailer?.businessName ?? x.buyerPartner?.legalName ?? "Retailer / party";
      const customerMobile = x.retailer?.mobile ?? null;
      const bucket = STATUS_BUCKET[x.status];
      const latestProof = x.paymentProofs[0];
      return (
        <>
          {head(x.orderNumber)}
          <div className={styles.orderHeader}>
            <div>
              <strong style={{ fontSize: 18 }}>{customerName}</strong>
              {customerMobile && <span className={styles.itemSub}>{customerMobile}</span>}
            </div>
            <span className={styles.statusPillLg} data-tone={BUCKET_TONE[bucket]}>
              {STATUS_LABEL[x.status] ?? x.status}
            </span>
            <span className={styles.orderHeaderTotal}>{money(x.total)}</span>
          </div>
          {nextStep === "PAYMENT VERIFIED — READY FOR DISPATCH" && (
            <p className={styles.notice}>
              <Link href={`/portal/accounts/company-order-dispatch`}>PREPARE COMPANY DISPATCH →</Link>
            </p>
          )}
          <section className={styles.card}>
            <h3>Order</h3>
            <Fields
              items={[
                { label: "Order type", value: ORDER_TYPE_LABEL[x.type] ?? x.type },
                ...(nextStep ? [{ label: "Next step", value: nextStep }] : []),
                { label: "Seller", value: x.sellerPartner?.legalName ?? "Company / party" },
                { label: "Order date", value: text(x.createdAt) },
                { label: "Original due date", value: text(x.originalDueDate) },
                { label: "Grace until", value: text(x.graceUntil) },
              ]}
            />
          </section>
          <section className={styles.card}>
            <h3>Order Items</h3>
            {x.lines.map((l) => (
              <div key={l.id} className={styles.itemRow}>
                <div>
                  <span className={styles.itemName}>{l.productNameSnapshot}</span>
                  <span className={styles.itemSub}>{l.skuCodeSnapshot}</span>
                </div>
                <span className={styles.itemMeta}>
                  {orderLineQuantityLabel(l)} · {money(l.priceSnapshot)}/unit
                </span>
                <span className={styles.itemTotal}>{money(l.lineTotal)}</span>
              </div>
            ))}
            <details className={styles.fulfilmentDetails}>
              <summary>Fulfilment details (accepted, dispatched, delivered, cancelled, returned)</summary>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th><th>Ordered</th><th>Accepted</th><th>Cancelled</th><th>Remaining</th>
                      <th>Dispatched</th><th>Delivered</th><th>Refused</th><th>Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {x.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.skuCodeSnapshot}</td>
                        <td>{text(l.orderedQuantity)}</td>
                        <td>{text(l.acceptedQuantity)}</td>
                        <td>{text(l.cancelledQuantity)}</td>
                        <td>
                          {text(
                            Math.max(
                              0,
                              Number(l.orderedQuantity) - Number(l.acceptedQuantity) - Number(l.cancelledQuantity),
                            ),
                          )}
                        </td>
                        <td>{text(l.dispatchedQuantity)}</td>
                        <td>{text(l.deliveredQuantity)}</td>
                        <td>{text(l.refusedQuantity)}</td>
                        <td>{text(l.returnedQuantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          {latestProof && (
            <section className={styles.card}>
              <h3>Payment</h3>
              <Fields
                items={[
                  { label: "Payment type", value: text(x.commercialPaymentType) },
                  { label: "Payment proof status", value: latestProof.status },
                  { label: "Submitted", value: text(latestProof.submittedAt) },
                ]}
              />
            </section>
          )}
          <section className={styles.timeline}>
            <h2>Timeline</h2>
            {x.deliveries.length === 0 && x.promises.length === 0 ? (
              <p>No fulfilment or payment events recorded yet.</p>
            ) : (
              <>
                {x.deliveries.map((d) => (
                  <article key={d.id}>
                    <time>{text(d.occurredAt ?? d.createdAt)}</time>
                    <strong>{d.status}</strong>
                    <p>{d.receiverName ?? d.reason ?? "Recorded delivery event"}</p>
                  </article>
                ))}
                {x.promises.map((p) => (
                  <article key={p.id}>
                    <time>{text(p.createdAt)}</time>
                    <strong>Payment promise</strong>
                    <p>
                      {text(p.promisedPaymentDate)} · original due {text(p.originalDueDate)}
                    </p>
                  </article>
                ))}
              </>
            )}
          </section>
          {x.notes && (
            <section className={styles.card}>
              <h3>Notes</h3>
              <p>{x.notes}</p>
            </section>
          )}
        </>
      );
    }
    return (
      <>
        {head(x.orderNumber)}
        <Fields
          items={[
            { label: "Status", value: x.status },
            ...(nextStep ? [{ label: "Next step", value: nextStep }] : []),
            { label: "Type", value: x.type },
            {
              label: "Seller",
              value: x.sellerPartner?.legalName ?? "Company / party",
            },
            {
              label: "Buyer",
              value:
                x.buyerPartner?.legalName ??
                x.retailer?.businessName ??
                "Retailer / party",
            },
            { label: "Booked total", value: money(x.total) },
            { label: "Original due date", value: text(x.originalDueDate) },
            { label: "Grace until", value: text(x.graceUntil) },
          ]}
        />
        {nextStep === "PAYMENT VERIFIED — READY FOR DISPATCH" && (
          <p className={styles.notice}>
            <Link href={`/portal/accounts/company-order-dispatch`}>
              {hi ? "कंपनी डिस्पैच तैयार करें →" : "PREPARE COMPANY DISPATCH →"}
            </Link>
          </p>
        )}
        <section className={styles.panel}>
          <h2>{hi ? "आइटम और पूर्ति" : "Items & fulfilment"}</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Ordered</th>
                  {x.type === "COMPANY_REPLENISHMENT" && (
                    <>
                      <th>Commercial UOM / Pack</th>
                      <th>Rate</th>
                    </>
                  )}
                  <th>Accepted</th>
                  <th>Cancelled</th>
                  <th>Remaining</th>
                  <th>Dispatched</th>
                  <th>Delivered</th>
                  <th>Refused</th>
                  <th>Returned</th>
                </tr>
              </thead>
              <tbody>
                {x.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.skuCodeSnapshot}
                      <br />
                      <small>{l.productNameSnapshot}</small>
                    </td>
                    <td>{text(l.orderedQuantity)}</td>
                    {x.type === "COMPANY_REPLENISHMENT" && (
                      <>
                        <td>{l.packSnapshot ?? "—"}</td>
                        <td>{money(l.priceSnapshot)}</td>
                      </>
                    )}
                    <td>{text(l.acceptedQuantity)}</td>
                    <td>{text(l.cancelledQuantity)}</td>
                    <td>
                      {text(
                        Math.max(
                          0,
                          Number(l.orderedQuantity) -
                            Number(l.acceptedQuantity) -
                            Number(l.cancelledQuantity),
                        ),
                      )}
                    </td>
                    <td>{text(l.dispatchedQuantity)}</td>
                    <td>{text(l.deliveredQuantity)}</td>
                    <td>{text(l.refusedQuantity)}</td>
                    <td>{text(l.returnedQuantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className={styles.timeline}>
          <h2>{hi ? "पूर्ति समयरेखा" : "Fulfilment timeline"}</h2>
          {x.deliveries.map((d) => (
            <article key={d.id}>
              <time>{text(d.occurredAt ?? d.createdAt)}</time>
              <strong>{d.status}</strong>
              <p>{d.receiverName ?? d.reason ?? "Recorded delivery event"}</p>
              {(d.vehicleNumber || d.driverName || d.lrNumber || d.challanNumber || d.transporterName) && (
                <p>
                  {[
                    d.vehicleNumber && `Vehicle ${d.vehicleNumber}`,
                    d.driverName && `Driver ${d.driverName}${d.driverMobile ? ` (${d.driverMobile})` : ""}`,
                    d.transporterName && `Transporter ${d.transporterName}`,
                    d.lrNumber && `LR ${d.lrNumber}`,
                    d.challanNumber && `Challan ${d.challanNumber}`,
                    d.eta && `ETA ${text(d.eta)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </article>
          ))}
          {x.promises.map((p) => (
            <article key={p.id}>
              <time>{text(p.createdAt)}</time>
              <strong>Payment promise</strong>
              <p>
                {text(p.promisedPaymentDate)} · original due{" "}
                {text(p.originalDueDate)}
              </p>
            </article>
          ))}
        </section>
      </>
    );
  }
  if (item.kind === "partners") {
    const crossPartnerScope =
      portal === "super-stockist" && item.slug === "distributors" && party
        ? { assignedSuperStockistId: { in: party } }
        : party
          ? { id: { in: party } }
          : {};
    const x = await db.seeraPartner.findFirst({
      where: { id, ...crossPartnerScope },
      include: {
        creditTerms: { orderBy: { effectiveFrom: "desc" } },
        users: { where: { active: true } },
      },
    });
    if (!x) notFound();
    // Founder/Admin UAT correction (P0, section 4-5): the rich 360 previously only rendered for a
    // Super Stockist viewing its OWN distributors. Founder/Admin (which is unrestricted — `party`
    // is null for this global portal, so crossPartnerScope above imposes no filter) gets the same
    // Distributor 360 here, plus a lighter but real Super Stockist 360 of its own (mapped
    // Distributor count, orders it has sold, open claims) — S.S.-specific credit-exposure/DISTRIBUTOR
    // order-status metrics don't apply to a Super Stockist itself, so those stay Distributor-only.
    const showDistributor360 = (portal === "super-stockist" || portal === "founder-admin") && item.slug === "distributors";
    const showSuperStockist360 = portal === "founder-admin" && item.slug === "super-stockists";
    const show360 = showDistributor360 || showSuperStockist360;
    const superStockistId = party?.[0];
    const [recentOrders, openClaims, outstanding, statusCounts, collectionsSnapshot] = showDistributor360
      ? await Promise.all([
          db.seeraSalesOrder.findMany({
            where: { buyerPartnerId: x.id },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          db.seeraClaim.findMany({
            where: {
              status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
              OR: [{ claimantId: x.id }, { againstPartyId: x.id }],
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          canonicalDistributorExposure(db, x.id, new Date()),
          db.seeraSalesOrder.groupBy({
            by: ["status"],
            where: { buyerPartnerId: x.id, type: "DISTRIBUTOR_REPLENISHMENT" },
            _count: { _all: true },
          }),
          superStockistId
            ? superStockistDistributorCollectionsSnapshot(db, userId, superStockistId, x.id).catch(() => null)
            : null,
        ])
      : [[], [], null, [], null];
    const [ssRecentOrders, ssOpenClaims, ssDistributorCount] = showSuperStockist360
      ? await Promise.all([
          db.seeraSalesOrder.findMany({
            where: { sellerPartnerId: x.id, type: "DISTRIBUTOR_REPLENISHMENT" },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          db.seeraClaim.findMany({
            where: {
              status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
              OR: [{ claimantId: x.id }, { againstPartyId: x.id }],
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          db.seeraPartner.count({ where: { type: "DISTRIBUTOR", assignedSuperStockistId: x.id } }),
        ])
      : [[], [], 0];
    const countFor = (statuses: string[]) => statusCounts.filter((s) => statuses.includes(s.status)).reduce((sum, s) => sum + s._count._all, 0);
    const members = canManageAccess
      ? await (async () => {
          const partyUsers = await db.seeraPartyUser.findMany({ where: { partnerId: x.id }, orderBy: { createdAt: "desc" } });
          const userRecords = partyUsers.length
            ? await db.user.findMany({ where: { id: { in: partyUsers.map((m) => m.userId) } }, select: { id: true, name: true, email: true } })
            : [];
          const userMap = new Map(userRecords.map((u) => [u.id, u]));
          return partyUsers.map((m) => ({
            membershipId: m.id,
            userId: m.userId,
            name: userMap.get(m.userId)?.name ?? userMap.get(m.userId)?.email ?? "—",
            email: userMap.get(m.userId)?.email ?? "—",
            accessRole: m.accessRole,
            active: m.active,
          }));
        })()
      : [];
    const billingProfile =
      canManageAccess && (x.type === "DISTRIBUTOR" || x.type === "SUPER_STOCKIST" || x.type === "COMPANY_DIRECT")
        ? await db.seeraBillingProfile.findFirst({
            where: { ownerType: x.type, ownerId: x.id, verificationStatus: "VERIFIED", effectiveTo: null },
            orderBy: { effectiveFrom: "desc" },
          })
        : null;
    // Founder/Admin viewing this 360 page is very often not personally a SeeraPartyUser of the
    // partner being viewed (see billingProfile's own comment above for the same class of gap) —
    // invoiceNumberingStatus's requireIssuerScope would otherwise throw PARTY_SCOPE_DENIED and take
    // down the whole page. Degrades to null (panel simply doesn't render) rather than crash.
    const numberingStatus =
      canManageAccess && billingProfile && (x.type === "DISTRIBUTOR" || x.type === "SUPER_STOCKIST")
        ? await invoiceNumberingStatus(db, userId, { ownerType: x.type, ownerId: x.id, documentType: "TAX_INVOICE" }).catch(() => null)
        : null;
    const reassignSuperStockists =
      canManageAccess && x.type === "DISTRIBUTOR"
        ? (
            await db.seeraPartner.findMany({
              where: { type: "SUPER_STOCKIST", lifecycle: { not: "CLOSED" } },
              select: { id: true, tradeName: true, legalName: true, code: true },
              orderBy: { updatedAt: "desc" },
              take: 200,
            })
          ).map((s) => ({ value: s.id, label: `${s.tradeName ?? s.legalName} · ${s.code}` }))
        : [];
    const contact = x.primaryContact as { mobile?: string; ownerName?: string } | null;
    // STAGE 14: real obligations preview (was never wired — PartnerLifecycleActions' warning banner
    // silently never rendered) plus, for a Distributor specifically, its closure stock position —
    // the governed take-back settlement panel only renders when there's real stock to resolve.
    const obligationsPreview = canManageLifecycle && x.lifecycle === "ACTIVE"
      ? await partnerObligationsPreview(db, userId, x.id).catch(() => null)
      : null;
    const closureStockPosition = canManageLifecycle && x.type === "DISTRIBUTOR" && x.lifecycle === "ACTIVE"
      ? await distributorClosureStockPosition(db, userId, x.id).catch(() => null)
      : null;
    const history = await db.seeraPartnerLifecycleEvent.findMany({
        where: { partnerId: x.id },
        orderBy: { occurredAt: "desc" },
      }),
      credit = x.creditTerms[0],
      approvers = canManageLifecycle
        ? await db.user.findMany({
            where: {
              status: "ACTIVE",
              roleAssignments: {
                some: {
                  status: "ACTIVE",
                  role: {
                    permissions: {
                      some: {
                        permission: {
                          code: {
                            in: [
                              "partner_lifecycle:manage",
                              "partner_lifecycle:force_close",
                              "system:super_admin",
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
          })
        : [];
    return (
      <>
        {head(x.tradeName ?? x.legalName)}
        {canManageLifecycle && closureStockPosition && closureStockPosition.totalUnits > 0 && (
          <DistributorClosureSettlementPanel
            language={language}
            distributorId={x.id}
            totalUnits={closureStockPosition.totalUnits}
            lines={closureStockPosition.lines}
            receivingSuperStockist={
              x.assignedSuperStockistId
                ? { value: x.assignedSuperStockistId, label: reassignSuperStockists.find((s) => s.value === x.assignedSuperStockistId)?.label ?? (x.tradeName ?? x.legalName) }
                : null
            }
          />
        )}
        {canManageLifecycle && (
          <PartnerLifecycleActions
            partnerId={x.id}
            lifecycle={x.lifecycle}
            language={language}
            approvers={approvers.map((a) => ({
              value: a.id,
              label: a.name ?? a.email,
            }))}
            obligations={
              obligationsPreview
                ? { openOrders: obligationsPreview.openOrders, outstanding: obligationsPreview.outstanding, openClaims: obligationsPreview.pendingClaims, stock: obligationsPreview.stock }
                : undefined
            }
          />
        )}
        {canManageAccess && (x.type === "DISTRIBUTOR" || x.type === "SUPER_STOCKIST") && (
          // Company Direct is the Founder's own internal entity, not an external partner with its
          // own portal login — no user-access management needed for it.
          <PartnerAccessPanel language={language} partnerId={x.id} partnerType={x.type} members={members} />
        )}
        {canManageAccess && (x.type === "DISTRIBUTOR" || x.type === "SUPER_STOCKIST" || x.type === "COMPANY_DIRECT") && (
          <BillingProfilePanel
            language={language}
            ownerType={x.type}
            ownerId={x.id}
            partnerGstin={x.gstin}
            profile={
              billingProfile
                ? {
                    gstRegistered: billingProfile.gstRegistered,
                    gstin: billingProfile.gstin,
                    state: billingProfile.state,
                    stateCode: billingProfile.stateCode,
                    invoicePrefix: billingProfile.invoicePrefix,
                    verificationStatus: billingProfile.verificationStatus,
                  }
                : null
            }
          />
        )}
        {numberingStatus && (x.type === "DISTRIBUTOR" || x.type === "SUPER_STOCKIST") && (
          <InvoiceNumberingPanel language={language} ownerType={x.type} ownerId={x.id} status={numberingStatus} />
        )}
        {canManageAccess && x.type === "DISTRIBUTOR" && (
          <ReassignDistributorPanel
            language={language}
            distributorId={x.id}
            currentSuperStockistId={x.assignedSuperStockistId}
            superStockists={reassignSuperStockists}
          />
        )}
        <Fields
          items={[
            { label: "Partner code", value: x.code },
            { label: "Legal name", value: x.legalName },
            { label: "Type", value: x.type },
            { label: "Lifecycle", value: x.lifecycle },
            { label: "GSTIN", value: x.gstin ?? "Not provided" },
            { label: "Territories", value: x.territoryIds.join(", ") || "—" },
            { label: "Active users", value: String(x.users.length) },
            ...(show360
              ? [
                  { label: "Owner", value: contact?.ownerName ?? "—" },
                  { label: "Mobile", value: contact?.mobile ?? "—" },
                ]
              : []),
          ]}
        />
        {portal === "super-stockist" && showDistributor360 && (
          <div className={styles.detail} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href={`/portal/${portal}/quotations`}>{hi ? "कोटेशन बनाएं" : "CREATE QUOTATION"}</Link>
            <Link href={`/portal/${portal}/billing`}>{hi ? "जीएसटी इनवॉइस बनाएं" : "CREATE GST INVOICE"}</Link>
            <Link href={`/portal/${portal}/payments?tab=receive&distributorId=${x.id}`}>{hi ? "भुगतान दर्ज करें" : "RECORD PAYMENT"}</Link>
            <Link href={`/portal/${portal}/collections?distributorId=${x.id}`}>{hi ? "विवरण देखें" : "VIEW STATEMENT"}</Link>
            <Link href={`/portal/${portal}/credit`}>{hi ? "क्रेडिट नीति संपादित करें" : "EDIT CREDIT POLICY"}</Link>
          </div>
        )}
        {credit && (
          <section className={styles.panel}>
            <h2>{hi ? "क्रेडिट शासन" : "Credit governance"}</h2>
            <Fields
              items={[
                {
                  label: "Enabled",
                  value: credit.creditEnabled ? "Yes" : "No",
                },
                { label: "Limit", value: money(credit.creditLimit) },
                { label: "Days", value: String(credit.creditDays) },
                {
                  label: "Grace Days",
                  value: credit.graceEnabled
                    ? `${credit.graceDays} days`
                    : "Disabled",
                },
                { label: "Reason", value: credit.changeReason },
              ]}
            />
          </section>
        )}
        {canManageCredit && portal === "super-stockist" && showDistributor360 && x.type === "DISTRIBUTOR" && x.assignedSuperStockistId && (
          // STAGE 13 (Founder read-only oversight): this edit form must only ever render for the
          // owning Super Stockist viewing its OWN Distributor (portal==="super-stockist") — it
          // previously also rendered for Founder/Admin here (an earlier phase deliberately removed
          // the `portal` gate, reasoning that updateDistributorCreditPolicy's system:super_admin
          // bypass meant this was "only a UI reachability gap" — but a reachable routine self-service
          // edit form is exactly what "S.S. governs its own Distributors' credit terms; Founder
          // read-only oversight" rules out. Founder still sees the Fields block above (read-only) plus
          // the network-wide read-only oversight page (credit-service.ts's
          // founderDistributorCreditOversight) — never this edit form. Reuses the same panel the
          // Super Stockist portal's own Credit nav item renders, just pre-scoped to this Distributor.
          <CreditPolicyPanel
            language={language}
            superStockistId={x.assignedSuperStockistId}
            distributors={[{ value: x.id, label: x.tradeName ?? x.legalName }]}
          />
        )}
        {showDistributor360 && outstanding && (
          <section className={styles.panel}>
            <h2>{hi ? "क्रेडिट एक्सपोज़र" : "Credit exposure"}</h2>
            <Fields
              items={[
                { label: "Net exposure", value: money(outstanding.exposure) },
                {
                  label: "Open order value",
                  value: money(outstanding.orderExposureTotal),
                },
                {
                  label: "Open orders",
                  value: String(outstanding.openOrders.length),
                },
                ...(collectionsSnapshot
                  ? [
                      { label: "Outstanding", value: money(collectionsSnapshot.outstanding) },
                      { label: "Overdue", value: money(collectionsSnapshot.overdue) },
                      { label: "Oldest due", value: text(collectionsSnapshot.oldestDueDate) },
                      { label: "Promise date", value: text(collectionsSnapshot.promisedPaymentDate) },
                      {
                        label: "Last payment",
                        value: collectionsSnapshot.lastPayment ? `${money(collectionsSnapshot.lastPayment.amount)} · ${text(collectionsSnapshot.lastPayment.postedAt)}` : "—",
                      },
                      { label: "Available credit", value: collectionsSnapshot.availableCredit == null ? "—" : money(collectionsSnapshot.availableCredit) },
                    ]
                  : []),
              ]}
            />
          </section>
        )}
        {showDistributor360 && statusCounts.length > 0 && (
          <section className={styles.panel}>
            <h2>{hi ? "ऑर्डर स्थिति" : "Order status"}</h2>
            <Fields
              items={[
                { label: "Pending", value: String(countFor(["SUBMITTED", "ACKNOWLEDGED", "HELD"])) },
                { label: "Accepted", value: String(countFor(["ACCEPTED", "PARTIAL_ACCEPTED", "ALLOCATED"])) },
                { label: "Dispatch pending", value: String(countFor(["DISPATCH_READY"])) },
                { label: "Delivered", value: String(countFor(["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED", "CLOSED"])) },
                { label: "Rejected/Cancelled", value: String(countFor(["REJECTED", "CANCELLED"])) },
                { label: "Open claims", value: String(openClaims.length) },
              ]}
            />
          </section>
        )}
        {showDistributor360 && (
          <section className={styles.panel}>
            <h2>{hi ? "हाल के ऑर्डर" : "Recent orders"}</h2>
            {recentOrders.length === 0 ? (
              <p className={styles.readOnly}>
                {hi ? "कोई ऑर्डर उपलब्ध नहीं है।" : "No orders available."}
              </p>
            ) : (
              recentOrders.map((o) => (
                <p key={o.id}>
                  {o.orderNumber} · {o.status} · {money(o.total)}
                </p>
              ))
            )}
          </section>
        )}
        {showDistributor360 && (
          <section className={styles.panel}>
            <h2>{hi ? "खुले दावे" : "Open claims"}</h2>
            {openClaims.length === 0 ? (
              <p className={styles.readOnly}>
                {hi ? "कोई खुला दावा नहीं है।" : "No open claims."}
              </p>
            ) : (
              openClaims.map((c) => (
                <p key={c.id}>
                  {c.claimNumber} · {c.type} · {c.status}
                </p>
              ))
            )}
          </section>
        )}
        {showSuperStockist360 && (
          <section className={styles.panel}>
            <h2>{hi ? "नेटवर्क" : "Network"}</h2>
            <Fields items={[{ label: hi ? "असाइन किए वितरक" : "Assigned distributors", value: String(ssDistributorCount) }]} />
          </section>
        )}
        {showSuperStockist360 && (
          <section className={styles.panel}>
            <h2>{hi ? "हाल के ऑर्डर (वितरकों को बेचे गए)" : "Recent orders (sold to distributors)"}</h2>
            {ssRecentOrders.length === 0 ? (
              <p className={styles.readOnly}>
                {hi ? "कोई ऑर्डर उपलब्ध नहीं है।" : "No orders available."}
              </p>
            ) : (
              ssRecentOrders.map((o) => (
                <p key={o.id}>
                  {o.orderNumber} · {o.status} · {money(o.total)}
                </p>
              ))
            )}
          </section>
        )}
        {showSuperStockist360 && (
          <section className={styles.panel}>
            <h2>{hi ? "खुले दावे" : "Open claims"}</h2>
            {ssOpenClaims.length === 0 ? (
              <p className={styles.readOnly}>
                {hi ? "कोई खुला दावा नहीं है।" : "No open claims."}
              </p>
            ) : (
              ssOpenClaims.map((c) => (
                <p key={c.id}>
                  {c.claimNumber} · {c.type} · {c.status}
                </p>
              ))
            )}
          </section>
        )}
        <section className={styles.timeline}>
          <h2>{hi ? "जीवनचक्र इतिहास" : "Lifecycle history"}</h2>
          {history.map((e) => (
            <article key={e.id}>
              <time>{text(e.occurredAt)}</time>
              <strong>
                {e.fromLifecycle} → {e.toLifecycle}
              </strong>
              <p>{e.reason}</p>
            </article>
          ))}
        </section>
      </>
    );
  }
  if (item.kind === "retailers") {
    const x = await db.seeraRetailer.findFirst({
      where: {
        id,
        ...(party ? { distributorId: { in: party } } : {}),
        ...(employees ? { salespersonId: { in: employees } } : {}),
      },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 12 },
        visits: { orderBy: { checkedInAt: "desc" }, take: 12 },
      },
    });
    if (!x) notFound();
    const collections = await db.seeraCollectionEntry.aggregate({
      where: { retailerId: x.id },
      _sum: { amount: true },
    });
    const totalOrdered = x.orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalCollected = Number(collections._sum.amount ?? 0);
    const outstanding = Math.max(0, totalOrdered - totalCollected);
    const showRetailerActions = portal === "sales-executive" && canManageFollowUp && x.salespersonId === userId;
    // Part B (Manoj hybrid territory): only the Manager portal, only with network:manage — same
    // gate as assignRetailerCommercialParty's own server-side authorize() call.
    const showCommercialPartyPanel = portal === "sales-manager" && canManageCommercialParty;
    const [followUps, photos, commercialParties] = await Promise.all([
      showRetailerActions
        ? db.seeraFollowUp.findMany({
            where: { retailerId: x.id, ownerId: userId, status: "OPEN" },
            orderBy: { dueDate: "asc" },
          })
        : Promise.resolve([]),
      showRetailerActions
        ? db.seeraVisitPhoto.findMany({
            where: { retailerId: x.id, deletedAt: null },
            orderBy: { capturedAt: "desc" },
            take: 12,
          })
        : Promise.resolve([]),
      showCommercialPartyPanel
        ? db.seeraPartner.findMany({
            where: { type: { in: ["DISTRIBUTOR", "COMPANY_DIRECT"] }, lifecycle: "ACTIVE" },
            select: { id: true, legalName: true, tradeName: true, type: true },
            orderBy: { legalName: "asc" },
          })
        : Promise.resolve([]),
    ]);
    return (
      <>
        {head(x.businessName)}
        <Fields
          items={[
            { label: "Retailer code", value: x.code },
            { label: "Owner", value: x.ownerName ?? "Not provided" },
            { label: "Mobile", value: x.mobile ?? "Not provided" },
            { label: "Shop type", value: x.shopType ?? "Not classified" },
            { label: "Classification", value: x.classification ?? "—" },
            { label: "Lifecycle", value: x.lifecycle },
            { label: "Source", value: x.source === "UNPLANNED_FIELD_ADDED" ? "Field-added (unplanned)" : "Planned" },
            { label: "GSTIN", value: x.gstin ?? "Not provided" },
            { label: "Total ordered", value: money(totalOrdered) },
            { label: "Total collected", value: money(totalCollected) },
            { label: "Outstanding (estimated)", value: money(outstanding) },
          ]}
        />
        {showRetailerActions && (
          <RetailerActions
            language={language}
            retailerId={x.id}
            followUps={followUps.map((f) => ({
              id: f.id,
              type: f.type,
              dueDate: f.dueDate.toISOString(),
              priority: f.priority,
              note: f.note,
            }))}
            photos={photos.map((p) => ({
              id: p.id,
              photoType: p.photoType,
              capturedAt: p.capturedAt.toISOString(),
              secureUrl: p.secureUrl,
            }))}
          />
        )}
        {showCommercialPartyPanel && (
          <AssignRetailerCommercialPartyPanel
            language={language}
            retailerId={x.id}
            currentPartnerId={x.distributorId}
            parties={commercialParties.map((p) => ({ id: p.id, label: p.tradeName ?? p.legalName, type: p.type as "DISTRIBUTOR" | "COMPANY_DIRECT" }))}
          />
        )}
        <section className={styles.panel}>
          <h2>{hi ? "हाल के ऑर्डर" : "Recent orders"}</h2>
          {x.orders.length === 0 && (
            <p className={styles.readOnly}>
              {hi ? "कोई ऑर्डर उपलब्ध नहीं है।" : "No orders available."}
            </p>
          )}
          {x.orders.map((o) => (
            <Link key={o.id} href={`/portal/${portal}/orders/${o.id}`}>
              {o.orderNumber} · {o.status} · {money(o.total)}
            </Link>
          ))}
        </section>
        <section className={styles.panel}>
          <h2>{hi ? "हाल की विज़िट" : "Recent visits"}</h2>
          {x.visits.length === 0 ? (
            <p className={styles.readOnly}>
              {hi ? "कोई विज़िट उपलब्ध नहीं है।" : "No visits available."}
            </p>
          ) : (
            x.visits.map((v) => (
              <p key={v.id}>
                {text(v.checkedInAt)} · {v.outcome}
                {v.notes ? ` · ${v.notes}` : ""}
              </p>
            ))
          )}
        </section>
      </>
    );
  }
  if (item.kind === "inventory") {
    const x = await db.seeraInventoryMovement.findFirst({
      where: { id, ...(party ? { partyId: { in: party } } : {}) },
      include: { sku: true },
    });
    if (!x) notFound();
    return (
      <>
        {head(`${x.sku.code} · ${x.sku.productName}`)}
        <Fields
          items={[
            { label: "Movement", value: x.type },
            { label: "Direction", value: x.direction },
            { label: "Quantity", value: text(x.quantity) },
            { label: "Party", value: x.partyType },
            { label: "Source", value: x.sourceType },
            { label: "Reference", value: x.reference ?? "—" },
            { label: "Reason", value: x.reason },
            { label: "Occurred", value: text(x.occurredAt) },
          ]}
        />
        <p className={styles.readOnly}>
          {hi
            ? "अपरिवर्तनीय स्टॉक गतिविधि; सुधार नई नियंत्रित गतिविधि से होता है।"
            : "Immutable stock movement; correction requires a new governed movement."}
        </p>
      </>
    );
  }
  if (item.kind === "deliveries") {
    const x = await db.seeraDelivery.findFirst({
      where: {
        id,
        ...(portal === "distributor"
          ? {
              OR: [
                { deliveryUserId: userId },
                ...(party
                  ? [
                      {
                        order: {
                          OR: [
                            { buyerPartnerId: { in: party } },
                            { sellerPartnerId: { in: party } },
                          ],
                        },
                      },
                    ]
                  : []),
              ],
            }
          : {}),
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            retailer: { select: { businessName: true, mobile: true } },
            lines: true,
          },
        },
      },
    });
    if (!x) notFound();
    return (
      <>
        {head(x.order.orderNumber)}
        {canExecuteDelivery &&
          ["PENDING", "RESCHEDULED"].includes(x.status) && (
            <DeliveryActions
              language={language}
              deliveries={[{id:x.id,orderId:x.orderId,label:x.order.orderNumber,lines:x.order.lines.map((line) => ({
                id: line.id,
                label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
                remaining: Math.max(
                  0,
                  Number(line.dispatchedQuantity) -
                    Number(line.deliveredQuantity) -
                    Number(line.refusedQuantity) -
                    Number(line.returnedQuantity),
                ),
              }))}]}
            />
          )}
        <Fields
          items={[
            { label: "Retailer", value: x.order.retailer?.businessName ?? "—" },
            {
              label: "Retailer mobile",
              value: x.order.retailer?.mobile ?? "—",
            },
            { label: "Status", value: x.status },
            { label: "Receiver", value: x.receiverName ?? "—" },
            { label: "Reason", value: x.reason ?? "—" },
            { label: "Occurred", value: text(x.occurredAt) },
          ]}
        />
        <p className={styles.readOnly}>
          {hi
            ? "डिलीवरी कार्रवाई केवल अधिकृत कार्यप्रवाह में उपलब्ध है।"
            : "Delivery actions are available only through the authorized workflow."}
        </p>
      </>
    );
  }
  if (item.kind === "documents") {
    const x = await db.seeraCommercialDocument.findFirst({
      where: {
        id,
        ...(party
          ? { OR: [{ issuerId: { in: party } }, { buyerId: { in: party } }] }
          : {}),
      },
      include: { shareGrants: { orderBy: { createdAt: "desc" } } },
    });
    if (!x) notFound();
    return (
      <>
        {head(x.documentNumber)}
        <Fields
          items={[
            { label: "Type", value: x.type },
            { label: "Status", value: x.status },
            { label: "Issuer", value: x.issuerType },
            { label: "Buyer", value: x.buyerType },
            { label: "Issue date", value: text(x.issueDate) },
            {
              label: "GST",
              value: `CGST ${money(x.cgstTotal)} · SGST ${money(x.sgstTotal)} · IGST ${money(x.igstTotal)}`,
            },
            { label: "Grand total", value: money(x.grandTotal) },
            { label: "Verification", value: x.verificationStatus },
          ]}
        />
        <div className={styles.actions}>
          {x.status !== "DRAFT" && (
            <Link href={`/api/documents/${x.id}/download`}>
              {hi ? "PDF डाउनलोड / प्रिंट" : "Download / print PDF"}
            </Link>
          )}
        </div>
        {canShareDocument && x.status !== "DRAFT" && (
          <DocumentShareActions
            language={language}
            documentId={x.id}
            grants={x.shareGrants.map((g) => ({
              id: g.id,
              recipientType: g.recipientType,
              recipientId: g.recipientId,
              expiresAt: text(g.expiresAt),
              revokedAt: g.revokedAt ? text(g.revokedAt) : null,
              accessCount: g.accessCount,
            }))}
          />
        )}
      </>
    );
  }
  if (item.kind === "finance") {
    const p = await db.seeraPaymentRecord.findFirst({
      where: {
        id,
        ...(party
          ? { OR: [{ payerId: { in: party } }, { payeeId: { in: party } }] }
          : {}),
      },
      include: { allocations: { orderBy: { allocatedAt: "desc" } } },
    });
    if (p)
      return (
        <>
          {head(p.paymentNumber)}
          <Fields
            items={[
              { label: "Status", value: p.status },
              { label: "Reference", value: p.reference },
              { label: "Mode", value: p.paymentMode },
              { label: "Claimed", value: money(p.amountClaimed) },
              { label: "Matched", value: money(p.amountMatched) },
              { label: "Unapplied", value: money(p.unappliedAmount) },
              { label: "Date", value: text(p.paymentDate) },
            ]}
          />
          <section className={styles.timeline}>
            {p.allocations.map((a) => (
              <article key={a.id}>
                <time>{text(a.allocatedAt)}</time>
                <strong>
                  {money(a.amount)} · {a.status}
                </strong>
                <p>{a.reason}</p>
              </article>
            ))}
          </section>
        </>
      );
    const c = await db.seeraCollectionEntry.findFirst({
      where: { id, ...(employees ? { actorId: { in: employees } } : {}) },
    });
    if (c) {
      const retailer = await db.seeraRetailer.findUnique({
        where: { id: c.retailerId },
        select: { businessName: true },
      });
      return (
        <>
          {head(retailer?.businessName ?? c.retailerId)}
          <Fields
            items={[
              { label: "Amount", value: money(c.amount) },
              { label: "Mode", value: c.paymentMode },
              { label: "Reference", value: text(c.reference ?? c.invoiceRef) },
              { label: "Remarks", value: text(c.remarks) },
              { label: "Collected", value: text(c.collectedAt) },
            ]}
          />
        </>
      );
    }
    const x = await db.seeraFinancialEntry.findFirst({
      where: {
        id,
        ...(party
          ? {
              OR: [
                { debitPartyId: { in: party } },
                { creditPartyId: { in: party } },
              ],
            }
          : {}),
      },
    });
    if (!x) notFound();
    return (
      <>
        {head(x.entryNumber)}
        <Fields
          items={[
            { label: "Type", value: x.type },
            { label: "Status", value: x.status },
            { label: "Amount", value: money(x.amount) },
            { label: "Reason", value: x.reason },
            { label: "Posted", value: text(x.postedAt) },
            { label: "Reversed", value: text(x.reversedAt) },
          ]}
        />
        <p className={styles.readOnly}>
          {hi
            ? "पोस्ट किया गया खाता रिकॉर्ड अपरिवर्तनीय है।"
            : "A posted ledger record is immutable; correction uses a linked reversal."}
        </p>
      </>
    );
  }
  if (item.kind === "travel") {
    const x = await db.seeraTaClaim.findFirst({
      where: {
        id,
        ...(employees
          ? { employeeId: { in: employees } }
          : scope.organizationWide
            ? {}
            : { employeeId: userId }),
      },
    });
    if (!x) notFound();
    return (
      <>
        {head(x.claimNumber)}
        <Fields
          items={[
            { label: "Status", value: x.status },
            { label: "Claim date", value: text(x.claimDate) },
            { label: "Vehicle", value: x.vehicleType },
            { label: "Estimated km", value: text(x.originalDistanceKm) },
            { label: "Claimed km", value: text(x.claimedDistanceKm) },
            { label: "Approved km", value: text(x.approvedDistanceKm) },
            { label: "Claimed total", value: money(x.totalClaimed) },
            {
              label: "Approved total",
              value: x.totalApproved ? money(x.totalApproved) : "Pending",
            },
          ]}
        />
        <p className={styles.readOnly}>
          {hi
            ? "जीपीएस दूरी केवल अनुमान है; भुगतान स्वतंत्र अनुमोदन के बाद होता है।"
            : "GPS distance is an estimate only; payment follows independent approval."}
        </p>
      </>
    );
  }
  if (item.kind === "audit") {
    if (!scope.organizationWide) notFound();
    const x = await db.auditLog.findFirst({ where: { id } });
    if (!x) notFound();
    return (
      <>
        {head(x.action)}
        <Fields
          items={[
            { label: "Entity", value: x.entityType },
            { label: "Outcome", value: x.outcome },
            { label: "Reason", value: x.reason ?? "—" },
            { label: "Time", value: text(x.occurredAt) },
          ]}
        />
        <p className={styles.readOnly}>
          {hi
            ? "केवल-पठन नियंत्रित ऑडिट प्रमाण।"
            : "Read-only governed audit evidence."}
        </p>
      </>
    );
  }
  if (item.kind === "employee") {
    const x = await db.seeraEmployeeDocument.findFirst({ where: { id, employeeId: userId } });
    if (!x) notFound();
    return (
      <>
        {head(x.title)}
        <Fields
          items={[
            { label: "Type", value: x.type },
            { label: "Period", value: x.periodLabel ?? "—" },
            { label: "Notes", value: x.notes ?? "—" },
            { label: "Issued", value: text(x.createdAt) },
          ]}
        />
        <div className={styles.actions}>
          <Link href={`/api/field/employee-documents/${x.id}`}>
            {hi ? "डाउनलोड / प्रिंट" : "Download / print"}
          </Link>
        </div>
        <p className={styles.readOnly}>
          {hi
            ? "यह आपका निजी दस्तावेज़ है — केवल आप इसे देख सकते हैं।"
            : "This is your personal document — visible only to you."}
        </p>
      </>
    );
  }
  notFound();
}
