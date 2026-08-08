import Link from "next/link";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listInstitutionalInquiries } from "@/lib/sales-channel/repository";

export default async function InstitutionalPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePermission(PERMISSIONS.INSTITUTIONAL_MANAGE);
  const { q = "", page = "1" } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const result = await listInstitutionalInquiries({ q, page: current });
  const href = (p: number) => `/sales/institutional?q=${encodeURIComponent(q)}&page=${p}`;

  return <section className="space-y-5 text-white">
    <header><h1 className="text-3xl font-semibold">Institutional Accounts</h1><p className="mt-1 text-sm text-zinc-400">{result.total} institutional inquiries</p></header>
    <form><input name="q" defaultValue={q} placeholder="Reference, organization…" className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-4 py-3" /></form>
    <div className="grid gap-3">{result.items.map((row) => (
      <Link key={row.id} href={`/sales/inquiries/${row.id}`} className="rounded-2xl border border-white/10 p-5 hover:bg-white/[.03]">
        <div className="flex justify-between">
          <div>
            <h2>{row.institutionalDetail?.organizationName ?? row.subject}</h2>
            <p className="text-sm text-zinc-500">{row.inquiryNumber} · {row.institutionalDetail?.institutionType ?? "Unclassified"}</p>
          </div>
          <span className="text-sm text-amber-400">{row.status.displayName}</span>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {row.institutionalDetail?.numberOfLocations ?? "?"} locations · {row.institutionalDetail?.siteVisitRequired ? "Site visit requested" : "No site visit"} · Owner: {row.assignedOwner?.name ?? "Unassigned"}
        </p>
      </Link>
    ))}</div>
    {!result.items.length && <p className="text-zinc-500">No institutional accounts found.</p>}
    <nav className="flex justify-between text-sm">
      {result.page > 1 ? <Link href={href(result.page - 1)}>Previous</Link> : <span />}
      <span>Page {result.page} of {result.pages}</span>
      {result.page < result.pages ? <Link href={href(result.page + 1)}>Next</Link> : <span />}
    </nav>
  </section>;
}
