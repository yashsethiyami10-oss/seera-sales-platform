"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { syncClientQueue } from "@/lib/phase-11/offline-client";

export function SyncRetryButton({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const items = await syncClientQueue();
            const pending = items.filter((x) => x.status === "PENDING" || x.status === "FAILED").length;
            setMessage(
              hi
                ? `सिंक प्रयास पूर्ण। ${pending} शेष।`
                : `Sync attempt complete. ${pending} still pending.`,
            );
            router.refresh();
          } catch {
            setMessage(hi ? "सिंक विफल — नेटवर्क जाँचें।" : "Sync failed — check network.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {hi ? "अभी सिंक करने का प्रयास करें" : "Retry sync now"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
