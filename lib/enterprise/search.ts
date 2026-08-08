import { prisma } from "@/lib/prisma";
import { PERMISSIONS, type PermissionKey } from "@/lib/sales/constants";
import { requireEnterprisePrincipal } from "./context";

type SearchEntity = "VENDOR" | "REQUISITION" | "RFQ" | "PURCHASE_ORDER" | "GOODS_RECEIPT" | "FORMULA" | "PRODUCTION_ORDER" | "BATCH" | "INSPECTION" | "PLANNING_SNAPSHOT";

const permissionByEntity: Record<SearchEntity, PermissionKey> = {
  VENDOR: PERMISSIONS.ENTERPRISE_VENDOR_VIEW,
  REQUISITION: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW,
  RFQ: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW,
  PURCHASE_ORDER: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW,
  GOODS_RECEIPT: PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW,
  FORMULA: PERMISSIONS.ENTERPRISE_FORMULA_VIEW,
  PRODUCTION_ORDER: PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW,
  BATCH: PERMISSIONS.ENTERPRISE_BATCH_VIEW,
  INSPECTION: PERMISSIONS.ENTERPRISE_QUALITY_VIEW,
  PLANNING_SNAPSHOT: PERMISSIONS.ENTERPRISE_PLANNING_VIEW,
};

export async function enterpriseSearch(input: { q: string; entity: SearchEntity; page?: number; pageSize?: number }) {
  const principal = await requireEnterprisePrincipal(permissionByEntity[input.entity]);
  const q = input.q.trim(), page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const scope = { organizationKey: principal.organizationKey };
  const paging = { skip: (page - 1) * pageSize, take: pageSize };
  let items: Array<{ id: string; number: string; label: string; status: string }> = [];
  switch (input.entity) {
    case "VENDOR": items = (await prisma.enterpriseVendor.findMany({ where: { ...scope, OR: [{ vendorCode: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] }, ...paging })).map(x => ({ id: x.id, number: x.vendorCode, label: x.displayName, status: x.status })); break;
    case "REQUISITION": items = (await prisma.enterprisePurchaseRequisition.findMany({ where: { ...scope, requisitionNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.requisitionNumber, label: x.purpose ?? x.requisitionNumber, status: x.status })); break;
    case "RFQ": items = (await prisma.enterpriseRfq.findMany({ where: { ...scope, rfqNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.rfqNumber, label: x.rfqNumber, status: x.status })); break;
    case "PURCHASE_ORDER": items = (await prisma.enterprisePurchaseOrder.findMany({ where: { ...scope, purchaseOrderNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.purchaseOrderNumber, label: x.purchaseOrderNumber, status: x.status })); break;
    case "GOODS_RECEIPT": items = (await prisma.enterpriseGoodsReceipt.findMany({ where: { ...scope, goodsReceiptNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.goodsReceiptNumber, label: x.goodsReceiptNumber, status: x.status })); break;
    case "FORMULA": items = (await prisma.enterpriseFormula.findMany({ where: { ...scope, OR: [{ formulaCode: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, ...paging })).map(x => ({ id: x.id, number: x.formulaCode, label: x.name, status: x.status })); break;
    case "PRODUCTION_ORDER": items = (await prisma.enterpriseProductionOrder.findMany({ where: { ...scope, productionOrderNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.productionOrderNumber, label: x.productionOrderNumber, status: x.status })); break;
    case "BATCH": items = (await prisma.enterpriseBatch.findMany({ where: { ...scope, batchNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.batchNumber, label: x.batchNumber, status: x.status })); break;
    case "INSPECTION": items = (await prisma.enterpriseInspection.findMany({ where: { ...scope, inspectionNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.inspectionNumber, label: x.inspectionType, status: x.status })); break;
    case "PLANNING_SNAPSHOT": items = (await prisma.enterprisePlanningSnapshot.findMany({ where: { ...scope, snapshotNumber: { contains: q, mode: "insensitive" } }, ...paging })).map(x => ({ id: x.id, number: x.snapshotNumber, label: x.snapshotType, status: "IMMUTABLE" })); break;
  }
  await prisma.salesAuditLog.create({ data: { userId: principal.id, module: "enterprise_search", action: "SEARCH", recordType: input.entity, newValue: { organizationKey: principal.organizationKey, q, page, resultCount: items.length } } });
  return { items, page, pageSize, hasMore: items.length === pageSize };
}

