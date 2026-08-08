import { buildMetadata } from "@/lib/seo";

/** See app/(auth)/login/layout.tsx for why this exists as a nested layout
 * rather than a metadata export on the (Client Component) page itself. */
export const metadata = buildMetadata({ title: "Create Account", path: "/signup", noIndex: true });

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
