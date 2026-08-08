import { z } from "zod";
import { NETWORK_PARTNER_TYPES } from "./domain";

export const partnerInput = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).optional(),
  partnerType: z.enum(NETWORK_PARTNER_TYPES),
  taxRegistrationNumber: z.string().trim().max(80).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  website: z.string().url().optional(),
  bankDetailReference: z.string().trim().max(191).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const hierarchyInput = z.object({
  hierarchyType: z.string().trim().min(1).max(80),
  parentPartnerId: z.string().cuid(),
  childPartnerId: z.string().cuid(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
});

export const pageInput = z.object({
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  partnerType: z.enum(NETWORK_PARTNER_TYPES).optional(),
  status: z.string().trim().max(40).optional(),
});

