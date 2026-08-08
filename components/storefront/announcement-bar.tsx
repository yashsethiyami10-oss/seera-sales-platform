"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Gift, X } from "lucide-react";

/**
 * Hero Final Polish — a premium outline gift icon (lucide's `Gift`, stroke-
 * based, not an emoji) precedes the message, lavender-accented and
 * vertically centered via the shared flex row. Forwards its root ref so
 * SiteChrome can measure the bar's real rendered height (it can wrap to two
 * lines on a narrow viewport with a long message) instead of assuming a
 * fixed height — that mismatch was the actual cause of the nav
 * overlapping/touching the bar.
 */
export const AnnouncementBar = forwardRef<HTMLDivElement, { message: string; link?: string | null; onDismiss: () => void }>(
  function AnnouncementBar({ message, link, onDismiss }, ref) {
    return (
      <div ref={ref} className="muv-announcement-bar" role="region" aria-label="Announcement">
        <Gift size={14} strokeWidth={1.5} className="muv-announcement-bar-icon" aria-hidden />
        {link ? (
          <Link href={link}>{message}</Link>
        ) : (
          <span>{message}</span>
        )}
        <button type="button" onClick={onDismiss} aria-label="Dismiss announcement" className="muv-announcement-bar-dismiss">
          <X size={13} />
        </button>
      </div>
    );
  }
);
