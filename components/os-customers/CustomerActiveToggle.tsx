"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCustomerActive } from "@/actions/customers";
import { useToast } from "@/components/ui/toast";

/** MUV OS™ — Milestone 2, Global Features "Soft Delete" — real archive/reactivate, not a hidden row. */
export function CustomerActiveToggle({ customerId, active }: { customerId: string; active: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const result = await setCustomerActive(customerId, !active);
    setPending(false);
    if (result.success) {
      showToast(active ? "Customer deactivated" : "Customer reactivated", { tone: "dark" });
      router.refresh();
    } else {
      showToast(result.error.message, { tone: "dark" });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
      style={{
        border: `1px solid ${active ? "rgba(239,68,68,0.4)" : "var(--card-border)"}`,
        color: active ? "#ef4444" : "var(--lavender)",
      }}
    >
      {pending ? "…" : active ? "Deactivate" : "Reactivate"}
    </button>
  );
}
