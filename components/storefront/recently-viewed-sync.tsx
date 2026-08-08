"use client";

import { useEffect } from "react";
import { mergeGuestRecentlyViewed } from "@/actions/recently-viewed";

const STORAGE_KEY = "muv-recently-viewed";
const MERGED_FLAG = "muv-rv-merged";

/**
 * Mounted once in the root layout (inert — renders nothing). Deliberately
 * checks login state with a client-side fetch to NextAuth's own
 * `/api/auth/session` endpoint rather than a server-side `auth()` call in
 * the root layout — reading cookies in a Server Component that wraps every
 * route would make the entire site dynamic (every static marketing page
 * losing prerendering just to support this one merge check), which a real
 * regression caught during this phase's build verification. On the first
 * render after a real login, reads the guest's localStorage "recently
 * viewed" slugs (written by components/storefront/recently-viewed.tsx) and
 * merges them into that customer's real DB history exactly once per browser
 * session, via sessionStorage's one-time flag — never re-merges on every
 * page navigation.
 */
export function RecentlyViewedSync() {
  useEffect(() => {
    if (sessionStorage.getItem(MERGED_FLAG)) return;

    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        if (!session?.user) return;

        let slugs: string[] = [];
        try {
          const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as { slug: string }[];
          slugs = list.map((p) => p.slug);
        } catch {
          slugs = [];
        }

        sessionStorage.setItem(MERGED_FLAG, "1");
        if (slugs.length > 0) {
          mergeGuestRecentlyViewed({ slugs }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
