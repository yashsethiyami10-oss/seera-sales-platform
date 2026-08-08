import { AppError } from "@/lib/errors";

export type PricingInput = {
  quantity: number; unitPrice: number; discountType: "PERCENTAGE" | "FIXED";
  discountValue: number; taxRate: number; taxInclusive: boolean;
};
export type PricingResult = PricingInput & {
  subtotal: number; discountAmount: number; taxAmount: number; total: number;
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateLine(input: PricingInput): PricingResult {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new AppError("Quantity must be a positive integer");
  if ([input.unitPrice, input.discountValue, input.taxRate].some((value) => !Number.isFinite(value) || value < 0)) throw new AppError("Pricing values cannot be negative");
  if (input.discountType === "PERCENTAGE" && input.discountValue > 100) throw new AppError("Percentage discount cannot exceed 100");
  const subtotal = money(input.quantity * input.unitPrice);
  const discountAmount = money(input.discountType === "PERCENTAGE" ? subtotal * input.discountValue / 100 : Math.min(subtotal, input.discountValue));
  const discounted = money(subtotal - discountAmount);
  const taxAmount = money(input.taxInclusive ? discounted - discounted / (1 + input.taxRate / 100) : discounted * input.taxRate / 100);
  const total = money(input.taxInclusive ? discounted : discounted + taxAmount);
  return { ...input, subtotal, discountAmount, taxAmount, total };
}

export function calculateTotals(lines: PricingResult[]) {
  return {
    subtotal: money(lines.reduce((sum, line) => sum + line.subtotal, 0)),
    discountTotal: money(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
    taxTotal: money(lines.reduce((sum, line) => sum + line.taxAmount, 0)),
    grandTotal: money(lines.reduce((sum, line) => sum + line.total, 0)),
  };
}
