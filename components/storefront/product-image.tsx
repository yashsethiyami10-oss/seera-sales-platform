"use client";

import { useState } from "react";
import Image from "next/image";
import { cloudinaryUrl, type CloudinaryTransform } from "@/lib/utils/cloudinary-image";

// Static shimmer placeholder — same white product-shot background this
// component always renders on, so the blur-up never flashes a mismatched
// colour before the real Cloudinary image arrives. One shared constant,
// not fetched per image, since every product photo already sits on the
// same white background regardless of the product itself.
// btoa (not Buffer) — this component runs client-side too, where Buffer doesn't
// exist; btoa is a standard global in both browsers and this project's Node version.
const SHIMMER = `data:image/svg+xml;base64,${btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#f5f5f5"/></svg>`
)}`;

/**
 * The one image-rendering strategy used everywhere a product photo appears
 * — grid cards, quick view, the detail-page gallery, cart, wishlist. Same
 * white background, same `object-fit: contain` (a product shot is never
 * cropped or stretched to fill its box), same Cloudinary transform +
 * next/image responsive pipeline every time, so no page ever shows a
 * different quality tier for the same product (Issue 6).
 */
export function ProductImage({
  src,
  alt,
  transform,
  sizes,
  priority,
  quality = 90,
  fill = true,
  width,
  height,
  className,
  rounded = 0,
}: {
  src?: string | null;
  alt: string;
  transform?: CloudinaryTransform;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  rounded?: number;
}) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={className}
        style={{ width: "100%", height: "100%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: rounded }}
      >
        <div className="muv-bottle" style={{ width: "28%", height: "62%" }} />
      </div>
    );
  }

  const optimizedSrc = cloudinaryUrl(src, transform);
  const resolvedSizes = sizes ?? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", background: "#fff", borderRadius: rounded, overflow: "hidden" }}>
      {fill ? (
        <Image
          src={optimizedSrc}
          alt={alt}
          fill
          sizes={resolvedSizes}
          quality={quality}
          priority={priority}
          placeholder="blur"
          blurDataURL={SHIMMER}
          onError={() => setErrored(true)}
          style={{ objectFit: "contain", objectPosition: "center" }}
        />
      ) : (
        <Image
          src={optimizedSrc}
          alt={alt}
          width={width ?? 400}
          height={height ?? 400}
          sizes={resolvedSizes}
          quality={quality}
          priority={priority}
          placeholder="blur"
          blurDataURL={SHIMMER}
          onError={() => setErrored(true)}
          style={{ objectFit: "contain", objectPosition: "center", width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
