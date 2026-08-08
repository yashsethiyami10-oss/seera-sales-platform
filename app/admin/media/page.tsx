import { prisma } from "@/lib/prisma";
import { MediaLibraryClient } from "@/components/admin/media-library-client";

const FOLDERS = ["Products", "Blog", "Banners", "General"] as const;
type Folder = (typeof FOLDERS)[number];

/**
 * Reads query prisma.mediaAsset directly (same pattern as the Customers and
 * Inventory list pages) rather than routing through the listMedia server
 * action — that action's mediaQuerySchema has no free-text search field, so
 * the filename search below is a page-level addition, not a duplicate of
 * existing business logic. Folder is a real column (`MediaAsset.folder`),
 * scoped to the same four values `createMediaAssetSchema` already enforces.
 */
export default async function AdminMediaPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string }> }) {
  const { folder: folderParam, q } = await searchParams;
  const folder: Folder = FOLDERS.includes(folderParam as Folder) ? (folderParam as Folder) : "Products";

  const [assets, counts] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { folder, ...(q ? { filename: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.mediaAsset.groupBy({ by: ["folder"], _count: { _all: true } }),
  ]);

  const countByFolder = new Map(counts.map((c) => [c.folder, c._count._all]));
  const shaped = assets.map((a) => ({ id: a.id, filename: a.filename, url: a.url, type: a.type, folder: a.folder, sizeBytes: a.sizeBytes, createdAt: a.createdAt.toISOString() }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Media Library</h1>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {FOLDERS.map((f) => (
          <a key={f} href={`/admin/media?folder=${f}`} className="muv-tag-pill" style={{ opacity: f === folder ? 1 : 0.5, cursor: "pointer" }}>
            {f} ({countByFolder.get(f) ?? 0})
          </a>
        ))}
      </div>

      <form className="mb-5" method="get">
        <input type="hidden" name="folder" value={folder} />
        <input name="q" defaultValue={q ?? ""} placeholder="Search by filename" className="muv-input" style={{ maxWidth: 320 }} />
      </form>

      <MediaLibraryClient assets={shaped} currentFolder={folder} />
    </div>
  );
}
