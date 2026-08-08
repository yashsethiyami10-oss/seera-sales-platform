import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";

/** Knowledge Base Service + FAQ Service + Resolution Template Service.
 * Draft -> In Review -> Approved -> Published, author != approver enforced
 * at the publish step, matching Milestone 8's Credit Note maker-checker
 * pattern applied to published content instead of money. */

export async function createKbCategory(input: { name: string; parentId?: string }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_KB_AUTHOR);
  return prisma.supportKbCategory.create({ data: { organizationKey: principal.organizationKey, ...input } });
}

export async function listKbCategories() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportKbCategory.findMany({ where: { organizationKey: principal.organizationKey }, orderBy: { name: "asc" } });
}

const articleInput = z.object({ categoryId: z.string().cuid(), title: z.string().min(3).max(200), slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/), body: z.string().min(1), visibility: z.enum(["PUBLIC", "INTERNAL"]) });

export async function createKbArticleDraft(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_KB_AUTHOR);
  const data = articleInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const article = await tx.supportKbArticle.create({ data: { organizationKey: principal.organizationKey, ...data, authorId: principal.id } });
    await tx.supportKbArticleVersion.create({ data: { organizationKey: principal.organizationKey, articleId: article.id, version: 1, body: data.body, editedById: principal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "KB_ARTICLE_DRAFTED", entityType: "SupportKbArticle", entityId: article.id, description: `KB article "${data.title}" drafted` });
    return article;
  });
}

export async function updateKbArticleBody(id: string, expectedVersion: number, body: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_KB_AUTHOR);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.supportKbArticle.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Article");
    if (current.version !== expectedVersion) throw new ConflictError("Article changed; refresh and retry");
    if (current.status === "PUBLISHED") throw new AppError("Edit a published article through a new draft, not in place", 409, "INVALID_TRANSITION");
    const nextVersion = current.currentVersion + 1;
    await tx.supportKbArticleVersion.create({ data: { organizationKey: principal.organizationKey, articleId: id, version: nextVersion, body, editedById: principal.id } });
    return tx.supportKbArticle.update({ where: { id }, data: { body, currentVersion: nextVersion, status: "DRAFT", version: { increment: 1 } } });
  });
}

export async function submitKbArticleForReview(id: string, expectedVersion: number) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_KB_AUTHOR);
  const current = await prisma.supportKbArticle.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!current) throw new NotFoundError("Article");
  if (current.version !== expectedVersion) throw new ConflictError("Article changed; refresh and retry");
  if (current.status !== "DRAFT") throw new AppError("Only a draft article can be submitted for review", 409, "INVALID_TRANSITION");
  return prisma.supportKbArticle.update({ where: { id }, data: { status: "IN_REVIEW", version: { increment: 1 } } });
}

export async function approveKbArticle(id: string, expectedVersion: number) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_KB_APPROVE);
  const current = await prisma.supportKbArticle.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!current) throw new NotFoundError("Article");
  if (current.version !== expectedVersion) throw new ConflictError("Article changed; refresh and retry");
  if (current.status !== "IN_REVIEW") throw new AppError("Only an in-review article can be approved", 409, "INVALID_TRANSITION");
  if (current.authorId === principal.id) throw new AppError("The approver must be different from the article's author", 403, "SEGREGATION_OF_DUTIES");
  return prisma.supportKbArticle.update({ where: { id }, data: { status: "APPROVED", approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } } });
}

export async function publishKbArticle(id: string, expectedVersion: number) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_KB_PUBLISH);
  const current = await prisma.supportKbArticle.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!current) throw new NotFoundError("Article");
  if (current.version !== expectedVersion) throw new ConflictError("Article changed; refresh and retry");
  if (current.status !== "APPROVED") throw new AppError("Only an approved article can be published", 409, "INVALID_TRANSITION");
  return prisma.supportKbArticle.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } } });
}

export async function listKbArticles(input: { status?: string; categoryId?: string; page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}), ...(input.categoryId ? { categoryId: input.categoryId } : {}) };
  const [items, total] = await Promise.all([
    prisma.supportKbArticle.findMany({ where, include: { category: true }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supportKbArticle.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function recordKbArticleView(articleId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportKbArticleView.create({ data: { organizationKey: principal.organizationKey, articleId, viewedById: principal.id } });
}

export async function getKnowledgeUsage() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const [views, templateUsage] = await Promise.all([
    prisma.supportKbArticleView.groupBy({ by: ["articleId"], where: { organizationKey: principal.organizationKey }, _count: { articleId: true } }),
    prisma.supportTemplateUsage.groupBy({ by: ["templateId"], where: { organizationKey: principal.organizationKey }, _count: { templateId: true } }),
  ]);
  return { articleViews: views.map((v) => ({ articleId: v.articleId, views: v._count.articleId })), templateUsage: templateUsage.map((t) => ({ templateId: t.templateId, uses: t._count.templateId })) };
}

// --- FAQ ---

const faqInput = z.object({ kbCategoryId: z.string().cuid().optional(), question: z.string().min(3).max(300), answer: z.string().min(1).max(3000), isPublic: z.coerce.boolean().default(true), sortOrder: z.coerce.number().int().default(0) });

export async function createFaq(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_FAQ_MANAGE);
  const data = faqInput.parse(input);
  return prisma.supportFaq.create({ data: { organizationKey: principal.organizationKey, ...data, createdById: principal.id } });
}

export async function listFaqs(publicOnly = false) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportFaq.findMany({ where: { organizationKey: principal.organizationKey, ...(publicOnly ? { isPublic: true } : {}) }, orderBy: { sortOrder: "asc" } });
}

// --- Resolution Templates ---

const templateInput = z.object({ title: z.string().min(2).max(150), body: z.string().min(1).max(3000), category: z.enum(["GENERAL_INQUIRY", "COMPLAINT", "PRODUCT_ISSUE", "RETURN_REPLACEMENT", "REFUND", "WARRANTY_CLAIM", "ORDER_STATUS", "BILLING", "FEEDBACK"]).optional() });

export async function createResolutionTemplate(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TEMPLATES_MANAGE);
  const data = templateInput.parse(input);
  return prisma.supportResolutionTemplate.create({ data: { organizationKey: principal.organizationKey, ...data, createdById: principal.id } });
}

export async function listResolutionTemplates(category?: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportResolutionTemplate.findMany({ where: { organizationKey: principal.organizationKey, active: true, ...(category ? { category: category as never } : {}) }, orderBy: { title: "asc" } });
}

export async function recordTemplateUsage(templateId: string, ticketId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, organizationKey: principal.organizationKey } });
  if (!ticket) throw new NotFoundError("Ticket");
  return prisma.supportTemplateUsage.create({ data: { organizationKey: principal.organizationKey, templateId, ticketId, usedById: principal.id } });
}
