import { prisma } from "@/lib/prisma";
import { SettingsFormClient } from "@/components/admin/settings-form-client";

export default async function AdminSettingsPage() {
  const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" } });

  const initial = {
    businessName: settings?.businessName ?? "Muv",
    gstin: settings?.gstin ?? "",
    addressLine1: settings?.addressLine1 ?? "",
    addressLine2: settings?.addressLine2 ?? "",
    city: settings?.city ?? "",
    state: settings?.state ?? "",
    pincode: settings?.pincode ?? "",
    supportEmail: settings?.supportEmail ?? "",
    supportPhone: settings?.supportPhone ?? "",
    shippingFee: settings?.shippingFee ?? 49,
    freeShippingThreshold: settings?.freeShippingThreshold ?? 999,
    codEnabled: settings?.codEnabled ?? true,
    codFee: settings?.codFee ?? 0,
    taxNote: settings?.taxNote ?? "",
    instagramUrl: settings?.instagramUrl ?? "",
    facebookUrl: settings?.facebookUrl ?? "",
    twitterUrl: settings?.twitterUrl ?? "",
    whatsappNumber: settings?.whatsappNumber ?? "",
    adminNotificationEmail: settings?.adminNotificationEmail ?? "",
    notifyAdminNewOrder: settings?.notifyAdminNewOrder ?? true,
    notifyAdminFailedPayment: settings?.notifyAdminFailedPayment ?? true,
    notifyAdminLowStock: settings?.notifyAdminLowStock ?? true,
    notifyAdminNewInquiry: settings?.notifyAdminNewInquiry ?? true,
    notifyAdminNewReview: settings?.notifyAdminNewReview ?? true,
  };

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Settings</h1>
      <SettingsFormClient initial={initial} />
    </div>
  );
}
