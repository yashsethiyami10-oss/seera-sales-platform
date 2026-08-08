"use client";

import dynamic from "next/dynamic";

/**
 * `next/dynamic(..., { ssr: false })` isn't allowed directly inside a
 * Server Component (app/layout.tsx) in the App Router — this thin client
 * wrapper is the standard way around that, and is the actual mechanism
 * behind "lazy load chat" / "code split where appropriate": the widget's
 * own bundle (component + hook) is only fetched once this wrapper mounts
 * on the client, never part of the initial server-rendered page.
 */
const MuvAiWidget = dynamic(() => import("./muv-ai-widget").then((mod) => mod.MuvAiWidget), { ssr: false });

export function MuvAiLoader() {
  return <MuvAiWidget />;
}
