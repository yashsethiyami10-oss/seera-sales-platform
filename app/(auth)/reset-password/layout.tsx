import { buildMetadata } from "@/lib/seo";

/** See app/(auth)/login/layout.tsx for why this exists as a nested layout
 * rather than a metadata export on the (Client Component) page itself. */
export const metadata = buildMetadata({ title: "Reset Password", path: "/reset-password", noIndex: true });

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
