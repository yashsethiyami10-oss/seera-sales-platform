import Link from "next/link";
import { notFound } from "next/navigation";
import type { PrismaClient, UiLanguage } from "@prisma/client";
import type { SurfaceItem } from "@/lib/foundation/product-surface";
import { requireSurfaceAccess } from "@/lib/foundation/surface-access";
import { PageHeading } from "@/components/seera/foundation/States";
import styles from "./ProductSurface.module.css";
import { PartnerLifecycleActions } from "./WorkflowActions";
import { DeliveryActions } from "./DeliveryActions";

type Field = { label: string; value: string };
const money = (v: unknown) =>
    `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
  text = (v: unknown) =>
    v == null || v === ""
      ? "—"
      : v instanceof Date
        ? v.toLocaleString("en-IN")
        : String(v);
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
  canManageLifecycle = false,
  canExecuteDelivery = false,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  item: SurfaceItem;
  id: string;
  language: UiLanguage;
  canManageLifecycle?: boolean;
  canExecuteDelivery?: boolean;
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
          hi
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
        retailer: { select: { businessName: true } },
        lines: true,
        deliveries: { orderBy: { createdAt: "desc" } },
        promises: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!x) notFound();
    return (
      <>
        {head(x.orderNumber)}
        <Fields
          items={[
            { label: "Status", value: x.status },
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
        <section className={styles.panel}>
          <h2>{hi ? "आइटम और पूर्ति" : "Items & fulfilment"}</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Ordered</th>
                  <th>Accepted</th>
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
                    <td>{text(l.acceptedQuantity)}</td>
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
    const x = await db.seeraPartner.findFirst({
      where: { id, ...(party ? { id: { in: party } } : {}) },
      include: {
        creditTerms: { orderBy: { effectiveFrom: "desc" } },
        users: { where: { active: true } },
      },
    });
    if (!x) notFound();
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
        {canManageLifecycle && (
          <PartnerLifecycleActions
            partnerId={x.id}
            lifecycle={x.lifecycle}
            language={language}
            approvers={approvers.map((a) => ({
              value: a.id,
              label: a.name ?? a.email,
            }))}
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
          ]}
        />
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
                  label: "Grace",
                  value: credit.graceEnabled
                    ? `${credit.graceDays} days`
                    : "Disabled",
                },
                { label: "Reason", value: credit.changeReason },
              ]}
            />
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
    return (
      <>
        {head(x.businessName)}
        <Fields
          items={[
            { label: "Retailer code", value: x.code },
            { label: "Owner", value: x.ownerName },
            { label: "Mobile", value: x.mobile },
            { label: "Shop type", value: x.shopType },
            { label: "Classification", value: x.classification ?? "—" },
            { label: "Lifecycle", value: x.lifecycle },
            { label: "GSTIN", value: x.gstin ?? "Not provided" },
          ]}
        />
        <section className={styles.panel}>
          <h2>{hi ? "हाल के ऑर्डर" : "Recent orders"}</h2>
          {x.orders.map((o) => (
            <Link key={o.id} href={`/portal/${portal}/orders/${o.id}`}>
              {o.orderNumber} · {o.status} · {money(o.total)}
            </Link>
          ))}
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
              deliveryId={x.id}
              language={language}
              lines={x.order.lines.map((line) => ({
                id: line.id,
                label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
                remaining: Math.max(
                  0,
                  Number(line.dispatchedQuantity) -
                    Number(line.deliveredQuantity) -
                    Number(line.refusedQuantity),
                ),
              }))}
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
          {x.generatedFileId && (
            <Link href={`/api/documents/${x.id}/download`}>
              {hi ? "PDF डाउनलोड / प्रिंट" : "Download / print PDF"}
            </Link>
          )}
        </div>
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
  notFound();
}
