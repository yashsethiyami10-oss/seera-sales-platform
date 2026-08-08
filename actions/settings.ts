"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import { storeSettingsSchema } from "@/lib/validations/settings";

/** Same singleton upsert pattern as updateAnnouncementBar/updateNewsletterContent
 * (actions/cms.ts) — one row, id fixed to "singleton". */
export async function updateStoreSettings(input: unknown) {
  try {
    await requireStaff();
    const data = storeSettingsSchema.parse(input);

    const settings = await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });

    revalidatePath("/admin/settings");
    return { success: true as const, data: settings };
  } catch (err) {
    return toErrorResponse(err);
  }
}
