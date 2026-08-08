import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { calculateLine, calculateTotals } from "./pricing";

type Actor = { id: string; email: string | null; isFounder: boolean };
type Tx = Prisma.TransactionClient;
export type LineInput = { productId: string; variantId?: string | null; quantity: number; unitPrice?: number;
  discountType?: "PERCENTAGE"|"FIXED"; discountValue?: number; discountReason?: string; taxCode?: string; displayOrder?: number };

async function event(tx: Tx, actor: Actor, input: { quotationId: string; versionId: string; customerId: string; action: string; description: string; previous?: Prisma.InputJsonValue; next?: Prisma.InputJsonValue }) {
  await tx.salesTimelineEvent.create({ data: { actorId: actor.id, customerId: input.customerId, eventType: input.action,
    relatedRecordType: "QuotationVersion", relatedRecordId: input.versionId, description: input.description, metadata: input.next } });
  await tx.salesAuditLog.create({ data: { userId: actor.id, module: "quotations", action: input.action,
    recordType: "QuotationVersion", recordId: input.versionId, previousValue: input.previous, newValue: input.next } });
  await tx.notificationLog.create({ data: { channel: "DASHBOARD", type: input.action, recipient: actor.email ?? actor.id, status: "PENDING" } });
}

async function priceLines(tx: Tx, lines: LineInput[]) {
  if (!lines.length) throw new AppError("At least one line item is required");
  return Promise.all(lines.map(async (input, index) => {
    const product = await tx.product.findFirst({ where: { id: input.productId, status: "ACTIVE" }, include: { category: true, variants: true } });
    if (!product) throw new AppError("Invalid or inactive product");
    const variant = input.variantId ? product.variants.find((row) => row.id === input.variantId) : product.variants[0];
    if (input.variantId && !variant) throw new AppError("Variant does not belong to product");
    const tax = await tx.taxConfiguration.findFirst({ where: { code: input.taxCode ?? `GST_${product.gstRate}_EXCLUSIVE`, active: true } });
    if (!tax) throw new AppError("Invalid tax configuration");
    const result = calculateLine({ quantity: input.quantity, unitPrice: input.unitPrice ?? variant?.price ?? 0,
      discountType: input.discountType ?? "PERCENTAGE", discountValue: input.discountValue ?? 0,
      taxRate: Number(tax.rate), taxInclusive: tax.inclusive });
    return { input, product, variant, tax, result, displayOrder: input.displayOrder ?? index };
  }));
}

export async function createQuotation(actor: Actor, input: { opportunityId: string; pricingPolicyCode: string; validUntil: Date;
  terms?: Record<string, string>; lines: LineInput[] }) {
  return prisma.$transaction(async tx => {
    const opportunity = await tx.opportunity.findUnique({ where: { id: input.opportunityId } });
    if (!opportunity) throw new NotFoundError("Opportunity");
    const [draft, policy, priced] = await Promise.all([
      tx.quotationStatus.findUnique({ where: { code: "DRAFT" } }),
      tx.pricingPolicy.findFirst({ where: { code: input.pricingPolicyCode, active: true } }),
      priceLines(tx, input.lines),
    ]);
    if (!draft || !policy) throw new AppError("Invalid quotation configuration");
    const totals = calculateTotals(priced.map(row => row.result));
    const quotation = await tx.quotation.create({ data: { quotationNumber: "", opportunityId: opportunity.id,
      customerId: opportunity.customerId, ownerUserId: opportunity.ownerUserId, territoryId: opportunity.territoryId } });
    const version = await tx.quotationVersion.create({ data: { quotationId: quotation.id, versionNumber: 1, statusId: draft.id,
      pricingPolicyId: policy.id, createdById: actor.id, issueDate: new Date(), validUntil: input.validUntil,
      termsSnapshot: input.terms, ...totals } });
    await tx.quotationLineItem.createMany({ data: priced.map(({ input: line, product, variant, tax, result, displayOrder }) => ({
      quotationVersionId: version.id, productId: product.id, variantId: variant?.id, taxConfigurationId: tax.id, displayOrder,
      quantity: result.quantity, productName: product.name, skuSnapshot: variant?.sku, variantSnapshot: variant?.size,
      categorySnapshot: product.category.name, unitPrice: result.unitPrice, discountType: result.discountType,
      discountValue: result.discountValue, discountReason: line.discountReason, taxRate: result.taxRate, taxInclusive: result.taxInclusive,
      subtotal: result.subtotal, discountAmount: result.discountAmount, taxAmount: result.taxAmount, total: result.total,
    })) });
    await tx.quotationStatusHistory.create({ data: { quotationVersionId: version.id, newStatusId: draft.id, changedById: actor.id, reason: "Quotation created" } });
    await event(tx, actor, { quotationId: quotation.id, versionId: version.id, customerId: quotation.customerId,
      action: "QUOTATION_CREATED", description: `Quotation ${quotation.quotationNumber} created`, next: { version: 1, ...totals } });
    return { quotation, version };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function replaceDraftLines(actor: Actor, versionId: string, lines: LineInput[]) {
  return prisma.$transaction(async tx => {
    const version = await tx.quotationVersion.findUnique({ where: { id: versionId }, include: { status: true, quotation: true } });
    if (!version) throw new NotFoundError("Quotation version");
    if (version.status.code !== "DRAFT" || version.commercialLocked || !version.isActive) throw new AppError("Only the active draft version can be edited", 409);
    const priced = await priceLines(tx, lines), totals = calculateTotals(priced.map(row => row.result));
    await tx.quotationLineItem.deleteMany({ where: { quotationVersionId: version.id } });
    await tx.quotationLineItem.createMany({ data: priced.map(({ input: line, product, variant, tax, result, displayOrder }) => ({
      quotationVersionId: version.id, productId: product.id, variantId: variant?.id, taxConfigurationId: tax.id, displayOrder,
      quantity: result.quantity, productName: product.name, skuSnapshot: variant?.sku, variantSnapshot: variant?.size,
      categorySnapshot: product.category.name, unitPrice: result.unitPrice, discountType: result.discountType,
      discountValue: result.discountValue, discountReason: line.discountReason, taxRate: result.taxRate, taxInclusive: result.taxInclusive,
      subtotal: result.subtotal, discountAmount: result.discountAmount, taxAmount: result.taxAmount, total: result.total,
    })) });
    const updated = await tx.quotationVersion.update({ where: { id: version.id }, data: totals });
    await event(tx, actor, { quotationId: version.quotationId, versionId, customerId: version.quotation.customerId,
      action: "QUOTATION_LINE_ITEMS_UPDATED", description: "Quotation pricing snapshot updated", next: totals });
    return updated;
  });
}

export async function transitionQuotation(actor: Actor, input: { versionId: string; targetCode: string; reason?: string }) {
  return prisma.$transaction(async tx => {
    const version = await tx.quotationVersion.findUnique({ where: { id: input.versionId }, include: { status: true, quotation: { include: { opportunity: true } } } });
    if (!version) throw new NotFoundError("Quotation version");
    if (!version.isActive) throw new AppError("Historical versions are read-only", 409);
    if (version.validUntil < new Date() && input.targetCode === "ACCEPTED") throw new AppError("Expired quotations cannot be accepted", 409);
    const target = await tx.quotationStatus.findFirst({ where: { code: input.targetCode, active: true } });
    if (!target) throw new AppError("Invalid quotation status");
    const transition = await tx.quotationStatusTransition.findUnique({ where: { fromStatusId_toStatusId: { fromStatusId: version.statusId, toStatusId: target.id } } });
    if (!transition?.active) throw new AppError("Illegal quotation transition", 409, "INVALID_TRANSITION");
    if (input.targetCode === "SENT" && version.approvalState === "PENDING") throw new AppError("Quotation must be approved before sending", 409);
    const lock = input.targetCode !== "DRAFT";
    const updated = await tx.quotationVersion.update({ where: { id: version.id }, data: { statusId: target.id, commercialLocked: lock } });
    await tx.quotationStatusHistory.create({ data: { quotationVersionId: version.id, previousStatusId: version.statusId, newStatusId: target.id, changedById: actor.id, reason: input.reason } });
    if (input.targetCode === "SENT") await tx.quotationDelivery.create({ data: { quotationVersionId: version.id, method: "MANUAL", status: "REGISTERED" } });
    if (input.targetCode === "VIEWED") await tx.quotationView.create({ data: { quotationVersionId: version.id, viewerId: actor.id, deliveryMethod: "MANUAL" } });
    if (["REJECTED", "SENT", "VIEWED"].includes(input.targetCode)) await createFollowUp(tx, version.quotation.opportunity, actor.id, `Quotation ${input.targetCode.toLowerCase()} follow-up`);
    await event(tx, actor, { quotationId: version.quotationId, versionId: version.id, customerId: version.quotation.customerId,
      action: `QUOTATION_${input.targetCode}`, description: `${version.status.name} → ${target.name}`,
      previous: { status: version.status.code }, next: { status: target.code, reason: input.reason ?? null } });
    return updated;
  });
}

async function createFollowUp(tx: Tx, opportunity: { id: string; customerId: string; ownerUserId: string }, actorId: string, title: string) {
  const [type, status, priority] = await Promise.all([
    tx.opportunityTaskType.findUnique({ where: { code: "FOLLOW_UP" } }), tx.opportunityTaskStatus.findUnique({ where: { code: "OPEN" } }),
    tx.opportunityPriority.findUnique({ where: { code: "NORMAL" } })]);
  if (type && status && priority) await tx.opportunityTask.create({ data: { opportunityId: opportunity.id, customerId: opportunity.customerId,
    ownerUserId: opportunity.ownerUserId, assignedBy: actorId, taskTypeId: type.id, statusId: status.id, priorityId: priority.id,
    title, dueDate: new Date(Date.now() + 86400000) } });
}

export async function requestApproval(actor: Actor, versionId: string, ruleCode: string, approverId?: string) {
  return prisma.$transaction(async tx => {
    const version = await tx.quotationVersion.findUnique({ where: { id: versionId }, include: { status: true, quotation: true } });
    const rule = await tx.quotationApprovalRule.findFirst({ where: { code: ruleCode, active: true } });
    if (!version || !rule) throw new AppError("Invalid quotation or approval rule");
    if (version.status.code !== "DRAFT" || !version.isActive) throw new AppError("Only active drafts can request approval");
    if (rule.approvalType === "NONE") {
      const approved = await tx.quotationStatus.findUniqueOrThrow({ where: { code: "APPROVED" } });
      await tx.quotationVersion.update({ where: { id: version.id }, data: { statusId: approved.id, approvalState: "NOT_REQUIRED", commercialLocked: true } });
      await tx.quotationStatusHistory.create({ data: { quotationVersionId: version.id, previousStatusId: version.statusId, newStatusId: approved.id, changedById: actor.id, reason: "No approval required" } });
      await event(tx, actor, { quotationId: version.quotationId, versionId, customerId: version.quotation.customerId,
        action: "QUOTATION_APPROVED", description: "Quotation approved without approval requirement", next: { rule: rule.code } });
      return version;
    }
    const pending = await tx.quotationStatus.findUniqueOrThrow({ where: { code: "PENDING_APPROVAL" } });
    await tx.quotationVersion.update({ where: { id: version.id }, data: { statusId: pending.id, approvalState: "PENDING", commercialLocked: true } });
    const request = await tx.quotationApprovalRequest.create({ data: { quotationVersionId: version.id, ruleId: rule.id, requesterId: actor.id, approverId } });
    await tx.quotationStatusHistory.create({ data: { quotationVersionId: version.id, previousStatusId: version.statusId, newStatusId: pending.id, changedById: actor.id, reason: "Approval requested" } });
    await event(tx, actor, { quotationId: version.quotationId, versionId, customerId: version.quotation.customerId,
      action: "QUOTATION_APPROVAL_REQUESTED", description: "Quotation approval requested", next: { rule: rule.code, approverId: approverId ?? null } });
    return request;
  });
}

export async function decideApproval(actor: Actor, requestId: string, decision: "APPROVED"|"REJECTED"|"REVISION_REQUESTED", reason?: string) {
  return prisma.$transaction(async tx => {
    const request = await tx.quotationApprovalRequest.findUnique({ where: { id: requestId }, include: { rule: true, quotationVersion: { include: { status: true, quotation: true } } } });
    if (!request || request.status !== "PENDING") throw new AppError("Approval request is not pending", 409);
    if (!actor.isFounder && request.approverId && request.approverId !== actor.id) throw new ForbiddenError("You are not the assigned approver");
    if (request.rule.prohibitSelfApproval && request.requesterId === actor.id && !actor.isFounder) throw new ForbiddenError("Self-approval is prohibited");
    const statusCode = decision === "APPROVED" ? "APPROVED" : "REJECTED";
    const status = await tx.quotationStatus.findUniqueOrThrow({ where: { code: statusCode } });
    await tx.quotationApprovalDecision.create({ data: { requestId, actorId: actor.id, decision, reason } });
    await tx.quotationApprovalRequest.update({ where: { id: request.id }, data: { status: decision, approverId: actor.id, decidedAt: new Date() } });
    await tx.quotationVersion.update({ where: { id: request.quotationVersionId }, data: { statusId: status.id, approvalState: decision } });
    await tx.quotationStatusHistory.create({ data: { quotationVersionId: request.quotationVersionId, previousStatusId: request.quotationVersion.statusId, newStatusId: status.id, changedById: actor.id, reason } });
    await event(tx, actor, { quotationId: request.quotationVersion.quotationId, versionId: request.quotationVersionId,
      customerId: request.quotationVersion.quotation.customerId, action: `QUOTATION_APPROVAL_${decision}`,
      description: `Quotation approval ${decision.toLowerCase()}`, next: { decision, reason: reason ?? null } });
    return request;
  });
}

export async function createRevision(actor: Actor, versionId: string, reason: string) {
  return prisma.$transaction(async tx => {
    const source = await tx.quotationVersion.findUnique({ where: { id: versionId }, include: { quotation: true, lineItems: true } });
    if (!source) throw new NotFoundError("Quotation version");
    if (!source.isActive) throw new AppError("Only the current version can be revised");
    const draft = await tx.quotationStatus.findUniqueOrThrow({ where: { code: "DRAFT" } });
    await tx.quotationVersion.update({ where: { id: source.id }, data: { isActive: false, commercialLocked: true } });
    const version = await tx.quotationVersion.create({ data: { quotationId: source.quotationId, versionNumber: source.versionNumber + 1,
      parentVersionId: source.id, statusId: draft.id, pricingPolicyId: source.pricingPolicyId, createdById: actor.id,
      revisionReason: reason, issueDate: new Date(), validUntil: source.validUntil, subtotal: source.subtotal,
      discountTotal: source.discountTotal, taxTotal: source.taxTotal, grandTotal: source.grandTotal, termsSnapshot: source.termsSnapshot ?? undefined } });
    await tx.quotationLineItem.createMany({ data: source.lineItems.map(line => ({ quotationVersionId: version.id, productId: line.productId,
      variantId: line.variantId, taxConfigurationId: line.taxConfigurationId, displayOrder: line.displayOrder, quantity: line.quantity,
      productName: line.productName, skuSnapshot: line.skuSnapshot, variantSnapshot: line.variantSnapshot, categorySnapshot: line.categorySnapshot,
      unitPrice: line.unitPrice, discountType: line.discountType, discountValue: line.discountValue, discountReason: line.discountReason,
      taxRate: line.taxRate, taxInclusive: line.taxInclusive, subtotal: line.subtotal, discountAmount: line.discountAmount,
      taxAmount: line.taxAmount, total: line.total })) });
    await tx.quotationStatusHistory.create({ data: { quotationVersionId: version.id, newStatusId: draft.id, changedById: actor.id, reason } });
    await event(tx, actor, { quotationId: source.quotationId, versionId: version.id, customerId: source.quotation.customerId,
      action: "QUOTATION_VERSION_CREATED", description: `Quotation version ${version.versionNumber} created`, next: { parentVersionId: source.id, reason } });
    return version;
  });
}

export async function registerDocument(actor: Actor, versionId: string, fileReference: string, sizeBytes: number) {
  if (!fileReference || sizeBytes <= 0 || sizeBytes > 20 * 1024 * 1024) throw new AppError("Invalid PDF reference");
  return prisma.$transaction(async tx => {
    const version = await tx.quotationVersion.findUnique({ where: { id: versionId }, include: { quotation: true } });
    if (!version) throw new NotFoundError("Quotation version");
    const document = await tx.quotationDocument.create({ data: { quotationVersionId: version.id, generatedById: actor.id, fileReference, sizeBytes } });
    await event(tx, actor, { quotationId: version.quotationId, versionId, customerId: version.quotation.customerId,
      action: "QUOTATION_PDF_GENERATED", description: `PDF generated for version ${version.versionNumber}`, next: { fileReference } });
    return document;
  });
}
