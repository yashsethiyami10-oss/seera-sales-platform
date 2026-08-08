import { z } from "zod";

export const phase2SourceReferenceSchema = z.object({
  organizationKey: z.literal("MUV"),
  sourceDomain: z.string().trim().min(1).max(80),
  sourceEntityType: z.string().trim().min(1).max(80),
  sourceEntityId: z.string().trim().min(1).max(191),
  sourceEventId: z.string().trim().min(1).max(191).optional(),
  sourceDocumentNo: z.string().trim().min(1).max(191).optional(),
  sourceVersion: z.number().int().positive().optional(),
});

export const phase2OperationSchema = z.object({
  organizationKey: z.literal("MUV"),
  operationType: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(191),
  correlationId: z.string().uuid(),
});

export const phase2PolicyVersionSchema = z.object({
  organizationKey: z.literal("MUV"),
  policyType: z.string().trim().min(1).max(80),
  policyKey: z.string().trim().min(1).max(100),
  version: z.number().int().positive(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  configuration: z.record(z.unknown()),
}).superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be after effectiveFrom" });
  }
});
