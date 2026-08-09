import Link from "next/link";
import type { PrismaClient, UiLanguage } from "@prisma/client";
import { analyticsScope, type AnalyticsPortal } from "@/lib/phase-10/scope";
import type { SurfaceItem } from "@/lib/foundation/product-surface";
import { surfaceLabel } from "@/lib/foundation/product-surface";
import { EmptyState, PageHeading } from "@/components/seera/foundation/States";
import styles from "./ProductSurface.module.css";
import { WorkflowActions } from "./WorkflowActions";
import { FieldJourney } from "./FieldJourney";
import { DistributionActions } from "./DistributionActions";
import { PaymentProofReviewActions } from "./PaymentProofReviewActions";
import { PartnerFinanceActions } from "./PartnerFinanceActions";
import { DocumentActions } from "./DocumentActions";
import { RetailerOrderActions } from "./RetailerOrderActions";
import { ApprovalActions, MasterActions } from "./GovernedActions";
import { FinanceControlActions } from "./FinanceControlActions";
import { ManagerFieldActions } from "./ManagerFieldActions";
import { documentSelectorData } from "@/lib/sales-distribution/document-portal-service";

type Row = {
  id: string;
  primary: string;
  secondary?: string;
  status?: string;
  metric?: string;
  date?: Date | null;
};
const DETAIL_KINDS = new Set([
  "orders",
  "partners",
  "retailers",
  "inventory",
  "deliveries",
  "documents",
  "finance",
  "travel",
  "audit",
]);
const money = (value: unknown) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const date = (value: Date | null | undefined, language: UiLanguage) =>
  value ? value.toLocaleDateString(language === "HI" ? "hi-IN" : "en-IN") : "—";
const scopePortal = (portal: string): AnalyticsPortal =>
  portal === "auditor"
    ? "founder-admin"
    : portal === "company-admin"
      ? "company-admin"
      : (portal as AnalyticsPortal);

async function rowsFor(
  db: PrismaClient,
  userId: string,
  portal: string,
  item: SurfaceItem,
  q: string,
  skip: number,
): Promise<Row[]> {
  const scope = await analyticsScope(db, userId, scopePortal(portal));
  const party = scope.partyIds,
    employees = scope.employeeIds,
    retailerIds = scope.retailerIds,
    take = 30;
  if (item.kind === "orders")
    return (
      await db.seeraSalesOrder.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { orderNumber: { contains: q, mode: "insensitive" } },
                  { notes: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
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
          _count: { select: { lines: true, deliveries: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.orderNumber,
      secondary: `${x.sellerPartner?.legalName ?? "Company / party"} → ${x.buyerPartner?.legalName ?? "Retailer / party"} · ${x._count.lines} items`,
      status: x.status,
      metric: money(x.total),
      date: x.createdAt,
    }));
  if (item.kind === "partners")
    return (
      await db.seeraPartner.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { legalName: { contains: q, mode: "insensitive" } },
                  { tradeName: { contains: q, mode: "insensitive" } },
                  { code: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(item.slug === "super-stockists"
            ? { type: "SUPER_STOCKIST" }
            : item.slug === "distributors"
              ? { type: "DISTRIBUTOR" }
              : {}),
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.tradeName ?? x.legalName,
      secondary: `${x.code} · ${x.type}`,
      status: x.lifecycle,
      date: x.updatedAt,
    }));
  if (item.kind === "retailers")
    return (
      await db.seeraRetailer.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { businessName: { contains: q, mode: "insensitive" } },
                  { code: { contains: q, mode: "insensitive" } },
                  { mobile: { contains: q } },
                ],
              }
            : {}),
          ...(party ? { distributorId: { in: party } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.businessName,
      secondary: `${x.code} · ${x.shopType}`,
      status: x.lifecycle,
      date: x.updatedAt,
    }));
  if (item.kind === "inventory")
    return (
      await db.seeraInventoryMovement.findMany({
        where: {
          ...(party ? { partyId: { in: party } } : {}),
          ...(q
            ? {
                OR: [
                  { sourceType: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                  { sku: { code: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: { sku: { select: { code: true, productName: true } } },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: `${x.sku.code} · ${x.sku.productName}`,
      secondary: `${x.type} · ${x.direction} · ${x.reason}`,
      status: x.partyType,
      metric: String(x.quantity),
      date: x.occurredAt,
    }));
  if (item.kind === "deliveries")
    return (
      await db.seeraDelivery.findMany({
        where: {
          ...(party
            ? {
                order: {
                  OR: [
                    { buyerPartnerId: { in: party } },
                    { sellerPartnerId: { in: party } },
                  ],
                },
              }
            : {}),
          ...(q
            ? {
                OR: [
                  {
                    order: {
                      orderNumber: { contains: q, mode: "insensitive" },
                    },
                  },
                  { receiverName: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              retailer: { select: { businessName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.order.orderNumber,
      secondary: x.order.retailer?.businessName ?? x.receiverName ?? "Delivery",
      status: x.status,
      date: x.createdAt,
    }));
  if (item.kind === "documents")
    return (
      await db.seeraCommercialDocument.findMany({
        where: {
          ...(party
            ? { OR: [{ issuerId: { in: party } }, { buyerId: { in: party } }] }
            : {}),
          ...(q
            ? {
                OR: [{ documentNumber: { contains: q, mode: "insensitive" } }],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.documentNumber ?? `${x.type} draft`,
      secondary: `${x.issuerType} → ${x.buyerType}`,
      status: x.status,
      metric: money(x.grandTotal),
      date: x.issuedAt ?? x.createdAt,
    }));
  if (item.kind === "finance") {
    if (
      [
        "payments",
        "receipts",
        "payment-inbox",
        "allocations",
        "reconciliation",
      ].includes(item.slug)
    )
      return (
        await db.seeraPaymentRecord.findMany({
          where: {
            ...(party
              ? { OR: [{ payerId: { in: party } }, { payeeId: { in: party } }] }
              : {}),
            ...(q
              ? {
                  OR: [
                    { paymentNumber: { contains: q, mode: "insensitive" } },
                    { reference: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        })
      ).map((x) => ({
        id: x.id,
        primary: x.paymentNumber,
        secondary: `${x.paymentMode} · ${x.reference}`,
        status: x.status,
        metric: money(x.amountClaimed),
        date: x.paymentDate,
      }));
    return (
      await db.seeraFinancialEntry.findMany({
        where: {
          ...(party
            ? {
                OR: [
                  { debitPartyId: { in: party } },
                  { creditPartyId: { in: party } },
                ],
              }
            : {}),
          ...(q
            ? {
                OR: [
                  { entryNumber: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.entryNumber,
      secondary: `${x.type} · ${x.reason}`,
      status: x.status,
      metric: money(x.amount),
      date: x.postedAt ?? x.createdAt,
    }));
  }
  if (item.kind === "field") {
    if (
      ["visits", "retailing", "partner-visits", "joint-working"].includes(
        item.slug,
      )
    )
      return (
        await db.seeraVisit.findMany({
          where: {
            ...(employees
              ? { workSession: { employeeId: { in: employees } } }
              : {}),
            ...(q
              ? {
                  OR: [
                    { notes: { contains: q, mode: "insensitive" } },
                    {
                      retailer: {
                        businessName: { contains: q, mode: "insensitive" },
                      },
                    },
                  ],
                }
              : {}),
          },
          include: {
            retailer: { select: { businessName: true } },
            workSession: { select: { employeeRole: true } },
          },
          orderBy: { checkedInAt: "desc" },
          skip,
          take,
        })
      ).map((x) => ({
        id: x.id,
        primary: x.retailer?.businessName ?? "Partner visit",
        secondary: x.workSession.employeeRole,
        status: x.outcome,
        date: x.checkedInAt,
      }));
    return (
      await db.seeraWorkSession.findMany({
        where: {
          ...(employees ? { employeeId: { in: employees } } : {}),
          ...(q ? { remarks: { contains: q, mode: "insensitive" } } : {}),
        },
        orderBy: { startedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.employeeRole.replaceAll("_", " "),
      secondary: x.workingType,
      status: x.status,
      date: x.startedAt,
    }));
  }
  if (item.kind === "team")
    return (
      await db.user.findMany({
        where: {
          ...(employees ? { id: { in: employees } } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          roleAssignments: {
            where: { status: "ACTIVE" },
            include: { role: true },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.name ?? x.email,
      secondary: x.roleAssignments.map((a) => a.role.name).join(", "),
      status: x.status,
      date: x.updatedAt,
    }));
  if (item.kind === "prospects")
    return (
      await db.seeraProspect.findMany({
        where: {
          ...(employees ? { ownerEmployeeId: { in: employees } } : {}),
          ...(q
            ? {
                OR: [
                  { businessName: { contains: q, mode: "insensitive" } },
                  { normalizedMobile: { contains: q } },
                  { areaId: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.businessName,
      secondary: `${x.normalizedMobile} · ${x.areaId ?? "—"}`,
      status: x.status,
      date: x.updatedAt,
    }));
  if (item.kind === "approvals")
    return (
      await db.seeraApprovalItem.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { entityType: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.entityType,
      secondary: x.reason ?? x.type,
      status: x.status,
      date: x.createdAt,
    }));
  if (item.kind === "claims")
    return (
      await db.seeraClaim.findMany({
        where: {
          ...(party ? { claimantId: { in: party } } : {}),
          ...(q
            ? {
                OR: [
                  { claimNumber: { contains: q, mode: "insensitive" } },
                  { type: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.claimNumber,
      secondary: `${x.claimantType} → ${x.againstPartyType}`,
      status: x.status,
      date: x.createdAt,
    }));
  if (item.kind === "travel")
    return (
      await db.seeraTaClaim.findMany({
        where: {
          ...(employees ? { employeeId: { in: employees } } : {}),
          ...(q
            ? {
                OR: [
                  { claimNumber: { contains: q, mode: "insensitive" } },
                  { remarks: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.claimNumber,
      secondary: x.vehicleType,
      status: x.status,
      metric: money(x.totalApproved ?? x.totalClaimed),
      date: x.claimDate,
    }));
  if (item.kind === "masters")
    return (
      await db.seeraSku.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: "insensitive" } },
                  { productName: { contains: q, mode: "insensitive" } },
                  { category: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { productName: "asc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.productName,
      secondary: `${x.code} · ${x.packSize} ${x.unitType}`,
      status: x.status,
      metric: money(x.mrp),
      date: x.updatedAt,
    }));
  if (item.kind === "audit")
    return (
      await db.auditLog.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { action: { contains: q, mode: "insensitive" } },
                  { entityType: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.action,
      secondary: `${x.actor?.name ?? x.actor?.email ?? "System"} · ${x.entityType}`,
      status: x.outcome,
      date: x.occurredAt,
    }));
  if (item.kind === "automation" || item.kind === "analytics")
    return (
      await db.seeraInsight.findMany({
        where: {
          recipientId: userId,
          ...(q
            ? {
                OR: [
                  { ruleCode: { contains: q, mode: "insensitive" } },
                  { explanationKey: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { generatedAt: "desc" },
        skip,
        take,
      })
    ).map((x) => ({
      id: x.id,
      primary: x.ruleCode.replaceAll("_", " "),
      secondary: x.explanationKey,
      status: x.status,
      metric: x.severity,
      date: x.generatedAt,
    }));
  return [];
}

export async function OperationalWorkspace({
  db,
  userId,
  portal,
  item,
  language,
  query,
  permissions,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  item: SurfaceItem;
  language: UiLanguage;
  query: Record<string, string | undefined>;
  permissions: Set<string>;
}) {
  const q = (query.q ?? "").trim(),
    page = Math.max(1, Number(query.page) || 1),
    rows = await rowsFor(db, userId, portal, item, q, (page - 1) * 30),
    hi = language === "HI",
    base = `/portal/${portal}/${item.slug}`;
  let workflow: React.ReactNode = null;
  if (portal === "sales-executive" && item.slug === "today") {
    const now = new Date(),
      session = await db.seeraWorkSession.findFirst({
        where: {
          employeeId: userId,
          employeeRole: "SALES_EXECUTIVE",
          status: "ACTIVE",
        },
        orderBy: { startedAt: "desc" },
      }),
      visit = session
        ? await db.seeraVisit.findFirst({
            where: { workSessionId: session.id, checkedOutAt: null },
            include: { retailer: { select: { businessName: true } } },
          })
        : null,
      retailers = await db.seeraRetailer.findMany({
        where: { salespersonId: userId, lifecycle: "ACTIVE" },
        select: { id: true, businessName: true, code: true, shopType: true },
        orderBy: { businessName: "asc" },
        take: 150,
      }),
      skus = await db.seeraSku.findMany({
        where: {
          status: "ACTIVE",
          prices: {
            some: {
              tier: "DISTRIBUTOR_TO_RETAILER",
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
          },
        },
        include: {
          prices: {
            where: {
              tier: "DISTRIBUTOR_TO_RETAILER",
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
        orderBy: { productName: "asc" },
        take: 150,
      });
    workflow = (
      <FieldJourney
        language={language}
        session={
          session
            ? { id: session.id, startedAt: session.startedAt.toISOString() }
            : undefined
        }
        visit={
          visit?.retailerId
            ? {
                id: visit.id,
                retailerId: visit.retailerId,
                retailerName: visit.retailer?.businessName ?? "Retailer",
              }
            : undefined
        }
        retailers={retailers.map((x) => ({
          id: x.id,
          label: x.businessName,
          detail: `${x.code} · ${x.shopType}`,
        }))}
        skus={skus.map((x) => ({
          id: x.id,
          label: `${x.code} · ${x.productName}`,
          price: money(x.prices[0]?.amount ?? x.mrp),
        }))}
      />
    );
  } else if (portal === "sales-manager" && item.slug === "my-day") {
    const active = await db.seeraWorkSession.findFirst({
      where: { employeeId: userId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    workflow = (
      <WorkflowActions
        kind="manager-day"
        language={language}
        activeId={active?.id}
      />
    );
  } else if (
    portal === "sales-manager" &&
    ["distributor-search", "prospects"].includes(item.slug)
  ) {
    workflow = <WorkflowActions kind="prospect" language={language} />;
  } else if (
    portal === "sales-manager" &&
    item.slug === "retailing" &&
    permissions.has("manager_field:operate")
  ) {
    const session = await db.seeraWorkSession.findFirst({
      where: {
        employeeId: userId,
        employeeRole: "SALES_MANAGER",
        status: "ACTIVE",
        workingType: { in: ["RETAILING", "MARKET_WORKING"] },
      },
      orderBy: { startedAt: "desc" },
    });
    const visit = session
      ? await db.seeraVisit.findFirst({
          where: { workSessionId: session.id, checkedOutAt: null },
        })
      : null;
    const team = await db.seeraAssignment.findMany({
      where: {
        assignmentType: "MANAGER_TEAM",
        targetId: userId,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const retailers = await db.seeraRetailer.findMany({
      where: {
        lifecycle: "ACTIVE",
        salespersonId: { in: [userId, ...team.map((x) => x.subjectId)] },
      },
      select: { id: true, businessName: true, code: true },
      orderBy: { businessName: "asc" },
      take: 150,
    });
    workflow = (
      <ManagerFieldActions
        kind="retailing"
        language={language}
        sessionId={session?.id}
        activeVisit={visit?.id}
        retailers={retailers.map((x) => ({
          value: x.id,
          label: x.businessName,
          meta: x.code,
        }))}
      />
    );
  } else if (
    portal === "sales-manager" &&
    item.slug === "joint-working" &&
    permissions.has("joint_work:participate")
  ) {
    const joint = await db.seeraJointWork.findFirst({
      where: { managerId: userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    const assignments = await db.seeraAssignment.findMany({
      where: {
        assignmentType: "MANAGER_TEAM",
        targetId: userId,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const executives = await db.user.findMany({
      where: {
        id: { in: assignments.map((x) => x.subjectId) },
        status: "ACTIVE",
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    const visits = joint
      ? await db.seeraVisit.findMany({
          where: {
            checkedInAt: { gte: joint.startedAt },
            workSession: { employeeId: joint.salesExecutiveId },
          },
          include: { retailer: { select: { businessName: true } } },
          orderBy: { checkedInAt: "desc" },
          take: 50,
        })
      : [];
    workflow = (
      <ManagerFieldActions
        kind="joint"
        language={language}
        activeJoint={joint?.id}
        executives={executives.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
        visits={visits.map((x) => ({
          value: x.id,
          label: x.retailer?.businessName ?? "Field visit",
          meta: date(x.checkedInAt, language),
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    ["payments", "payment-inbox", "reconciliation"].includes(item.slug)
  ) {
    const payments = await db.seeraPaymentRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const proofs=item.slug==="payment-inbox"&&permissions.has("payment_proof:review")?await db.seeraPaymentProof.findMany({where:{status:{notIn:["VERIFIED","REJECTED"]}},include:{order:{select:{orderNumber:true,total:true}}},orderBy:{submittedAt:"asc"},take:50}):[];
    workflow = <><WorkflowActions kind="finance-payment" language={language} options={payments.map((x) => ({value:x.id,label:x.paymentNumber,meta:`${x.status} · ${money(x.amountClaimed)}`}))}/>{item.slug==="payment-inbox"&&<PaymentProofReviewActions language={language} options={proofs.map((x)=>({value:x.id,label:x.order.orderNumber,meta:`${x.status} · ${money(x.amount)} / ${money(x.order.total)}`}))}/>}</>;
  } else if (
    portal === "accounts" &&
    item.slug === "allocations" &&
    permissions.has("payment:allocate")
  ) {
    const payments = await db.seeraPaymentRecord.findMany({
      where: {
        status: { in: ["VERIFIED", "PARTIALLY_MATCHED", "ADVANCE_HELD"] },
        unappliedAmount: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const documents = await db.seeraCommercialDocument.findMany({
      where: {
        status: "ISSUED",
        type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "DEBIT_NOTE"] },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    workflow = (
      <FinanceControlActions
        kind="allocate"
        language={language}
        primary={payments.map((x) => ({
          value: x.id,
          label: x.paymentNumber,
          meta: money(x.unappliedAmount),
        }))}
        secondary={documents.map((x) => ({
          value: x.id,
          label: x.documentNumber,
          meta: money(x.grandTotal),
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "reversals" &&
    permissions.has("ledger:reverse")
  ) {
    const entries = await db.seeraFinancialEntry.findMany({
      where: { status: "POSTED", originalEntryId: null },
      orderBy: { postedAt: "desc" },
      take: 50,
    });
    const approvers = await db.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: {
              permissions: { some: { permission: { code: "ledger:reverse" } } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    workflow = (
      <FinanceControlActions
        kind="reverse"
        language={language}
        primary={entries.map((x) => ({
          value: x.id,
          label: x.entryNumber,
          meta: money(x.amount),
        }))}
        approvers={approvers.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "claims" &&
    permissions.has("claim_settlement:manage")
  ) {
    const settled = await db.seeraClaimSettlement.findMany({
      select: { claimId: true },
    });
    const claims = await db.seeraClaim.findMany({
      where: {
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
        id: { notIn: settled.map((x) => x.claimId) },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const approvers = await db.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: {
              permissions: {
                some: { permission: { code: "claim_settlement:manage" } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    workflow = (
      <FinanceControlActions
        kind="settle-claim"
        language={language}
        primary={claims.map((x) => ({
          value: x.id,
          label: x.claimNumber,
          meta: x.type,
        }))}
        approvers={approvers.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
      />
    );
  } else if (
    portal === "accounts" &&
    item.slug === "ta-expenses" &&
    permissions.has("ta_claim:approve")
  ) {
    const claims = await db.seeraTaClaim.findMany({
      where: { status: "MANAGER_VERIFIED", employeeId: { not: userId } },
      orderBy: { claimDate: "asc" },
      take: 50,
    });
    const employees = await db.user.findMany({
      where: { id: { in: claims.map((x) => x.employeeId) } },
      select: { id: true, name: true, email: true },
    });
    const approvers = await db.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        roleAssignments: {
          some: {
            status: "ACTIVE",
            role: {
              permissions: {
                some: { permission: { code: "ta_claim:approve" } },
              },
            },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 50,
    });
    const company = await db.seeraBillingProfile.findFirst({
      where: {
        ownerType: "COMPANY",
        authorizedBilling: true,
        verificationStatus: "VERIFIED",
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
      select: { ownerId: true },
    });
    workflow = company ? (
      <FinanceControlActions
        kind="approve-ta"
        language={language}
        primary={claims.map((x) => ({
          value: x.id,
          label: x.claimNumber,
          meta: money(x.totalApproved),
        }))}
        secondary={employees.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
        approvers={approvers.map((x) => ({
          value: x.id,
          label: x.name ?? x.email,
        }))}
        companyId={company.ownerId}
      />
    ) : null;
  } else if (portal === "sales-manager" && item.slug === "ta-verification") {
    const claims = await db.seeraTaClaim.findMany({
      where: { managerId: userId, status: "SUBMITTED" },
      orderBy: { claimDate: "desc" },
      take: 50,
    });
    workflow = (
      <WorkflowActions
        kind="ta-verify"
        language={language}
        options={claims.map((x) => ({
          value: x.id,
          label: x.claimNumber,
          meta: `${x.vehicleType} · ${x.claimedDistanceKm} km`,
        }))}
      />
    );
  } else if (
    item.slug === "documents" &&
    (permissions.has("document:issue") ||
      permissions.has("document:upload") ||
      permissions.has("system:super_admin"))
  ) {
    const data = await documentSelectorData(db, userId, portal);
    workflow = (
      <DocumentActions
        language={language}
        portal={portal}
        canIssue={data.mayIssue}
        canUpload={data.mayUpload}
        issuers={data.profiles.map((x) => ({
          id: x.ownerId,
          type: x.ownerType,
          label: `${x.legalName}${x.gstin ? ` · ${x.gstin}` : ""}`,
          snapshot: {
            legalName: x.legalName,
            tradeName: x.tradeName ?? undefined,
            gstin: x.gstin ?? undefined,
            address: JSON.stringify(x.registeredAddress),
            state: x.state,
            stateCode: x.stateCode,
          },
        }))}
        buyers={[
          ...data.partners.map((x) => ({
            id: x.id,
            type: x.type,
            label: x.tradeName ?? x.legalName,
            snapshot: {
              legalName: x.legalName,
              tradeName: x.tradeName ?? undefined,
              gstin: x.gstin ?? undefined,
              address: JSON.stringify(x.addresses),
            },
          })),
          ...data.retailers.map((x) => ({
            id: x.id,
            type: "RETAILER",
            label: x.businessName,
            snapshot: {
              legalName: x.businessName,
              tradeName: x.businessName,
              gstin: x.gstin ?? undefined,
              address: JSON.stringify(x.address),
            },
          })),
        ]}
        skus={data.skus.map((x) => ({
          id: x.id,
          label: `${x.code} · ${x.productName}`,
          hsn: x.hsn ?? undefined,
          unit: x.unitType,
          rate: Number(x.prices[0]?.amount ?? x.mrp),
          taxRate: Number(x.taxRate ?? 0),
        }))}
      />
    );
  } else if (
    item.kind === "approvals" &&
    (permissions.has("approval:decide") ||
      permissions.has("manager_approval:decide"))
  ) {
    const roleCodes = await db.userRoleAssignment.findMany({
      where: { userId, status: "ACTIVE" },
      select: { role: { select: { code: true } } },
    });
    const approvals = await db.seeraApprovalItem.findMany({
      where: permissions.has("system:super_admin")
        ? { status: "PENDING" }
        : {
            status: "PENDING",
            assignedRoleCode: { in: roleCodes.map((x) => x.role.code) },
          },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    workflow = (
      <ApprovalActions
        language={language}
        approvals={approvals.map((x) => ({
          value: x.id,
          label: `${x.type} · ${x.entityType}`,
          meta: x.reason ?? x.status,
        }))}
      />
    );
  } else if (
    item.kind === "masters" &&
    item.slug === "masters" &&
    permissions.has("master:manage")
  ) {
    const skus = await db.seeraSku.findMany({
      orderBy: { productName: "asc" },
      take: 200,
    });
    workflow = (
      <MasterActions
        language={language}
        skus={skus.map((x) => ({
          value: x.id,
          label: `${x.code} · ${x.productName}`,
        }))}
      />
    );
  } else if (
    portal === "retailer" &&
    ["orders", "reorder"].includes(item.slug)
  ) {
    const now = new Date();
    const assignments = await db.seeraAssignment.findMany({
      where: {
        assignmentType: "RETAILER_USER",
        subjectType: "USER",
        subjectId: userId,
        targetType: "RETAILER",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { targetId: true },
    });
    const retailers = await db.seeraRetailer.findMany({
      where: {
        id: { in: assignments.map((x) => x.targetId) },
        lifecycle: "ACTIVE",
      },
      select: { id: true, businessName: true, code: true },
      orderBy: { businessName: "asc" },
    });
    const skus = await db.seeraSku.findMany({
      where: {
        status: "ACTIVE",
        prices: {
          some: {
            tier: "DISTRIBUTOR_TO_RETAILER",
            status: "ACTIVE",
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        },
      },
      include: {
        prices: {
          where: {
            tier: "DISTRIBUTOR_TO_RETAILER",
            status: "ACTIVE",
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
      orderBy: { productName: "asc" },
      take: 200,
    });
    workflow = (
      <RetailerOrderActions
        language={language}
        retailers={retailers.map((x) => ({
          value: x.id,
          label: x.businessName,
          meta: x.code,
        }))}
        skus={skus.map((x) => ({
          value: x.id,
          label: `${x.code} · ${x.productName}`,
          meta: money(x.prices[0]?.amount ?? x.mrp),
        }))}
      />
    );
  } else if (["distributor", "super-stockist"].includes(portal)) {
    const partyType =
        portal === "distributor" ? "DISTRIBUTOR" : "SUPER_STOCKIST",
      links = await db.seeraPartyUser.findMany({
        where: { userId, active: true, partner: { type: partyType } },
        include: { partner: true },
      }),
      parties = links.map((x) => ({
        value: x.partner.id,
        label: x.partner.tradeName ?? x.partner.legalName,
        meta: x.partner.code,
      }));
    if(item.slug==="payments"&&permissions.has("payment_proof:create")){
      workflow=<PartnerFinanceActions kind="payment" language={language} partnerType={partyType} parties={parties}/>;
    } else if(item.slug==="claims"&&permissions.has("distributor_claims:manage")){
      workflow=<PartnerFinanceActions kind="claim" language={language} partnerType={partyType} parties={parties}/>;
    } else if (
      portal === "distributor" &&
      item.slug === "fulfilment" &&
      permissions.has("distributor_orders:fulfil")
    ) {
      const orders = await db.seeraSalesOrder.findMany({
        where: {
          sellerPartnerId: { in: parties.map((x) => x.value) },
          type: "RETAILER_ORDER",
          status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] },
        },
        include: { lines: true, retailer: { select: { businessName: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      workflow = (
        <DistributionActions
          kind="fulfil"
          language={language}
          partyType="DISTRIBUTOR"
          parties={parties}
          orders={orders.map((x) => ({
            id: x.id,
            label: `${x.orderNumber} · ${x.retailer?.businessName ?? "Retailer"}`,
            partnerId: x.sellerPartnerId!,
            lines: x.lines.map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              ordered: Number(line.orderedQuantity),
            })),
          }))}
        />
      );
    } else if (
      portal === "distributor" &&
      item.slug === "replenishment" &&
      permissions.has("distributor_replenishment:create")
    ) {
      const now = new Date();
      const skus = await db.seeraSku.findMany({
        where: {
          status: "ACTIVE",
          prices: {
            some: {
              tier: "SS_TO_DISTRIBUTOR",
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
          },
        },
        orderBy: { productName: "asc" },
        take: 200,
      });
      workflow = (
        <DistributionActions
          kind="replenishment"
          language={language}
          partyType="DISTRIBUTOR"
          parties={parties}
          skus={skus.map((x) => ({
            value: x.id,
            label: `${x.code} · ${x.productName}`,
          }))}
        />
      );
    } else if (
      portal === "super-stockist" &&
      item.slug === "distributor-orders" &&
      permissions.has("super_stockist_orders:fulfil")
    ) {
      const orders = await db.seeraSalesOrder.findMany({
        where: {
          sellerPartnerId: { in: parties.map((x) => x.value) },
          type: "DISTRIBUTOR_REPLENISHMENT",
          status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] },
        },
        include: {
          lines: true,
          buyerPartner: { select: { legalName: true, tradeName: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      workflow = (
        <DistributionActions
          kind="fulfil-stockist"
          language={language}
          partyType="SUPER_STOCKIST"
          parties={parties}
          orders={orders.map((x) => ({
            id: x.id,
            label: `${x.orderNumber} · ${x.buyerPartner?.tradeName ?? x.buyerPartner?.legalName ?? "Distributor"}`,
            partnerId: x.sellerPartnerId!,
            lines: x.lines.map((line) => ({
              id: line.id,
              label: `${line.skuCodeSnapshot} · ${line.productNameSnapshot}`,
              ordered: Number(line.orderedQuantity),
            })),
          }))}
        />
      );
    } else if (
      portal === "super-stockist" &&
      item.slug === "company-orders" &&
      permissions.has("company_replenishment:create")
    ) {
      const pendingCompanyOrders=await db.seeraSalesOrder.findMany({where:{buyerPartnerId:{in:parties.map((x)=>x.value)},type:"COMPANY_REPLENISHMENT",status:"SUBMITTED",paymentProofs:{none:{status:{in:["SUBMITTED","UNDER_REVIEW","MATCHED","PARTIALLY_MATCHED","ADVANCE_HELD","VERIFIED"]}}}},orderBy:{createdAt:"desc"},take:50});
      workflow = (
        <DistributionActions
          kind="company-order"
          language={language}
          partyType="SUPER_STOCKIST"
          parties={parties}
          orders={pendingCompanyOrders.map((x)=>({id:x.id,label:`${x.orderNumber} · ${money(x.total)}`,partnerId:x.buyerPartnerId!,total:Number(x.total),lines:[]}))}
        />
      );
    } else if (item.slug === "stock-reconciliation") {
      const skus = await db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        orderBy: { productName: "asc" },
        take: 200,
      });
      workflow = (
        <DistributionActions
          kind="reconcile"
          language={language}
          partyType={partyType}
          parties={parties}
          skus={skus.map((x) => ({
            value: x.id,
            label: `${x.code} · ${x.productName}`,
          }))}
        />
      );
    } else if (
      ["inventory", "returns-damage"].includes(item.slug) &&
      permissions.has(
        portal === "distributor"
          ? "distributor_inventory:adjust"
          : "super_stockist_inventory:adjust",
      )
    ) {
      const skus = await db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        orderBy: { productName: "asc" },
        take: 200,
      });
      workflow = (
        <DistributionActions
          kind="movement"
          language={language}
          partyType={partyType}
          parties={parties}
          skus={skus.map((x) => ({
            value: x.id,
            label: `${x.code} · ${x.productName}`,
          }))}
        />
      );
    }
  }
  return (
    <>
      <PageHeading
        title={surfaceLabel(item, language)}
        description={
          hi
            ? "अधिकृत व्यावसायिक रिकॉर्ड, स्थिति और संबंधित कार्रवाई।"
            : "Authorized business records, status and related actions."
        }
      />
      {workflow}
      <section className={styles.toolbar}>
        <form method="get">
          <label>
            <span>{hi ? "खोज" : "Search"}</span>
            <input
              name="q"
              defaultValue={q}
              placeholder={
                hi
                  ? "नाम, नंबर या स्थिति खोजें"
                  : "Search name, business number or status"
              }
            />
          </label>
          <button>{hi ? "फ़िल्टर लागू करें" : "Apply filter"}</button>
        </form>
        <span className={styles.scope}>
          {hi
            ? "आपके अधिकृत दायरे तक सीमित"
            : "Limited to your authorized scope"}
        </span>
      </section>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{hi ? "रिकॉर्ड" : "Record"}</th>
                <th>{hi ? "विवरण" : "Details"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
                <th>{hi ? "मूल्य / मात्रा" : "Value / Qty"}</th>
                <th>{hi ? "दिनांक" : "Date"}</th>
                <th>{hi ? "कार्रवाई" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.primary}</strong>
                  </td>
                  <td>{row.secondary ?? "—"}</td>
                  <td>
                    <span className={styles.badge}>{row.status ?? "—"}</span>
                  </td>
                  <td>{row.metric ?? "—"}</td>
                  <td>{date(row.date, language)}</td>
                  <td>
                    {DETAIL_KINDS.has(item.kind) ? (
                      <Link href={`${base}/${row.id}`}>
                        {hi ? "विवरण खोलें" : "Open detail"}
                      </Link>
                    ) : (
                      <span className={styles.scope}>
                        {hi ? "कार्यस्थल में प्रबंधित" : "Managed in workspace"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            hi ? "इस दृश्य में कोई रिकॉर्ड नहीं है" : "No records in this view"
          }
          description={
            q
              ? hi
                ? "खोज बदलकर पुनः प्रयास करें।"
                : "Change the search and try again."
              : hi
                ? "आपके अधिकृत दायरे में रिकॉर्ड उपलब्ध होने पर यहाँ दिखाई देंगे।"
                : "Records will appear here when available in your authorized scope."
          }
        />
      )}
      <nav className={styles.pagination} aria-label="Pagination">
        {page > 1 && (
          <Link href={`${base}?page=${page - 1}&q=${encodeURIComponent(q)}`}>
            {hi ? "पिछला" : "Previous"}
          </Link>
        )}{" "}
        {rows.length === 30 && (
          <Link href={`${base}?page=${page + 1}&q=${encodeURIComponent(q)}`}>
            {hi ? "अगला" : "Next"}
          </Link>
        )}
      </nav>
    </>
  );
}
