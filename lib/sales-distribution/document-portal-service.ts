import type { PrismaClient } from "@prisma/client";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { permittedPartnerIds } from "./scope";
const globalPortals = new Set(["founder-admin", "company-admin", "accounts"]);
export async function documentSelectorData(
  db: PrismaClient,
  userId: string,
  portal: string,
) {
  const permissions = await effectivePermissions(db, userId),
    mayIssue =
      permissions.has("document:issue") ||
      permissions.has("system:super_admin"),
    mayUpload =
      permissions.has("document:upload") ||
      permissions.has("system:super_admin");
  if (!mayIssue && !mayUpload)
    throw new FoundationError(
      "DOCUMENT_ACTION_DENIED",
      "Document creation is not authorized",
      403,
    );
  const now = new Date(),
    global = globalPortals.has(portal),
    partyType =
      portal === "distributor"
        ? "DISTRIBUTOR"
        : portal === "super-stockist"
          ? "SUPER_STOCKIST"
          : null,
    partyIds = partyType
      ? await permittedPartnerIds(db, userId, partyType)
      : null;
  if (!global && (!partyIds || !partyIds.length))
    throw new FoundationError(
      "DOCUMENT_SCOPE_REQUIRED",
      "Verified issuer scope is required",
      403,
    );
  const profiles = await db.seeraBillingProfile.findMany({
    where: {
      authorizedBilling: true,
      verificationStatus: "VERIFIED",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      ...(global ? {} : { ownerId: { in: partyIds! } }),
    },
    orderBy: { legalName: "asc" },
  });
  if (!profiles.length)
    return {
      mayIssue,
      mayUpload,
      profiles,
      partners: [],
      retailers: [],
      skus: [],
    };
  const partners =
      portal === "super-stockist"
        ? await db.seeraPartner.findMany({
            where: {
              assignedSuperStockistId: { in: partyIds! },
              lifecycle: "ACTIVE",
            },
            orderBy: { legalName: "asc" },
            take: 200,
          })
        : global
          ? await db.seeraPartner.findMany({
              where: { lifecycle: "ACTIVE" },
              orderBy: { legalName: "asc" },
              take: 250,
            })
          : [],
    retailers =
      portal === "distributor"
        ? await db.seeraRetailer.findMany({
            where: { distributorId: { in: partyIds! }, lifecycle: "ACTIVE" },
            orderBy: { businessName: "asc" },
            take: 250,
          })
        : [],
    skus = await db.seeraSku.findMany({
      where: { status: "ACTIVE" },
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
  return { mayIssue, mayUpload, profiles, partners, retailers, skus };
}
