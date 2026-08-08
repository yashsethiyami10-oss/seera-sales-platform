import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { Reveal } from "@/components/ui/reveal";

export const metadata = buildMetadata({ title: "Journal", path: "/journal" });

export default async function JournalPage() {
  const posts = await prisma.blogPost.findMany({
    where: { OR: [{ status: "PUBLISHED" }, { status: "SCHEDULED", scheduledAt: { lte: new Date() } }] },
    orderBy: { publishedAt: "desc" },
    include: { category: true },
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Reveal>
        <h1 className="font-display text-white mb-10" style={{ fontWeight: 400, fontSize: "clamp(1.9rem,4vw,2.8rem)" }}>Journal</h1>
      </Reveal>

      {posts.length === 0 ? (
        <p className="muv-text-meta text-sm">No articles published yet.</p>
      ) : (
        <div className="space-y-6">
          {posts.map((post, i) => (
            <Reveal key={post.id} delay={Math.min(i * 0.05, 0.3)}>
              <Link href={`/journal/${post.slug}`} className="block muv-card muv-card-hover">
                <p className="muv-text-meta text-[11px] uppercase tracking-widest mb-2">{post.category.name}</p>
                <h2 className="font-display muv-text-solid text-xl" style={{ fontWeight: 500 }}>{post.title}</h2>
                {post.excerpt && <p className="muv-text-body text-sm mt-2">{post.excerpt}</p>}
                {post.publishedAt && (
                  <p className="muv-text-faint text-xs mt-3">
                    {post.publishedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
