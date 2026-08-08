"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { logger } from "@/lib/logger";

/** Admin-scoped error boundary (Phase 16) — previously an uncaught error
 * anywhere under /admin fell through to Next's generic error screen, with
 * no way back into the admin without a manual URL edit. Same "log the raw
 * error, never render it" discipline as app/account/error.tsx. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("admin:error-boundary", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="muv-card text-center py-16" style={{ maxWidth: 480, margin: "60px auto" }}>
      <div className="muv-icon-circle mb-5" style={{ width: 52, height: 52, margin: "0 auto" }} aria-hidden>
        <AlertCircle size={20} />
      </div>
      <h1 className="font-display muv-text-solid mb-2" style={{ fontWeight: 500, fontSize: "1.2rem" }}>Something went wrong</h1>
      <p className="muv-text-meta text-sm mb-6">This admin page hit an error. Try again, or head back to the overview.</p>
      <div className="flex items-center gap-3 justify-center flex-wrap">
        <Button variant="ghost" onClick={reset}>Try Again</Button>
        <Link href="/admin"><Button variant="primary">Back to Overview</Button></Link>
      </div>
    </div>
  );
}
