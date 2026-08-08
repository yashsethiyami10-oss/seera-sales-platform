import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { ProfileEditForm } from "@/components/account/profile-edit-form";
import { AddressManager } from "@/components/account/address-manager";

export const metadata = buildMetadata({ title: "Profile", path: "/account/profile", noIndex: true });

export default async function ProfilePage() {
  const session = await auth();
  const customer = await prisma.customer.findUnique({
    where: { userId: session!.user.id },
    include: { addresses: { orderBy: { isDefault: "desc" } } },
  });
  if (!customer) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.8rem" }}>Profile</h1>
        <ProfileEditForm customerId={customer.id} name={customer.name} email={customer.email} phone={customer.phone} />
      </div>

      <div>
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Saved Addresses</h2>
        <AddressManager customerId={customer.id} addresses={customer.addresses} />
      </div>
    </div>
  );
}
