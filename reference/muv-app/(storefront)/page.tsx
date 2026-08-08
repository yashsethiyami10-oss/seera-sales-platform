import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Sparkles, Droplet, ShieldCheck, Leaf, Car, FlaskConical } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Reveal } from "@/components/ui/reveal";
import { Aura, Button } from "@/components/ui/primitives";
import { FeaturedProducts, type FeaturedProduct } from "@/components/storefront/featured-products";
import { HeroParallax } from "@/components/storefront/hero-parallax";
import { WhyChooseMuv } from "@/components/storefront/why-choose-muv";
import { BrandStory } from "@/components/storefront/brand-story";
import { SocialProof } from "@/components/storefront/social-proof";
import { BusinessSection } from "@/components/storefront/business-section";
import { PersonalizedSection } from "@/components/storefront/personalized-section";
import { getRecommendedForYou, getTrendingProducts, getNewArrivals } from "@/lib/recommendations";
import { getRecentlyViewed } from "@/actions/recently-viewed";
import { extractUSP } from "@/lib/utils/extract-usp";

/**
 * Phase 14A — shapes any of the recommendation engine's real Prisma results
 * (getTrendingProducts/getNewArrivals/getRecommendedForYou/getRecentlyViewed
 * all return this same shape) into a FeaturedProduct, same variant-sorting/
 * badge logic the existing Featured Products section below already uses —
 * not a second, divergent implementation of "pick the display variant."
 */
function toFeaturedProduct(
  p: {
    id: string; name: string; slug: string; images: string[]; content: { keyBenefits: string | null } | null;
    category: { name: string };
    variants: { id: string; size: string; price: number; mrp: number; inventory?: { quantity: number; lowStockThreshold: number } | null }[];
    reviews: { rating: number }[];
  },
  i = 0
): FeaturedProduct {
  const sorted = [...p.variants].sort((a, b) => {
    const aIn = (a.inventory?.quantity ?? 0) > 0 ? 0 : 1;
    const bIn = (b.inventory?.quantity ?? 0) > 0 ? 0 : 1;
    return aIn !== bIn ? aIn - bIn : a.price - b.price;
  });
  const v = sorted[0];
  const variant = v ? { id: v.id, size: v.size, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10 } : null;
  const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
  const badge: FeaturedProduct["badge"] = variant && variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold ? "Limited" : i === 0 ? "New" : null;
  // Production Customer Content Layer is the only source of the card's USP
  // text (Founder Decision, Product Content Architecture) — extractUSP
  // returns undefined/empty when there's no approved content, which
  // FeaturedProducts already renders as "no USP line" rather than blank text.
  return { id: p.id, name: p.name, slug: p.slug, category: { name: p.category.name }, images: p.images, usp: extractUSP(p.content?.keyBenefits ?? null), badge, rating, reviewCount: p.reviews.length, variant };
}

const CATEGORY_ICONS: Record<string, any> = {
  "home-care": Sparkles, "fabric-care": Droplet, "body-care": ShieldCheck,
  "personal-care": Leaf, "car-care": Car, "skin-care": Droplet,
};
// Founder Final Consolidated Polish had "personal-care" missing from this
// list entirely, so it fell through to CATEGORY_ORDER.length (last) instead
// of its intended 5th position — Skin Care (Muving Soon™, meant to stay
// last) was rendering BEFORE Personal Care on production. Fixed as part of
// the Care Worlds Flagship Upgrade (Founder Phase 2).
const CATEGORY_ORDER = ["body-care", "home-care", "fabric-care", "car-care", "personal-care", "skin-care"];

/**
 * Care Worlds — Founder "Real Photographic Environments" pass. Every
 * bgImage below is a real, Founder-supplied AI-generated photographic
 * background plate (`public/transparent.png/careworld/background/
 * backgrounds/`) — opaque commercial-photography-style scenes, not a
 * CSS/gradient/particle simulation. Per the Founder's explicit new rule,
 * CSS no longer tries to recreate an environment; it only composites the
 * real transparent product PNG onto the real photo (position/scale,
 * shadow, reflection, and a light colour-temperature wash — never the
 * label/bottle/logo itself, never the environment photo's content).
 * stageTop/stageSize still position/scale each product individually (the
 * "stop using one positioning system" requirement from Project Aurora).
 * Skin Care has no product image (zero live SKUs, never fabricated) — its
 * background photo (an empty marble/glass vignette) is the entire card.
 */
const CATEGORY_VISUALS: Record<
  string,
  { image: string | null; alt: string; bgImage: string; accentRgb: string; stageTop: number; stageSize: number }
> = {
  // Midnight Frost — cold spa/shower environment; ~10% larger and lower.
  "body-care": { image: "/transparent.png/careworld/careworlds/midnightfrostbodywash.png", alt: "Muv Midnight Frost Body Wash", bgImage: "/transparent.png/careworld/background/backgrounds/bodycarebackground.png", accentRgb: "140, 185, 230", stageTop: 9, stageSize: 84 },
  // Cloud Walk Floor Cleaner — bright luxury home environment, balanced.
  "home-care": { image: "/transparent.png/careworld/careworlds/cloudwalk.png", alt: "Muv Cloud Walk Floor Cleaner", bgImage: "/transparent.png/careworld/background/backgrounds/homecarebackground.png", accentRgb: "225, 232, 240", stageTop: 5, stageSize: 76 },
  // Indian Rose Liquid Detergent — warm luxury fragrance/vanity
  // environment, sitting slightly lower.
  "fabric-care": { image: "/transparent.png/careworld/careworlds/indianroseliquiddetergent.png", alt: "Muv Indian Rose Liquid Detergent", bgImage: "/transparent.png/careworld/background/backgrounds/fabriccarebackground.png", accentRgb: "224, 150, 130", stageTop: 9, stageSize: 76 },
  // Car Wash — premium detailing garage, orange practical lights, wet
  // reflective floor, center-weighted.
  "car-care": { image: "/transparent.png/careworld/careworlds/carwash.png", alt: "Muv Car Wash", bgImage: "/transparent.png/careworld/background/backgrounds/carcarebackground.png", accentRgb: "224, 150, 90", stageTop: 6, stageSize: 76 },
  // Silk Blossom Hand Wash — warm luxury bathroom environment; ~12%
  // larger and lower.
  "personal-care": { image: "/transparent.png/careworld/careworlds/silkbloosmhandwash.png", alt: "Muv Silk Blossom Hand Wash", bgImage: "/transparent.png/careworld/background/backgrounds/personalcarebackground.png", accentRgb: "224, 170, 150", stageTop: 9, stageSize: 85 },
  // Muving Soon™ — zero live SKUs, so no product image (never fabricated
  // to fill the card); the real "empty luxury cosmetic lab" photo plate
  // carries the whole card, with the status text as its hero (see
  // .muv-category-card-status--hero).
  "skin-care": { image: null, alt: "", bgImage: "/transparent.png/careworld/background/backgrounds/skincarebackground.png", accentRgb: "220, 200, 220", stageTop: 0, stageSize: 0 },
};

/**
 * MUV Living Hero™ — Care Constellation. Real transparent product PNGs
 * (the same five already approved and shipped in Care Worlds — no new
 * assets, no regeneration) arranged organically around the real Family
 * photo. Skin Care is intentionally omitted here, same as everywhere else
 * in this codebase: it has zero live SKUs, so there is no real product PNG
 * for it and none is fabricated to fill a slot.
 */
/**
 * MUV Living Hero™ — final Master Hero recreation
 * (public/hero/MUV-HERO-MASTER.png, founder-approved, frozen reference).
 *
 * Positions/sizes below were measured from that reference and adapted to
 * this stage's actual (portrait-ish) aspect ratio — the master's own frame
 * is a wide 1376x768 crop, so its raw percentages don't transfer 1:1 onto
 * a taller container; the *relative arrangement* (Home/Fabric Care on the
 * left, Body/Personal/Car Care on the right, Skin Care smallest in the
 * bottom-right corner) is what was preserved exactly.
 *
 * floatAmp/floatDur are the founder's exact per-product spec (px / s) —
 * real configurable values, not magic numbers scattered through CSS.
 * Every product uses its own so none are ever synchronized.
 */
const HERO_CONSTELLATION = [
  { key: "home-care", label: "Home Care", image: "/transparent.png/careworld/careworlds/cloudwalk.png", accentRgb: "225, 232, 240", Icon: Sparkles, left: 6, top: 4, width: 19, floatAmp: 6, floatDur: 8.4 },
  { key: "fabric-care", label: "Fabric Care", image: "/transparent.png/careworld/careworlds/indianroseliquiddetergent.png", accentRgb: "132, 108, 200", Icon: Droplet, left: 4, top: 50, width: 18, floatAmp: 5, floatDur: 7.9 },
  { key: "body-care", label: "Body Care", image: "/transparent.png/careworld/careworlds/midnightfrostbodywash.png", accentRgb: "140, 185, 230", Icon: ShieldCheck, left: 74, top: 6, width: 16, floatAmp: 7, floatDur: 9.2 },
  { key: "personal-care", label: "Personal Care", image: "/transparent.png/careworld/careworlds/silkbloosmhandwash.png", accentRgb: "224, 170, 150", Icon: Leaf, left: 77, top: 36, width: 14, floatAmp: 4, floatDur: 8.8 },
  { key: "car-care", label: "Car Care", image: "/transparent.png/careworld/careworlds/carwash.png", accentRgb: "224, 150, 90", Icon: Car, left: 72, top: 64, width: 15, floatAmp: 6, floatDur: 7.5 },
] as const;

/**
 * Skin Care in the Master Hero shows a small product bottle — but Skin
 * Care has zero live SKUs and no real transparent product PNG exists
 * anywhere in the project (verified before writing this). Per the
 * standing "never fabricate a product" rule that's applied identically
 * everywhere else in this codebase, only its capsule ("Muving Soon™") is
 * recreated, at the master's bottom-right corner position, with no bottle.
 */
const HERO_SKIN_CARE = { label: "Skin Care", sublabel: "Muving Soon™", accentRgb: "205, 188, 226", Icon: FlaskConical, left: 82, top: 84, floatAmp: 3, floatDur: 10.1 };

/**
 * Hero showcase images — a real uploaded MUV product photo, background-
 * removed to a genuine transparent PNG (processed once with sharp, not a
 * CSS trick) so it can sit directly on the hero's dark background with no
 * white box. Most of what's uploaded through the admin media library today
 * is full marketing collages (lifestyle photography, text callouts) rather
 * than an isolated product shot, and Cloudinary's AI background-removal
 * add-on isn't enabled on this account, so this maps specific known-clean
 * source photos to their pre-processed cutout. A product without an entry
 * here just doesn't get a hero image — never a fabricated one, and never
 * the original white-background version.
 */
const HERO_CUTOUTS: Record<string, string> = {
  "https://res.cloudinary.com/ixut3fgq/image/upload/v1784636887/Products/jalcrzgmsuxw2uwdk8aq.jpg": "/hero/liquid-detergent-lavender-garden.png",
};

/**
 * This is the real replacement for muv-homepage.jsx's hardcoded
 * CATEGORIES/PRODUCTS arrays — every section below reads from Postgres via
 * the CMS models built in earlier turns (Banner, HomepageSection,
 * Product.bestSellerRank, AnnouncementBar, NewsletterContent). No mock data.
 */
export default async function HomePage() {
  const [heroBanner, categories, featuredRaw, sections, heroCandidates, session] = await Promise.all([
    prisma.banner.findFirst({ where: { type: "HERO", active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    // "Featured Products" is driven by the admin's per-product "Featured"
    // toggle (Product.isFeatured) — bestSellerRank is a separate, still-
    // unused admin field (nothing sets it yet), so keying this section off
    // it would leave the section permanently empty despite curated products
    // existing.
    prisma.product.findMany({
      where: { isFeatured: true, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        variants: { orderBy: { price: "asc" }, include: { inventory: true } },
        reviews: { where: { status: "APPROVED" } },
        content: { select: { keyBenefits: true } },
      },
    }),
    prisma.homepageSection.findMany({ where: { visible: true }, orderBy: { sortOrder: "asc" } }),
    // Hero showcase — a real, uploaded MUV product photo, not a fabricated
    // one. Best sellers aren't guaranteed to exist (bestSellerRank is
    // optional, admin-set), so this falls back to the newest active product
    // that actually has a photo.
    prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }], take: 6 }),
    auth(),
  ]);

  const sectionKeys = new Set(sections.map((s) => s.key));
  const showSection = (key: string) => sections.length === 0 || sectionKeys.has(key);
  const orderedCategories = [...categories].sort((a, b) => {
    const indexOf = (slug: string) => {
      const index = CATEGORY_ORDER.indexOf(slug);
      return index === -1 ? CATEGORY_ORDER.length : index;
    };
    return indexOf(a.slug) - indexOf(b.slug);
  });

  const heroMatch = heroCandidates
    .map((p) => ({ product: p, cutout: p.images.map((img) => HERO_CUTOUTS[img]).find(Boolean) }))
    .find((x): x is { product: (typeof heroCandidates)[number]; cutout: string } => Boolean(x.cutout));

  // Phase 14A — the homepage's one adaptive rail: a returning customer with
  // real browsing history sees "Continue Shopping" (their own real DB
  // Recently Viewed); a returning customer with no history yet sees
  // "Recommended For You" (the real preference-driven engine); a guest sees
  // "Trending Now" — a sensible, real default requiring no account. "New
  // Arrivals" always renders underneath, for guests and logged-in alike.
  let wishlistedIds: string[] = [];
  let primaryRail: { eyebrow: string; title: string; products: FeaturedProduct[] } | null = null;

  const [newArrivalsRaw, customer] = await Promise.all([
    getNewArrivals(8),
    session?.user ? prisma.customer.findUnique({ where: { userId: session.user.id } }) : Promise.resolve(null),
  ]);

  if (customer) {
    const recentResult = await getRecentlyViewed(8);
    const recentProducts = recentResult.success ? recentResult.data.map((item, i) => toFeaturedProduct(item.product, i)) : [];
    if (recentProducts.length > 0) {
      primaryRail = { eyebrow: "Continue Shopping", title: "Where you left off", products: recentProducts };
    } else {
      const recommended = await getRecommendedForYou(customer.id, 8);
      primaryRail = { eyebrow: "For You", title: "Recommended for you", products: recommended.map(toFeaturedProduct) };
    }
  } else {
    const trending = await getTrendingProducts(8);
    primaryRail = { eyebrow: "Trending Now", title: "What everyone's adding to cart", products: trending.map(toFeaturedProduct) };
  }
  const newArrivalsRail = { eyebrow: "Just In", title: "New Arrivals", products: newArrivalsRaw.map(toFeaturedProduct) };

  // Wishlist state for the logged-in customer, scoped to the featured +
  // personalized products actually shown below — so the heart icon starts
  // correctly filled instead of always defaulting to empty for a returning
  // customer.
  const heartCandidateIds = [...new Set([...featuredRaw.map((p) => p.id), ...(primaryRail?.products.map((p) => p.id) ?? []), ...newArrivalsRail.products.map((p) => p.id)])];
  if (customer && heartCandidateIds.length > 0) {
    const entries = await prisma.wishlist.findMany({
      where: { customerId: customer.id, productId: { in: heartCandidateIds } },
      select: { productId: true },
    });
    wishlistedIds = entries.map((e) => e.productId);
  }

  const featuredProducts: FeaturedProduct[] = featuredRaw.map((p, i) => {
    // Prefer an in-stock variant for display — a "featured" showcase whose
    // job is to drive add-to-cart shouldn't default to the one size that
    // happens to be sold out, when others aren't.
    const sortedVariants = [...p.variants].sort((a, b) => {
      const aInStock = (a.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      const bInStock = (b.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      return aInStock !== bInStock ? aInStock - bInStock : a.price - b.price;
    });
    const v = sortedVariants[0];
    const variant = v
      ? { id: v.id, size: v.size, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10 }
      : null;

    const rating = p.reviews.length ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length : null;

    // At most one badge, driven by real signals only — never fabricated.
    // "Limited" (genuinely low stock on the shown variant) outranks "New"
    // (this list is already sorted newest-first, so only index 0 qualifies
    // — otherwise every card would end up tagged "New").
    const badge: FeaturedProduct["badge"] =
      variant && variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold ? "Limited" : i === 0 ? "New" : null;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: { name: p.category.name },
      images: p.images,
      usp: extractUSP(p.content?.keyBenefits ?? null),
      badge,
      rating,
      reviewCount: p.reviews.length,
      variant,
    };
  });

  return (
    <div>
      {/* ---- Hero ---- */}
      {/* Phase 1D real-device correction — `100vh` on mobile Chrome/Safari
          resolves against the browser-chrome-hidden viewport (the largest
          possible size), taller than what's actually visible whenever the
          address bar is showing (the common case). That inflated height
          was the "excessively tall hero, big empty gap before the next
          section" the Founder reported on a real phone. `100dvh` (dynamic
          viewport height) tracks the actual visible viewport as browser
          chrome shows/hides instead — same intended full-bleed hero, sized
          correctly on a real device. */}
      <section className="muv-hero relative overflow-hidden" style={{ minHeight: "100svh" }}>
        <Aura size={640} style={{ top: "-14%", left: "18%" }} />
        {/* Founder Final Consolidated Polish — top-anchored on mobile/tablet
            (`items-start`) instead of vertically centered, with a fixed
            14px top padding (`pt-3.5`, within the required 12–16px, no vh/
            clamp): a stable hero safe area that never collides with or
            drifts arbitrarily far from the nav regardless of viewport
            height, since it no longer depends on how much space centering
            happens to leave. Desktop keeps the original centered
            composition (`lg:items-center`), unchanged. */}
        <div
          className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 grid grid-cols-1 lg:grid-cols-[42fr_58fr] gap-10 sm:gap-12 lg:gap-16 xl:gap-20 items-start lg:items-stretch pt-3.5 lg:pt-28"
          style={{ minHeight: "100svh", paddingBottom: "clamp(72px, 9vh, 96px)" }}
        >
          {/* Left — headline, description, CTAs. Hero Canvas pass: column
              width changed (was ~52/48 via 1.05fr/0.95fr, now the approved
              42/58 split) and vertical rhythm slightly opened up for the
              narrower column; copy, typography, and CTAs themselves are
              byte-for-byte unchanged. */}
          <div className="text-center lg:text-left max-w-2xl lg:max-w-none lg:pr-8 xl:pr-12 mx-auto lg:mx-0 lg:self-center">
            {/* Founder Hero Copy Freeze — locked homepage hero copy. Falls
                back to this exact copy only when no admin CMS hero banner
                is active (none is, currently); minimal by design, no extra
                paragraph beyond the one supporting line. The headline's
                three explicit line breaks are locked composition, not
                automatic wrapping — always rendered this way regardless of
                viewport, per the Founder's explicit "do not allow automatic
                line wrapping" instruction. */}
            {/* Founder Final Hero Micro Polish — a small amount of extra
                breathing room above the eyebrow specifically (not the
                section's own top padding, which stays untouched), so only
                this element shifts, not the whole first fold. */}
            <Reveal>
              <p className="muv-text-body text-[11px] uppercase tracking-[0.35em] mb-6" style={{ marginTop: 12 }}>A Better Standard of Care</p>
            </Reveal>
            <Reveal delay={0.1}>
              {/* Founder Typography Refinement — hero headline only, set in
                  Cormorant Garamond (--font-cormorant, app/layout.tsx)
                  instead of the site-wide Fraunces `font-display`; every
                  other heading is unaffected. Same copy, same line breaks,
                  same size/spacing — only the typeface and the trademark
                  glyph's size/alignment changed. */}
              <h1
                className="text-white mx-auto lg:mx-0 muv-hero-headline"
                style={{
                  fontFamily: "var(--font-cormorant), Georgia, serif",
                  fontWeight: 400,
                  lineHeight: 1.08,
                  letterSpacing: "-0.01em",
                  fontSize: "clamp(2.6rem, 4.6vw, 4.4rem)",
                  maxWidth: "13ch",
                }}
              >
                {heroBanner?.title ?? (
                  <>
                    {/* Founder Final Hero Micro Polish — "you" nudged up
                        ~2.5px via a relative offset (optical balance only,
                        doesn't touch document flow/line-height, so it can't
                        move "keep Muving™." on the line below). Same
                        wording, same font, same size. */}
                    Care for the life<br /><span style={{ display: "inline-block", position: "relative", top: "-2.5px" }}>you</span><br />keep Muving<span style={{ fontSize: "0.29em", opacity: 0.75, position: "relative", top: "-0.65em", left: "0.06em", letterSpacing: 0, marginRight: "0.08em" }}>™</span>.
                  </>
                )}
              </h1>
            </Reveal>
            <Reveal delay={0.22}>
              <p className="muv-text-body mx-auto lg:mx-0 mt-7" style={{ fontWeight: 300, fontSize: "17px", lineHeight: 1.7, maxWidth: "480px" }}>
                {heroBanner?.subtitle ?? "Affordable luxury, crafted in India."}
              </p>
            </Reveal>
            <Reveal delay={0.34}>
              {/* One Primary-tier CTA only (PHASE_6B §2) — "Our Story" was
                  previously a second, competing button; demoted to a plain
                  text link so it never carries the same visual weight as
                  the primary Shop action. */}
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6 sm:gap-5">
                <Link href={heroBanner?.ctaLink ?? "/shop"} className="w-full sm:w-auto">
                  <Button variant="primary">{heroBanner?.ctaLabel ?? "Explore the Collection"} <ArrowRight size={15} /></Button>
                </Link>
                {/* Founder Final Hero Polish, Phase 3 — premium by default,
                    not hover-dependent (this is primarily a mobile
                    experience, where hover doesn't exist): soft lavender
                    text and a subtle persistent underline out of the box;
                    hover only brightens both further, for desktop. */}
                <Link href="/about" className="muv-hero-our-story text-xs uppercase tracking-[0.16em]">
                  Our Story
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Right — MUV Living Hero™, recreated from the founder-approved,
              frozen Master Hero (public/hero/MUV-HERO-MASTER.png) using the
              real transparent Family/product PNGs already in the project —
              never the master image itself, never regenerated/reinterpreted
              assets. Warm "Light Sanctuary" background (no photographic
              environment, no walls/architecture), family as the emotional
              anchor, five real product PNGs positioned per the master's
              left/right arrangement. Skin Care recreates only its capsule
              ("Muving Soon™") — no bottle asset exists for it anywhere in
              the project, so none is fabricated.
              Every motion layer (entrance, hover-lift, hover-dim, idle
              float/breathe, mouse parallax) lives on its own dedicated
              element deliberately — see the cascade-conflict note below,
              which is why this nests as deep as it does. */}
          <div className="relative w-full lg:self-stretch">
            <div className="muv-hero-stage">
              <div className="muv-hero-sanctuary" aria-hidden />
              <div className="muv-hero-ambient-pulse" aria-hidden />
              <div className="muv-hero-light-sweep" aria-hidden />
              <div className="muv-hero-groundglow" aria-hidden />
              <HeroParallax className="muv-constellation">
                {/* Family */}
                <div className="muv-parallax-family">
                  <div className="muv-family-enter">
                    <div className="muv-family-breathe">
                      <Image
                        src="/transparent.png/careworld/background/familyphoto-Photoroom.png"
                        alt="A MUV family — father, mother, and daughter"
                        fill
                        priority
                        sizes="(max-width: 767px) 62vw, (max-width: 1023px) 54vw, 30vw"
                        className="muv-family-img"
                      />
                    </div>
                  </div>
                </div>

                {HERO_CONSTELLATION.map((item, i) => {
                  const enterDelayMs = 900 + i * 130;
                  const labelDelayMs = enterDelayMs + 550;
                  return (
                    <div
                      key={item.key}
                      className="muv-constellation-item"
                      style={{
                        left: `${item.left}%`,
                        top: `${item.top}%`,
                        width: `${item.width}%`,
                        ["--accent-rgb" as any]: item.accentRgb,
                      }}
                    >
                      <div className="muv-parallax-product">
                        {/* Hover polish fix: a CSS animation with fill-mode
                            forwards permanently "wins" the cascade over a
                            later :hover rule targeting the same property on
                            the same element — verified via computed styles,
                            not assumed (see commit history). Entrance / hover-
                            lift / idle-float / hover-dim each get their own
                            element below so none of them ever compete for
                            the same animated property. */}
                        <div className="muv-constellation-enter" style={{ animationDelay: `${enterDelayMs}ms` }}>
                          <div className="muv-constellation-lift">
                            <div
                              className="muv-constellation-float"
                              style={{ ["--float-amp" as any]: `${item.floatAmp}px`, ["--float-dur" as any]: `${item.floatDur}s` }}
                            >
                              <div className="muv-constellation-visual">
                                <Image
                                  src={item.image}
                                  alt=""
                                  fill
                                  loading="lazy"
                                  sizes="(max-width: 767px) 20vw, (max-width: 1023px) 17vw, 8vw"
                                  className="muv-constellation-product-img"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="muv-parallax-capsule">
                          <div className="muv-constellation-label" style={{ animationDelay: `${labelDelayMs}ms` }}>
                            <item.Icon size={11} strokeWidth={1.6} className="muv-constellation-label-icon" />
                            <span>{item.label}</span>
                          </div>
                        </div>
                      </div>
                      <div className="muv-constellation-dim" aria-hidden />
                    </div>
                  );
                })}

                {/* Skin Care — capsule only, per the asset-gap note above. */}
                <div
                  className="muv-constellation-item muv-constellation-item--soon"
                  style={{ left: `${HERO_SKIN_CARE.left}%`, top: `${HERO_SKIN_CARE.top}%`, ["--accent-rgb" as any]: HERO_SKIN_CARE.accentRgb }}
                >
                  <div className="muv-parallax-capsule">
                    <div
                      className="muv-constellation-float"
                      style={{ ["--float-amp" as any]: `${HERO_SKIN_CARE.floatAmp}px`, ["--float-dur" as any]: `${HERO_SKIN_CARE.floatDur}s` }}
                    >
                      <div className="muv-constellation-label muv-constellation-label--soon" style={{ animationDelay: "1650ms" }}>
                        <HERO_SKIN_CARE.Icon size={11} strokeWidth={1.6} className="muv-constellation-label-icon" />
                        <span>
                          {HERO_SKIN_CARE.label}
                          <em>{HERO_SKIN_CARE.sublabel}</em>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </HeroParallax>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Shop by Category (Sprint 2) ---- */}
      {showSection("categories") && (
        <section className="py-28 md:py-36 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col items-center text-center mb-16 md:mb-20">
              <Reveal>
                <p className="muv-category-eyebrow mb-5">Care Worlds</p>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.9rem,4vw,3rem)" }}>
                  Every life domain, held to one standard.
                </h2>
              </Reveal>
              <Reveal delay={0.14}>
                <p className="muv-section-strapline mt-5 md:mt-6">
                  Each ritual has its own rhythm. Muv approaches each one with the same quiet standard of care.
                </p>
              </Reveal>
            </div>

            {/* Care Worlds Flagship Upgrade (Founder Phase 2) — real approved
                product photography per category, replacing the icon-only
                tiles below. See CATEGORY_VISUALS above for the asset audit. */}
            {orderedCategories.length === 0 ? (
              <div className="muv-card text-center py-16">
                <p className="muv-text-meta text-sm">New categories are on their way — check back soon.</p>
              </div>
            ) : (
            /* Mobile: horizontal scroll-snap row (PHASE_6B §3) — five tiles
               don't divide evenly into a 2-column grid without an orphan.
               sm+: reverts to the original grid. tabIndex makes the row
               keyboard-scrollable (arrow keys), per PHASE_6B §13. */
            <div
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory muv-scroll-row pb-2 -mx-6 px-6 sm:grid sm:grid-cols-2 sm:overflow-visible sm:mx-0 sm:px-0 lg:grid-cols-3 md:gap-6"
              tabIndex={0}
              role="region"
              aria-label="Shop by category"
            >
              {orderedCategories.map((c, i) => {
                const Icon = CATEGORY_ICONS[c.slug] ?? Sparkles;
                const isSkinCare = c.slug === "skin-care" || c.name.toLowerCase().includes("skin");
                const isComingSoon = isSkinCare || c.comingSoon;
                const visual = CATEGORY_VISUALS[c.slug] ?? { image: null, alt: "", bgImage: "/transparent.png/careworld/background/backgrounds/homecarebackground.png", accentRgb: "183, 171, 240", stageTop: 5, stageSize: 76 };

                // Existing approved copy is kept exactly as-is for every
                // category that already had it live in production. Personal
                // Care is the one real gap (it fell through to the generic
                // fallback before this upgrade) — its line is Founder-
                // provided provisional copy, disclosed in the phase report,
                // not existing approved copy.
                // Skin Care has no product to be the visual hero, so per the
                // Founder's "Muving Soon™ should become the hero" direction
                // the status line itself gets a soft glow treatment
                // (muv-category-card-status--hero) — same font/size/weight/
                // letter-spacing as every other card's status line, only
                // its lighting (text-shadow) differs. Typography itself is
                // unchanged.
                const status = isComingSoon ? (
                  <p className={`muv-category-card-status${isSkinCare ? " muv-category-card-status--hero" : ""}`}>Muving Soon™</p>
                ) : c.slug === "body-care" ? (
                  <p className="muv-category-card-status">Daily ritual</p>
                ) : c.slug === "home-care" ? (
                  <p className="muv-category-card-status">Quiet confidence</p>
                ) : c.slug === "fabric-care" ? (
                  <p className="muv-category-card-status">Freshness, softness</p>
                ) : c.slug === "car-care" ? (
                  <p className="muv-category-card-status">Every journey</p>
                ) : c.slug === "personal-care" ? (
                  <p className="muv-category-card-status">Small rituals. Everyday care.</p>
                ) : (
                  <p className="muv-category-card-status">Explore the range</p>
                );

                // --accent-rgb is set once on the outer card element (below)
                // so it cascades to every descendant that reads it (the
                // reflection tint, ground shadow, and the card's own hover/
                // focus-visible border/outline rules). data-mood selects
                // each category's own object-position/exposure tuning for
                // its background photo in globals.css.
                const cardStyle = {
                  width: "min(240px, 68vw)",
                  ["--accent-rgb" as any]: visual.accentRgb,
                };

                const stageStyle = visual.image ? { top: `${visual.stageTop}%`, width: `${visual.stageSize}%`, height: `${visual.stageSize}%` } : undefined;
                const groundStyle = visual.image ? { top: `${visual.stageTop + visual.stageSize - 6}%` } : undefined;

                // Founder's "Real Photographic Environments" rule: the real
                // background photo is now the entire environment — no CSS
                // gradient/particle/glow stands in for it. The stack is
                // simply: real photo -> product PNG -> ground contact
                // shadow -> ground reflection -> bottom scrim (for text
                // legibility) -> UI. A single subtle colour-temperature
                // wash (data-mood-tinted, no blur/animation) is the only
                // "adjustment" layer, per the brief's own allowance to
                // adjust "colour temperature, subtle ambient light."
                const cardInner = (
                  <>
                    <div className="muv-category-card-bgphoto" aria-hidden>
                      <Image
                        src={visual.bgImage}
                        alt=""
                        fill
                        aria-hidden
                        sizes="(max-width: 640px) 68vw, (max-width: 1024px) 45vw, 280px"
                        loading="lazy"
                        className="muv-category-card-bgphoto-img"
                      />
                    </div>
                    <div className="muv-category-card-ambient" aria-hidden />
                    {visual.image && (
                      <>
                        <div className="muv-category-card-stage" style={stageStyle}>
                          <div className="muv-category-card-visual">
                            <Image
                              src={visual.image}
                              alt={visual.alt}
                              fill
                              sizes="(max-width: 640px) 68vw, (max-width: 1024px) 45vw, 280px"
                              loading="lazy"
                              className="muv-category-card-product"
                            />
                          </div>
                        </div>
                        <div className="muv-category-card-groundshadow" style={groundStyle} aria-hidden />
                        <div className="muv-category-card-reflection" aria-hidden>
                          <Image
                            src={visual.image}
                            alt=""
                            fill
                            aria-hidden
                            sizes="(max-width: 640px) 68vw, (max-width: 1024px) 45vw, 280px"
                            loading="lazy"
                            className="muv-category-card-product"
                          />
                          <div className="muv-category-card-reflection-tint" aria-hidden />
                        </div>
                      </>
                    )}
                    <div className="muv-category-card-scrim" aria-hidden />

                    <div className="relative z-10 h-full flex flex-col p-5 sm:p-6 lg:p-7">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="muv-category-card-index">{String(i + 1).padStart(2, "0")}</span>
                          <span className="muv-category-card-glyph-chip">
                            <Icon size={12} strokeWidth={1.4} />
                          </span>
                        </span>
                        {!isComingSoon && (
                          <span className="muv-category-card-arrow">
                            <ArrowUpRight size={14} />
                          </span>
                        )}
                      </div>
                      <div className="muv-category-card-content mt-auto">
                        <div className="muv-category-card-divider" />
                        <h3 className="muv-category-card-title">{c.name}</h3>
                        {status}
                      </div>
                    </div>
                  </>
                );

                // Skin Care (or any future comingSoon category) has no real
                // destination yet — rendered as a plain, non-interactive div
                // (not a Link to "#") so it never behaves like a dead
                // shopping page, while its name/status text is still exposed
                // to screen readers as ordinary content in this region.
                return (
                  <Reveal key={c.id} delay={i * 0.06}>
                    {isComingSoon ? (
                      <div
                        className="muv-category-card muv-category-card--soon block flex-shrink-0"
                        style={cardStyle}
                        data-mood={c.slug}
                        aria-label={`${c.name} — Muving Soon`}
                      >
                        {cardInner}
                      </div>
                    ) : (
                      <Link
                        href={`/collections/${c.slug}`}
                        className="muv-category-card block flex-shrink-0"
                        style={cardStyle}
                        data-mood={c.slug}
                      >
                        {cardInner}
                      </Link>
                    )}
                  </Reveal>
                );
              })}
            </div>
            )}
          </div>
        </section>
      )}

      {/* ---- Featured Products (Sprint 3) ---- */}
      {showSection("bestsellers") && featuredProducts.length > 0 && (
        <section style={{ background: "var(--surface)" }} className="muv-section-fade-top py-28 md:py-36 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col items-center text-center mb-16 md:mb-20">
              <Reveal>
                <p className="muv-featured-eyebrow mb-5">Featured Collection</p>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.9rem,4vw,3rem)", lineHeight: 1.2 }}>
                  A quiet edit of everyday care.
                </h2>
              </Reveal>
              <Reveal delay={0.14}>
                <p className="muv-section-strapline mt-5 md:mt-6">
                  The essentials are simple. Their standards are not.
                </p>
              </Reveal>
            </div>

            <FeaturedProducts products={featuredProducts} wishlistedIds={wishlistedIds} />
          </div>
        </section>
      )}

      {/* ---- Personalized rails (Phase 14A) — adaptive per visitor, guests
          get a sensible real default (Trending), always-real data only ---- */}
      <PersonalizedSection rails={[primaryRail, newArrivalsRail].filter((r): r is NonNullable<typeof primaryRail> => Boolean(r))} wishlistedIds={wishlistedIds} />

      {/* ---- Why Choose MUV (Sprint 4) — new section, placeholder content only ---- */}
      <WhyChooseMuv />

      {/* ---- Brand Story / Origin (PHASE_6A §4.5) ---- */}
      {showSection("brandstory") && <BrandStory />}

      {/* ---- Reviews / Evidence (PHASE_6A §4.6) — self-gates on having
          real approved reviews; renders nothing otherwise. ---- */}
      {showSection("reviews") && <SocialProof />}

      {/* ---- Business / Acknowledgment (PHASE_6A §4.7) ---- */}
      {showSection("business") && <BusinessSection />}
    </div>
  );
}
