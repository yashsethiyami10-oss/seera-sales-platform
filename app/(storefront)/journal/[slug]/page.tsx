import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { Reveal } from "@/components/ui/reveal";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post) return buildMetadata({ title: "Article Not Found", path: `/journal/${slug}`, noIndex: true });
  return buildMetadata({
    title: post.metaTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    path: `/journal/${post.slug}`,
    image: post.featuredImageUrl ?? undefined,
  });
}

export default async function JournalArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const post = await prisma.blogPost.findUnique({ where: { slug }, include: { category: true, author: true } });
  const isVisible = post && (post.status === "PUBLISHED" || (post.status === "SCHEDULED" && post.scheduledAt && post.scheduledAt <= new Date()));
  if (!isVisible) notFound();

  return (
    <article className="max-w-2xl mx-auto px-6 py-12">
      <Reveal>
        <p className="muv-text-meta text-[11px] uppercase tracking-widest mb-3">{post!.category.name}</p>
        <h1 className="font-display text-white mb-4" style={{ fontWeight: 400, fontSize: "clamp(1.8rem,4vw,2.6rem)" }}>{post!.title}</h1>
        <p className="muv-text-faint text-xs mb-10">
          {post!.author?.name ?? "Muv Editorial"}
          {post!.publishedAt && ` · ${post!.publishedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`}
        </p>
      </Reveal>
      {/* Body is HTML authored via the admin rich-text editor (trusted,
          staff-only content — not user-generated) — safe to render directly. */}
      <div className="muv-text-body text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: post!.body }} />
    </article>
  );
}
