"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Expand } from "lucide-react";
import { ProductImage } from "@/components/storefront/product-image";
import { IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";

const MAX_ZOOM = 3;
const DOUBLE_TAP_ZOOM = 2;
const DOUBLE_TAP_MS = 300;
const SWIPE_THRESHOLD_PX = 50;

function distance(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Pinch/double-tap zoom + swipe navigation for one image surface (the main
 * hero or the lightbox). Kept as a small local hook rather than sharing
 * state across both surfaces — they're separate DOM elements with
 * independent zoom levels, and only one is ever visible at a time.
 *
 * Sprint 2 Part 4: single tap does nothing (no onClick-opens-zoom
 * anywhere); swipe/arrow change image; pinch and double-tap zoom; swipe is
 * suppressed while zoomed in, matching how every native photo viewer
 * disambiguates "swipe to pan a zoomed image" from "swipe to change photo."
 */
function useGalleryTouch({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOrigin({ x: 50, y: 50 });
  }, []);

  function pointFromTouches(touches: React.TouchList, rect: DOMRect) {
    const t = touches[0]!;
    return { x: ((t.clientX - rect.left) / rect.width) * 100, y: ((t.clientY - rect.top) / rect.height) * 100 };
  }

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: distance(e.touches[0]!, e.touches[1]!), scale };
      swipeStart.current = null;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      swipeStart.current = { x: t.clientX, y: t.clientY };
    }
  }

  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchStart.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const newDist = distance(e.touches[0]!, e.touches[1]!);
      const nextScale = Math.min(MAX_ZOOM, Math.max(1, pinchStart.current.scale * (newDist / pinchStart.current.dist)));
      setScale(nextScale);
      setOrigin(pointFromTouches(e.touches, rect));
    }
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length > 0) return; // still mid-gesture (one finger lifted of two)
    pinchStart.current = null;

    const start = swipeStart.current;
    swipeStart.current = null;
    const t = e.changedTouches[0];

    // Double tap — toggle zoom, centered on the tap point.
    const now = Date.now();
    if (t && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (scale > 1) {
        resetZoom();
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        setOrigin({ x: ((t.clientX - rect.left) / rect.width) * 100, y: ((t.clientY - rect.top) / rect.height) * 100 });
        setScale(DOUBLE_TAP_ZOOM);
      }
      return;
    }
    lastTap.current = now;

    // Swipe to change image — only when not zoomed in, same as every
    // native photo viewer (a zoomed image pans/pinches, it doesn't swipe).
    if (scale > 1 || !start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? onNext() : onPrev();
    }
  }

  return { scale, origin, onTouchStart, onTouchMove, onTouchEnd, resetZoom };
}

/**
 * Amazon/Nykaa-style product gallery: a vertical thumbnail rail on desktop
 * (mouse wheel scrolls it for free via native `overflow-y: auto`), a
 * horizontal thumbnail strip + swipe on mobile, hover-to-zoom on desktop,
 * pinch/double-tap-to-zoom on touch, and a fullscreen lightbox with
 * arrow/keyboard/swipe/pinch navigation. Cloudinary URLs stored on the
 * product are never rewritten — every image shown here is a *derived*
 * transform of the original via `ProductImage` / `cloudinaryUrl`, requested
 * at the resolution tier appropriate to its role.
 */
export function ProductGallery({ images, productName = "" }: { images: string[]; productName?: string }) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [hoverZoom, setHoverZoom] = useState(false);
  const [hoverOrigin, setHoverOrigin] = useState({ x: 50, y: 50 });

  const hasImages = images.length > 0;

  const goTo = useCallback(
    (i: number) => {
      if (!hasImages) return;
      setActive(((i % images.length) + images.length) % images.length);
    },
    [images.length, hasImages]
  );
  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  const hero = useGalleryTouch({ onNext: next, onPrev: prev });
  const lightbox = useGalleryTouch({ onNext: next, onPrev: prev });

  // Sprint 2 Part 3 — switching variant swaps `images` (a new array
  // reference); reset to the cover image and clear any zoom, without
  // scrolling the page (this is a prop/state change, not a navigation).
  useEffect(() => {
    setActive(0);
    hero.resetZoom();
    lightbox.resetZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, next, prev]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setHoverOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }

  if (!hasImages) {
    return (
      <div style={{ aspectRatio: "1 / 1", width: "100%", maxWidth: 640, borderRadius: 20, border: "1px solid var(--card-border)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="muv-bottle" style={{ width: 100, height: 260 }} />
      </div>
    );
  }

  const heroOrigin = hero.scale > 1 ? hero.origin : hoverOrigin;
  const heroScale = hero.scale > 1 ? hero.scale : hoverZoom ? 1.9 : 1;

  return (
    <div>
      <div className="flex gap-3" style={{ maxWidth: 640 }}>
        {images.length > 1 && (
          <div className="hidden sm:flex flex-col gap-2 flex-shrink-0" style={{ maxHeight: 460, overflowY: "auto", width: 68 }}>
            {images.map((url, i) => (
              <button
                key={url}
                onClick={() => goTo(i)}
                className="rounded-lg overflow-hidden flex-shrink-0"
                style={{ width: 64, height: 64, background: "#fff", border: i === active ? "2px solid var(--lavender)" : "1px solid var(--card-border)", opacity: i === active ? 1 : 0.65, transition: "border-color 0.3s var(--ease), opacity 0.3s var(--ease)" }}
                aria-label={`View image ${i + 1}`}
                aria-current={i === active}
              >
                <ProductImage src={url} alt="" transform={IMAGE_PRESETS.galleryThumbFrame} sizes="64px" />
              </button>
            ))}
          </div>
        )}

        <div
          className="relative rounded-2xl overflow-hidden flex-1"
          style={{ aspectRatio: "1 / 1", border: "1px solid var(--card-border)", background: "#fff", touchAction: "pan-y" }}
          onMouseEnter={() => setHoverZoom(true)}
          onMouseLeave={() => setHoverZoom(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={hero.onTouchStart}
          onTouchMove={hero.onTouchMove}
          onTouchEnd={hero.onTouchEnd}
        >
          <div
            key={active}
            className="w-full h-full muv-gallery-fade transition-transform duration-300 ease-out"
            style={{ transform: `scale(${heroScale})`, transformOrigin: `${heroOrigin.x}% ${heroOrigin.y}%` }}
          >
            <ProductImage
              src={images[active]}
              alt={productName ? `${productName} — image ${active + 1}` : ""}
              transform={IMAGE_PRESETS.galleryFrame}
              sizes="(max-width: 1024px) 90vw, 600px"
              priority
              quality={95}
            />
          </div>

          {images.length > 1 && (
            <>
              <button onClick={prev} className="muv-icon-circle absolute left-3 top-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,0.85)", color: "#0b0b0f", border: "none" }} aria-label="Previous image">
                <ChevronLeft size={16} />
              </button>
              <button onClick={next} className="muv-icon-circle absolute right-3 top-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,0.85)", color: "#0b0b0f", border: "none" }} aria-label="Next image">
                <ChevronRight size={16} />
              </button>
            </>
          )}

          <button
            onClick={() => setLightboxOpen(true)}
            className="muv-icon-circle absolute bottom-3 right-3"
            style={{ background: "rgba(255,255,255,0.85)", color: "#0b0b0f", border: "none" }}
            aria-label="View fullscreen"
          >
            <Expand size={14} />
          </button>
        </div>
      </div>

      {images.length > 1 && (
        <div className="flex sm:hidden gap-2 mt-3 overflow-x-auto">
          {images.map((url, i) => (
            <button key={url} onClick={() => goTo(i)} className="rounded-lg overflow-hidden flex-shrink-0" style={{ width: 56, height: 56, background: "#fff", border: i === active ? "2px solid var(--lavender)" : "1px solid var(--card-border)" }} aria-label={`View image ${i + 1}`}>
              <ProductImage src={url} alt="" transform={IMAGE_PRESETS.galleryThumbFrame} sizes="56px" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center muv-gallery-fade"
          style={{ background: "rgba(5,5,7,0.94)" }}
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen product image"
        >
          <button onClick={() => setLightboxOpen(false)} className="muv-icon-circle absolute top-5 right-5" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }} aria-label="Close fullscreen view">
            <X size={18} />
          </button>

          {images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prev(); }} className="muv-icon-circle absolute left-5 top-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }} aria-label="Previous image">
                <ChevronLeft size={20} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); next(); }} className="muv-icon-circle absolute right-5 top-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }} aria-label="Next image">
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <div
            key={active}
            className="relative muv-gallery-fade overflow-hidden"
            style={{ width: "min(90vw, 900px)", height: "min(85vh, 900px)", touchAction: "pan-y" }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={lightbox.onTouchStart}
            onTouchMove={lightbox.onTouchMove}
            onTouchEnd={lightbox.onTouchEnd}
          >
            <div className="w-full h-full transition-transform duration-200 ease-out" style={{ transform: `scale(${lightbox.scale})`, transformOrigin: `${lightbox.origin.x}% ${lightbox.origin.y}%` }}>
              <ProductImage src={images[active]} alt={productName} transform={IMAGE_PRESETS.lightbox} sizes="90vw" quality={95} rounded={12} />
            </div>
          </div>

          <p className="absolute bottom-5 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{active + 1} / {images.length}</p>
        </div>
      )}
    </div>
  );
}
