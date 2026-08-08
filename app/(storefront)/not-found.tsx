import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Next.js App Router convention file — catches every `notFound()` call
 * inside the storefront segment (bad product/category/blog slug, etc.) and
 * anything under this route group with no matching page. Placed inside
 * app/(storefront)/ so it renders wrapped in that layout's real Nav/Footer
 * (components/storefront/site-chrome.tsx, footer.tsx) rather than a bare
 * page — previously there was no not-found.tsx anywhere, so a bad product
 * URL fell through to Next's generic, unbranded 404.
 */
export default function StorefrontNotFound() {
  return (
    <div className="max-w-xl mx-auto px-6 text-center" style={{ paddingTop: 120, paddingBottom: 120 }}>
      <div className="muv-icon-circle mb-6" style={{ width: 56, height: 56, margin: "0 auto" }} aria-hidden>
        <Compass size={22} />
      </div>
      <p className="muv-text-body text-[11px] uppercase tracking-[0.3em] mb-4">404</p>
      <h1 className="font-display text-white mb-3" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>
        This page has wandered off
      </h1>
      <p className="muv-text-meta text-sm mb-8" style={{ maxWidth: "40ch", margin: "0 auto" }}>
        The page you&rsquo;re looking for doesn&rsquo;t exist, or may have moved. Let&rsquo;s get you back to something real.
      </p>
      <div className="flex items-center gap-3 justify-center flex-wrap">
        <Link href="/shop"><Button variant="primary">Shop All Products</Button></Link>
        <Link href="/"><Button variant="ghost">Back to Home</Button></Link>
      </div>
    </div>
  );
}
