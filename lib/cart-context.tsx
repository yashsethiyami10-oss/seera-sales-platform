"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = {
  variantId: string;
  productId: string;
  name: string;
  size: string;
  price: number;
  mrp: number;
  quantity: number;
  /** Cover image URL, purely for display in the cart — optional so existing
   * localStorage carts from before this field existed still deserialize fine. */
  image?: string;
};

// Phase 1D correction pass — an applied coupon is now cart-wide state
// (same persistence pattern as `items` below), not page-local. Previously
// CartClient and CheckoutClient each held their own separate `useState` for
// this, so navigating from Cart to Checkout silently lost it — the
// confirmed root cause of the reported "discount disappears, re-enter
// coupon" bug. `id`/`type` are kept so a future display (e.g. "10% off")
// doesn't need a second server round-trip just to re-derive them.
export type AppliedCoupon = { code: string; discount: number };

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
  subtotal: number;
  count: number;
  coupon: AppliedCoupon | null;
  applyCoupon: (coupon: AppliedCoupon) => void;
  removeCoupon: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "muv-cart";
const COUPON_STORAGE_KEY = "muv-cart-coupon";

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}

/**
 * There is deliberately no `Cart`/`CartItem` Prisma model — WIRING.md's
 * reasoning is kept here: `createOrder` (app/actions/orders.ts) already
 * takes cart state directly from the client at checkout time, so a
 * server-persisted cart table would add a model with no read path that
 * isn't better served by this. Add one later only if cross-device cart
 * recovery becomes an actual product requirement.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
      const rawCoupon = localStorage.getItem(COUPON_STORAGE_KEY);
      if (rawCoupon) setCoupon(JSON.parse(rawCoupon));
    } catch {
      // Corrupt or inaccessible storage — start from an empty cart rather
      // than crash the app over a persistence nicety.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // avoid overwriting storage with [] before the initial read completes
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (coupon) localStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify(coupon));
    else localStorage.removeItem(COUPON_STORAGE_KEY);
  }, [coupon, hydrated]);

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [...prev, { ...item, quantity }];
    });
  }

  function updateQuantity(variantId: string, quantity: number) {
    setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, quantity) } : i)));
  }

  function removeItem(variantId: string) {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  function clear() {
    setItems([]);
    // A cleared cart (post-order-placement) shouldn't carry a used coupon
    // into whatever the customer shops for next — the coupon was already
    // consumed server-side (usedCount incremented) for the order it applied to.
    setCoupon(null);
  }

  function applyCoupon(next: AppliedCoupon) {
    setCoupon(next);
  }

  function removeCoupon() {
    setCoupon(null);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clear, subtotal, count, coupon, applyCoupon, removeCoupon }}>
      {children}
    </CartContext.Provider>
  );
}
