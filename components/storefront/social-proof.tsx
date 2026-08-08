import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Reveal } from "@/components/ui/reveal";

/**
 * Evidence section (PHASE_6A §4.6 / PHASE_6B §7) — real reviews only, never
 * filtered to only-positive, never backfilled. Pulls the store-wide
 * aggregate and a handful of the most recent approved reviews across every
 * product. If no approved review exists yet, the section doesn't render at
 * all — a thin or fabricated trust section is worse than an absent one
 * (PHASE_6A §3).
 *
 * "Verified Purchase" is derived, never stored or implied — the Review
 * model has no such field. A review counts as verified only if the
 * reviewing customer has a PAID order containing that exact product,
 * checked via a single batched OrderItem query (no N+1, no schema change).
 */
export async function SocialProof() {
  const [aggregate, reviews] = await Promise.all([
    prisma.review.aggregate({ where: { status: "APPROVED" }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.review.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        customer: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  if (reviews.length === 0) return null;

  const paidItems = await prisma.orderItem.findMany({
    where: {
      order: { customerId: { in: reviews.map((r) => r.customer.id) }, paymentStatus: "PAID" },
      variant: { productId: { in: reviews.map((r) => r.product.id) } },
    },
    select: { order: { select: { customerId: true } }, variant: { select: { productId: true } } },
  });
  const verifiedPairs = new Set(paidItems.map((it) => `${it.order.customerId}:${it.variant.productId}`));

  const avg = aggregate._avg.rating ?? 0;
  const count = aggregate._count.rating;

  return (
    <section className="muv-section-fade-top py-28 md:py-36 px-6" style={{ background: "var(--surface)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center text-center mb-14 md:mb-16">
          <Reveal>
            <p className="muv-eyebrow mb-5">In Their Words</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.9rem,4vw,3rem)" }}>
              {avg.toFixed(1)} out of 5
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="muv-text-meta text-sm mt-3">
              From {count} genuine {count === 1 ? "review" : "reviews"}
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="muv-section-strapline mt-4" style={{ maxWidth: "42rem" }}>
              Quiet proof, gathered from the way people live with Muv every day.
            </p>
          </Reveal>
        </div>

        {/* Responsive scroll-snap carousel (PHASE_6B §7) — a light
            horizontal scroll on every viewport, not a filtering UI (that
            belongs on a dedicated reviews view). tabIndex + arrow-key
            scrolling keeps it keyboard-operable per PHASE_6B §13. */}
        <div
          className="flex gap-5 overflow-x-auto snap-x snap-mandatory muv-scroll-row pb-2 -mx-6 px-6 md:gap-6"
          tabIndex={0}
          role="region"
          aria-label="Customer reviews"
        >
          {reviews.map((r, i) => {
            const isVerified = verifiedPairs.has(`${r.customer.id}:${r.product.id}`);
            return (
              <Reveal key={r.id} delay={i * 0.05}>
                <div className="muv-card flex-shrink-0 h-full" style={{ width: "min(340px, 82vw)" }}>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex gap-0.5" aria-hidden>
                      {Array.from({ length: 5 }).map((_, si) => (
                        <span key={si} style={{ color: si < r.rating ? "var(--lavender)" : "rgba(var(--text-rgb),0.2)" }}>
                          ★
                        </span>
                      ))}
                    </div>
                    {isVerified && (
                      <span className="muv-badge-pill" style={{ color: "var(--lavender)", borderColor: "rgba(183,171,240,0.4)", fontSize: 10 }}>
                        Verified Purchase
                      </span>
                    )}
                  </div>
                  <span className="sr-only">
                    {r.rating} out of 5 stars{isVerified ? ", verified purchase" : ""}
                  </span>
                  {r.title && <p className="muv-text-solid text-sm font-medium mb-1.5">{r.title}</p>}
                  <p className="muv-text-body text-sm italic" style={{ lineHeight: 1.6 }}>
                    &ldquo;{r.body}&rdquo;
                  </p>
                  <div className="mt-5 pt-4 flex items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="muv-text-faint text-xs uppercase tracking-wide">{r.customer.name}</p>
                    <Link href={`/products/${r.product.slug}`} className="muv-footer-link muv-text-meta hover:text-white text-xs flex-shrink-0">
                      {r.product.name}
                    </Link>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
