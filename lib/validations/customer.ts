import { z } from "zod";

export const updateCustomerSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(2).max(100).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number")
    .optional(),
  marketingOptIn: z.boolean().optional(),
});

export const addressSchema = z.object({
  label: z.string().min(1).max(30),
  line1: z.string().min(3).max(150),
  line2: z.string().max(150).optional(),
  city: z.string().min(2).max(60),
  state: z.string().min(2).max(60),
  pincode: z.string().regex(/^\d{6}$/, "PIN code must be 6 digits"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  isDefault: z.boolean().default(false),
});

export const createAddressSchema = addressSchema.extend({ customerId: z.string().cuid() });
export const updateAddressSchema = addressSchema.partial().extend({ id: z.string().cuid() });

export const addCustomerNoteSchema = z.object({
  customerId: z.string().cuid(),
  body: z.string().min(1, "Note can't be empty").max(1000),
});

export const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name").max(100),
  // Phase 1D — trim + lowercase, matching lib/auth.ts's credentialsSchema so
  // a signup and a later login always compare the same normalized value.
  // Order matters — see lib/auth.ts's comment on the same pattern.
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[0-9]/, "Include at least one number"),
});
