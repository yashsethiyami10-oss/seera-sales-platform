import { notFound } from "next/navigation";
import { PublicInquiryForm } from "@/components/sales-channel/public-inquiry-form";

const CHANNELS = new Set(["institutional", "corporate", "bulk", "quotation", "sample", "dealer", "distributor", "franchise", "contact"]);
export default async function InquiryPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (!CHANNELS.has(channel)) notFound();
  return <main className="mx-auto max-w-4xl px-5 py-16"><p className="text-xs uppercase tracking-[.22em] text-amber-400">Muv Sales</p><h1 className="mt-2 text-4xl text-white">Start a conversation</h1><p className="mt-3 mb-10 text-zinc-400">Tell us what you need. You will receive a reference number after validation.</p><PublicInquiryForm kind={channel} /></main>;
}
