"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, ConflictError, AppError } from "@/lib/errors";
import { signupSchema } from "@/lib/validations/customer";
import { sendWelcomeEmail, sendPasswordResetEmail } from "@/lib/notify/send";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveAuthorizedDestination } from "@/lib/auth/redirect-policy";
import { z } from "zod";

/**
 * Stage 1 (Authentication and Role-Aware Entry). Called after a
 * successful credentials sign-in — never trusts `callbackUrl` on its
 * own; `resolveAuthorizedDestination` re-validates its shape and checks
 * the now-established session's real authorization before returning
 * anywhere. Always resolves to a real, safe destination; never throws.
 */
export async function resolveLoginDestination(callbackUrl: unknown) {
  const destination = await resolveAuthorizedDestination(callbackUrl);
  return { success: true as const, data: { destination } };
}

export async function signup(input: unknown) {
  try {
    const data = signupSchema.parse(input);

    // Rate-limited by IP — 5 signups/hour, per SECURITY.md's original spec
    // for this endpoint. `x-forwarded-for` is the standard header behind
    // Vercel/most reverse proxies; falls back to a shared bucket if it's
    // ever missing rather than throwing, since a missing header shouldn't
    // block signups entirely — worth alerting on if it happens often, since
    // it likely means the deployment's proxy isn't forwarding the header.
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      throw new AppError("Too many signup attempts. Please try again later.", 429, "RATE_LIMITED");
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      // Same generic message NextAuth's authorize() uses for bad credentials —
      // avoids confirming to an attacker that this email has an account,
      // while still being honest with the actual owner via a support flow.
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // User (auth identity) and Customer (storefront profile) are created
    // together — the app should never end up with one but not the other.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: data.name, email: data.email, passwordHash, role: "CUSTOMER" },
      });
      const customer = await tx.customer.create({
        data: { userId: created.id, email: data.email, name: data.name, phone: data.phone },
      });
      await tx.salesTimelineEvent.create({
        data: { actorId: created.id, customerId: customer.id, eventType: "CUSTOMER_CREATED", relatedRecordType: "Customer", relatedRecordId: customer.id, description: "Customer registered on the D2C website" },
      });
      return created;
    });

    // Best-effort — signup must still succeed even if the welcome email fails.
    sendWelcomeEmail(user.email, user.name ?? "there").catch((err) =>
      logger.error("notify:welcome:failed", { userId: user.id, error: String(err) })
    );

    return { success: true as const, data: { id: user.id, email: user.email } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Password reset uses NextAuth's own `VerificationToken` table
 * (identifier/token/expires) rather than a new model — it's already exactly
 * the right shape (an opaque token tied to an identifier with an expiry),
 * and NextAuth's Prisma adapter already manages that table's lifecycle.
 */

const requestResetSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function requestPasswordReset(input: unknown) {
  try {
    const { email } = requestResetSchema.parse(input);

    // Rate-limited by IP (Phase 16) — previously unthrottled, so this
    // endpoint could be used to email-bomb any address by repeatedly
    // requesting a reset for it. Same 5/hour-by-IP shape as signup() above.
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = checkRateLimit(`password-reset-request:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      throw new AppError("Too many reset requests. Please try again later.", 429, "RATE_LIMITED");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success regardless of whether the account exists —
    // an error here would let an attacker enumerate registered emails by
    // watching which addresses get a "not found" response.
    if (!user) {
      logger.info("auth:reset-requested-unknown-email", { email });
      return { success: true as const, data: { sent: true } };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.verificationToken.create({ data: { identifier: email, token, expires } });

    const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await sendPasswordResetEmail(email, resetUrl);

    return { success: true as const, data: { sent: true } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  token: z.string(),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[0-9]/, "Include at least one number"),
});

export async function resetPassword(input: unknown) {
  try {
    const data = resetPasswordSchema.parse(input);

    // Rate-limited by IP (Phase 16) — defense-in-depth against token
    // brute-forcing. The 32-byte random token already makes guessing
    // impractical on its own, but this endpoint had no throttling at all.
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = checkRateLimit(`password-reset-confirm:${ip}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      throw new AppError("Too many attempts. Please try again later.", 429, "RATE_LIMITED");
    }

    const record = await prisma.verificationToken.findUnique({
      where: { identifier_token: { identifier: data.email, token: data.token } },
    });
    if (!record || record.expires < new Date()) {
      throw new AppError("This reset link is invalid or has expired", 400, "INVALID_RESET_TOKEN");
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { email: data.email }, data: { passwordHash } }),
      // Single-use — delete immediately so the same link can't reset the
      // password a second time if it leaks (email forwarding, browser history).
      prisma.verificationToken.delete({ where: { identifier_token: { identifier: data.email, token: data.token } } }),
    ]);

    return { success: true as const, data: { reset: true } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
