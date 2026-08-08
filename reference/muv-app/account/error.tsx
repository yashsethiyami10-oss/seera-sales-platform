"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { logger } from "@/lib/logger";

/**
 * Next.js error boundary convention (must be a Client Component). The raw
 * `error` object — which can carry server-side stack details in dev — is
 * logged, never rendered; the customer only ever sees a generic, honest
 * message, per the brief's "Never expose server errors."
 */
export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("account:error-boundary", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="text-center py-20">
      <div className="muv-icon-circle mb-6" style={{ width: 56, height: 56, margin: "0 auto" }} aria-hidden>
        <AlertCircle size={22} />
      </div>
      <h1 className="font-display text-white mb-2" style={{ fontWeight: 400, fontSize: "1.4rem" }}>Something went wrong</h1>
      <p className="muv-text-meta text-sm mb-8" style={{ maxWidth: "40ch", margin: "0 auto" }}>
        We couldn&rsquo;t load this page. Try again, or reach out if it keeps happening.
      </p>
      <div className="flex items-center gap-3 justify-center flex-wrap">
        <Button variant="ghost" onClick={reset}>Try Again</Button>
        <Link href="/contact"><Button variant="primary">Contact Support</Button></Link>
      </div>
    </div>
  );
}
