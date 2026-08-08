"use client";

import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/storefront/nav";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";

export type AnnouncementContent = { message: string; link: string | null } | null;

/**
 * Founder Final Consolidated Polish — measured heights exist ONLY to
 * prevent the nav from ever overlapping the announcement bar; they are
 * never used to create visual spacing. `navTop` is therefore exactly
 * `barHeight` (zero added buffer) — the actual 8–10px breathing room
 * between the bar and the visible nav pill comes entirely from a fixed,
 * un-measured CSS value inside Nav itself (its own `paddingTop`, see
 * nav.tsx), so the gap never grows or shrinks with the bar's real height,
 * only overlap-prevention does. This was the previous bug: an 18px JS gap
 * was being ADDED on top of the nav's own ~16px intrinsic padding,
 * compounding into a much larger visible band than intended.
 */
export function SiteChrome({ announcement }: { announcement: AnnouncementContent }) {
  const [dismissed, setDismissed] = useState(false);
  const [barHeight, setBarHeight] = useState(38);
  const [navHeight, setNavHeight] = useState(80);
  const barRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const showBar = Boolean(announcement) && !dismissed;

  useEffect(() => {
    if (!showBar) return;
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showBar]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => setNavHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const navTop = showBar ? barHeight : 0;
  // Clears the fixed bar+nav stack exactly — no arbitrary extra buffer
  // baked in here. Any intentional "breathing room" below the nav belongs
  // to the hero section's own top padding (a fixed, deterministic value,
  // not derived from this spacer), never doubled up with this one.
  const spacerHeight = navTop + navHeight;

  return (
    <>
      {showBar && announcement && (
        <AnnouncementBar ref={barRef} message={announcement.message} link={announcement.link} onDismiss={() => setDismissed(true)} />
      )}
      <Nav ref={navRef} topOffset={navTop} />
      <div style={{ height: spacerHeight }} />
    </>
  );
}
