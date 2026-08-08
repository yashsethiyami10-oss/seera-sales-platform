import { buildMetadata } from "@/lib/seo";

/**
 * app/(auth)/login/page.tsx is a Client Component (needs useState/signIn),
 * so it can't export `metadata` itself — Next.js requires that export from a
 * Server Component. This nested layout adds real, page-specific metadata
 * (Phase 16) without touching the page. Previously login/signup/reset-
 * password all silently inherited the root layout's homepage metadata,
 * including its canonical URL ("/") — meaning all three claimed the
 * homepage as their canonical page, which is genuinely wrong, not just
 * incomplete. `noIndex: true` since an auth form has no real SEO value.
 */
export const metadata = buildMetadata({ title: "Log In", path: "/login", noIndex: true });

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
