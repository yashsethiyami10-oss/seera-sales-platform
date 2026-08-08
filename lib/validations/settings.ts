import { z } from "zod";

export const storeSettingsSchema = z.object({
  businessName: z.string().min(1).max(120),
  gstin: z.string().max(20).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  pincode: z.string().max(10).optional(),
  supportEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  supportPhone: z.string().max(20).optional(),
  shippingFee: z.number().int().min(0),
  freeShippingThreshold: z.number().int().min(0),
  codEnabled: z.boolean(),
  codFee: z.number().int().min(0),
  taxNote: z.string().max(300).optional(),
  instagramUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  facebookUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  twitterUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  whatsappNumber: z.string().max(20).optional(),
  adminNotificationEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  notifyAdminNewOrder: z.boolean(),
  notifyAdminFailedPayment: z.boolean(),
  notifyAdminLowStock: z.boolean(),
  notifyAdminNewInquiry: z.boolean(),
  notifyAdminNewReview: z.boolean(),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;
