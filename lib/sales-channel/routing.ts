import { Prisma, type PrismaClient } from "@prisma/client";
import { matchCustomer } from "./identity-matching";
import { resolveAssignment, resolvePriority } from "./assignment";
import { channelDetailSchemas, publicInquirySchema, type PublicInquiryInput } from "./validation";

const year = () => new Date().getUTCFullYear();
const json = (value: unknown) => value as Prisma.InputJsonValue;

async function createDetail(tx: Prisma.TransactionClient, channelCode: string, inquiryId: string, raw: Record<string, unknown>) {
  const detail = channelDetailSchemas[channelCode as keyof typeof channelDetailSchemas].parse(raw);
  const submitted = await tx.salesApplicationStatus.findUnique({ where: { code: "SUBMITTED" } });
  switch (channelCode) {
    case "INSTITUTIONAL_SALES": return tx.institutionalInquiryDetail.create({ data: { inquiryId, ...detail } });
    case "CORPORATE_INQUIRY": return tx.corporateInquiryDetail.create({ data: { inquiryId, ...detail } });
    case "BULK_ORDER": return tx.bulkOrderDetail.create({ data: { inquiryId, ...detail } });
    case "QUOTATION_REQUEST": return tx.quotationRequestDetail.create({ data: { inquiryId, ...detail } });
    case "SAMPLE_REQUEST": return tx.sampleRequestDetail.create({ data: { inquiryId, ...detail } });
    case "DEALER_APPLICATION": return tx.dealerApplicationDetail.create({ data: { inquiryId, ...detail, applicationStatusId: submitted!.id } });
    case "DISTRIBUTOR_APPLICATION": return tx.distributorApplicationDetail.create({ data: { inquiryId, ...detail, applicationStatusId: submitted!.id } });
    case "FRANCHISE_INQUIRY": return tx.franchiseInquiryDetail.create({ data: { inquiryId, ...detail, applicationStatusId: submitted!.id } });
    case "CONTACT_SALES": return tx.contactSalesDetail.create({ data: { inquiryId, ...detail } });
    default: throw new Error("Unsupported sales channel");
  }
}

export async function routePublicInquiry(prisma: PrismaClient, raw: unknown, submittedUserId?: string) {
  const input = publicInquirySchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.salesInquiry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { inquiryNumber: existing.inquiryNumber, duplicate: true };
    const [channel, source, customerType, newStatus] = await Promise.all([
      tx.salesChannel.findFirstOrThrow({ where: { code: input.channelCode, active: true, publicVisibility: true } }),
      tx.leadSource.findFirstOrThrow({ where: { code: input.leadSourceCode, active: true } }),
      tx.customerType.findFirstOrThrow({ where: { code: input.customerTypeCode, active: true } }),
      tx.salesInquiryStatus.findUniqueOrThrow({ where: { code: "NEW" } }),
    ]);
    const match = await matchCustomer(tx, {
      userId: submittedUserId, email: input.email, phone: input.phone,
      gstNumber: input.gstNumber, businessName: input.businessName,
    });
    let customer = match.state === "EXACT" ? match.customer : null;
    if (!customer && match.state === "NONE" && input.email) {
      customer = await tx.customer.create({
        data: {
          email: input.email, name: input.name, phone: input.phone,
          businessName: input.businessName, contactPerson: input.name,
          gstNumber: input.gstNumber, city: input.city, state: input.state,
          customerTypeId: customerType.id, primaryChannelId: channel.id,
        },
      });
      await tx.salesTimelineEvent.create({
        data: { eventType: "CUSTOMER_CREATED", customerId: customer.id, relatedRecordType: "Customer", relatedRecordId: customer.id, description: "Customer created from sales inquiry" },
      });
    }
    const assignment = await resolveAssignment(tx, channel, input.territoryId);
    const priority = resolvePriority(input.channelCode, input.detail);
    const sequence = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('sales_inquiry_number_seq')`;
    const nextval = sequence[0]!.nextval;
    const inquiryNumber = `MUV-INQ-${year()}-${nextval.toString().padStart(6, "0")}`;
    const inquiry = await tx.salesInquiry.create({
      data: {
        inquiryNumber, customerId: customer?.id, salesChannelId: channel.id,
        leadSourceId: source.id, customerTypeId: customerType.id,
        subject: input.subject, requirementSummary: input.requirementSummary,
        priority, statusId: newStatus.id, assignedOwnerId: assignment.owner?.id,
        assignmentQueueId: assignment.queue?.id, territoryId: assignment.territoryId,
        submittedUserId, campaignData: input.campaignData ? json(input.campaignData) : undefined,
        sourceUrl: input.sourceUrl, consent: input.consent,
        responseSlaAt: assignment.queue ? new Date(Date.now() + assignment.queue.initialSlaMinutes * 60000) : null,
        identityMatchState: match.state === "POSSIBLE" ? "MANUAL_REVIEW" : match.state,
        possibleCustomerId: match.state === "POSSIBLE" ? match.possibleCustomer!.id : null,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await createDetail(tx, input.channelCode, inquiry.id, input.detail);
    if (input.attachment) await tx.inquiryAttachment.create({ data: {
      inquiryId: inquiry.id, uploaderId: submittedUserId,
      storageReference: input.attachment.storageReference,
      originalFilename: input.attachment.originalFilename,
      mimeType: input.attachment.mimeType,
      extension: input.attachment.extension,
      sizeBytes: input.attachment.sizeBytes,
    } });
    await tx.salesTimelineEvent.create({
      data: { actorId: submittedUserId, eventType: "INQUIRY_SUBMITTED", customerId: customer?.id, inquiryId: inquiry.id, relatedRecordType: "SalesInquiry", relatedRecordId: inquiry.id, description: `Inquiry ${inquiryNumber} submitted` },
    });
    if (assignment.owner) {
      await tx.salesFollowUpTask.create({
        data: { taskType: "INITIAL_RESPONSE", ownerId: assignment.owner.id, customerId: customer?.id, inquiryId: inquiry.id, priority, dueAt: inquiry.responseSlaAt ?? new Date(Date.now() + 86400000), description: `Initial response for ${inquiryNumber}` },
      });
    }
    await tx.salesAuditLog.create({
      data: { userId: submittedUserId, module: "inquiries", action: "INQUIRY_CREATED", recordType: "SalesInquiry", recordId: inquiry.id, newValue: json({ inquiryNumber, channel: input.channelCode, priority }) },
    });
    const recipient = assignment.owner?.email ?? "dashboard";
    await tx.notificationLog.create({ data: { channel: "DASHBOARD", type: "NEW_INQUIRY", recipient, status: "PENDING", salesInquiryId: inquiry.id } });
    if (assignment.owner?.email) {
      await tx.notificationLog.create({ data: { channel: "EMAIL", type: "NEW_INQUIRY", recipient: assignment.owner.email, status: "PENDING", salesInquiryId: inquiry.id } });
    }
    return { inquiryNumber, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
