"use client";

import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/cart-context";

const STORAGE_KEY = "muv-saved-for-later";

/**
 * Deliberately its own small hook, not an addition to CartContext
 * (lib/cart-context.tsx) — that file is shared across every page that adds
 * to cart (Homepage, Shop, Category, PDP), none of which this phase is
 * permitted to touch. A saved-for-later list only needs to exist and be
 * readable on the Cart page itself, so it gets its own isolated
 * localStorage key and hook instead of expanding a shared contract.
 */
export function useSavedForLater() {
  const [saved, setSaved] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      // Corrupt or inaccessible storage — start empty.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved, hydrated]);

  function saveItem(item: CartItem) {
    setSaved((prev) => (prev.some((i) => i.variantId === item.variantId) ? prev : [...prev, item]));
  }

  function removeSaved(variantId: string) {
    setSaved((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  return { saved, saveItem, removeSaved };
}
