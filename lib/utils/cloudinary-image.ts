/**
 * Injects a Cloudinary delivery transformation into an already-uploaded
 * asset's URL for *display* only. The URL stored on the Product row (the
 * `secure_url` returned by the signed upload — see
 * components/admin/image-uploader.tsx) is never rewritten in the database;
 * every page derives its own render-time URL from that one stored original,
 * so there is exactly one source of truth and switching a transform never
 * touches stored data.
 */
export type CloudinaryTransform = {
  width?: number;
  height?: number;
  quality?: "auto" | number;
  /** "limit" never upscales past the original — a low-res source stays low-res
   * instead of being blown up into a blurry "large" image. "pad" fits the
   * whole image into the given width/height without cropping, filling any
   * leftover space with `background` — this is what bakes a pure-white
   * frame into the delivered asset itself (see `background` below). */
  crop?: "limit" | "fill" | "fit" | "thumb" | "scale" | "pad";
  gravity?: "auto" | "center" | "face";
  /** Only meaningful with crop:"pad". Fills the padded canvas with this
   * colour (e.g. "white") so the frame's own background and the delivered
   * image's edge always match exactly, regardless of the source photo's
   * baked-in background tone — fixes visible seams/side-lines that occur
   * when a CSS white background sits behind an object-contain image whose
   * own canvas isn't quite the same shade of white. */
  background?: string;
};

export function cloudinaryUrl(url: string, transform: CloudinaryTransform = {}): string {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;

  const { width, height, quality = "auto", crop = "limit", gravity, background } = transform;
  const parts = ["f_auto", `q_${quality}`, "dpr_auto", `c_${crop}`];
  if (width) parts.push(`w_${width}`);
  if (height) parts.push(`h_${height}`);
  if (gravity) parts.push(`g_${gravity}`);
  if (background) parts.push(`b_${background}`);

  return url.replace("/upload/", `/upload/${parts.join(",")}/`);
}

/**
 * One shared quality tier per visual role, reused by every page that shows
 * a product photo — a card on the homepage, the shop grid, a search result,
 * and the wishlist all request the same "thumbnail" tier, so no two pages
 * ever render the same product at a different resolution.
 */
export const IMAGE_PRESETS = {
  thumbnail: { width: 480, crop: "limit" } satisfies CloudinaryTransform, // grid cards everywhere
  micro: { width: 160, crop: "limit" } satisfies CloudinaryTransform, // cart line items, gallery rail thumbs
  gallery: { width: 1400, crop: "limit" } satisfies CloudinaryTransform, // product-detail main image
  lightbox: { width: 2400, crop: "limit" } satisfies CloudinaryTransform, // fullscreen viewer

  /**
   * Product Detail Page main hero only. Pads every source photo onto a
   * fixed square, pure-white canvas instead of just constraining its
   * width — so a portrait bottle shot, a square infographic and a
   * landscape pack shot all deliver at the exact same frame size with the
   * exact same white, and the CSS frame around it never needs to guess at
   * (or expose a seam against) the source photo's own background tone.
   * Never crops — "pad" only ever adds canvas, it doesn't remove content.
   */
  galleryFrame: { width: 1400, height: 1400, crop: "pad", background: "white", gravity: "center" } satisfies CloudinaryTransform,
  /** Same treatment at rail/strip thumbnail scale, PDP gallery only. */
  galleryThumbFrame: { width: 200, height: 200, crop: "pad", background: "white", gravity: "center" } satisfies CloudinaryTransform,
};
