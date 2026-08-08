/** Returns null (meaning: don't show a discount) whenever price >= mrp,
 * covering both "no discount configured" and any accidental price > mrp
 * data entry — never displays a negative or zero-and-misleading discount. */
export function calculateDiscountPercent(price: number, mrp: number): number | null {
  if (!price || !mrp || mrp <= price) return null;
  return Math.round((1 - price / mrp) * 100);
}