import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * next/link for the Seera portals, with prefetching off by default. Every portal page is dynamic
 * (session + database), so Next's default viewport prefetch fired one full server render per visible
 * link - measured at 10-24 extra renders per page view on list pages (TEST, 2026-10-14). Pass
 * `prefetch` explicitly to opt a specific link back in.
 */
export default function PortalLink({ prefetch = false, ...props }: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch} {...props} />;
}
