import { prisma } from "@/lib/prisma";
import { SiteChrome } from "@/components/storefront/site-chrome";
import { Footer } from "@/components/storefront/footer";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const bar = await prisma.announcementBar.findUnique({ where: { id: "singleton" } });
  const announcement = bar?.active ? { message: bar.message, link: bar.link } : null;

  return (
    <>
      {/* Skip link (PHASE_6C §7) — first focusable element on every
          storefront page, invisible until keyboard-focused. */}
      <a href="#main-content" className="muv-skip-link">
        Skip to content
      </a>
      <SiteChrome announcement={announcement} />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  );
}
