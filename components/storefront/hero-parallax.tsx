"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * MUV Living Hero™ — desktop-only mouse parallax.
 *
 * One listener sets two CSS custom properties (--mx/--my, normalized
 * -1..1) on this wrapper; every descendant layer reads the same pair and
 * multiplies by its own fixed px factor in CSS (family barely moves,
 * products move more, capsules move least — see .muv-parallax-* in
 * globals.css). That keeps this component tiny and keeps all the "how far
 * does X move" tuning in one place (CSS), not scattered across JS.
 *
 * Deliberately does nothing on touch/coarse-pointer devices — the founder
 * brief is explicit that mobile has no mouse parallax at all, so the
 * listener is never attached there rather than attached-and-ignored.
 * rAF-throttled so it can never queue faster than the screen can paint
 * ("no lag, no jump" from the same brief).
 */
export function HeroParallax({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let pendingX = 0;
    let pendingY = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--mx", pendingX.toFixed(3));
      el.style.setProperty("--my", pendingY.toFixed(3));
    };

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Normalized -1..1 from the stage's own center, clamped — a cursor
      // well outside the stage shouldn't drive an exaggerated offset.
      pendingX = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      pendingY = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      pendingX = 0;
      pendingY = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={className} style={{ ["--mx" as any]: 0, ["--my" as any]: 0 }}>
      {children}
    </div>
  );
}
