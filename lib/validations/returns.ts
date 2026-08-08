import { z } from "zod";

export const returnIssueTypeValues = ["DAMAGED", "LEAKED", "WRONG_PRODUCT"] as const;
export const returnRequestStatusValues = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "REPLACEMENT_INITIATED",
  "RESOLVED",
] as const;

// Enforced server-side in actions/returns.ts's submitReturnRequest (not just
// disabled in the UI) — a request forged straight at the server action must
// not be able to skip a stage or resurrect a rejected/resolved ticket.
export const RETURN_REQUEST_ALLOWED_TRANSITIONS: Record<(typeof returnRequestStatusValues)[number], string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["REPLACEMENT_INITIATED", "RESOLVED"],
  REJECTED: [],
  REPLACEMENT_INITIATED: ["RESOLVED"],
  RESOLVED: [],
};

export const submitReturnRequestSchema = z.object({
  orderId: z.string().cuid(),
  orderItemId: z.string().cuid(),
  issueType: z.enum(returnIssueTypeValues),
  description: z.string().min(10, "Please describe the issue in a bit more detail").max(1000),
  // Photo/video evidence is mandatory — see PHASE_1D_DEFECT_LOG.md, the
  // approved policy requires it on every request, not just recommends it.
  evidenceUrls: z.array(z.string().url()).min(1, "At least one photo or video is required").max(5),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
});

export const updateReturnRequestStatusSchema = z.object({
  returnRequestId: z.string().cuid(),
  status: z.enum(returnRequestStatusValues),
  adminNotes: z.string().max(1000).optional(),
});

export const returnEvidenceUploadRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
});

export type SubmitReturnRequestInput = z.infer<typeof submitReturnRequestSchema>;
