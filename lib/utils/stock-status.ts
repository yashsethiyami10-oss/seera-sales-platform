export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

/**
 * quantity === 0            -> OUT_OF_STOCK
 * 0 < quantity <= threshold -> LOW_STOCK
 * quantity > threshold      -> IN_STOCK
 *
 * One function so every surface (product card, detail page, admin table)
 * agrees on the exact same boundary — previously each place that needed
 * this would have reimplemented the comparison independently.
 */
export function getStockStatus(quantity: number, lowStockThreshold: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= lowStockThreshold) return "LOW_STOCK";
  return "IN_STOCK";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};