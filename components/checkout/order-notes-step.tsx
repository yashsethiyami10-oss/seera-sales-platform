/**
 * Real field, not a fake placeholder — `Order.deliveryInstructions` already
 * exists in the schema and `createOrderSchema`/`createOrder` already accept
 * and persist it (actions/orders.ts, lib/validations/order.ts). The
 * previous checkout UI simply never collected it. This wires the existing
 * capability up, it doesn't invent a new one.
 */
export function OrderNotesStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="checkout-notes" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Delivery Notes (optional)</label>
      <textarea
        id="checkout-notes"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 300))}
        placeholder="Gate code, landmark, preferred delivery time — anything that helps the courier find you."
        className="muv-input muv-textarea w-full"
        maxLength={300}
      />
      <p className="muv-text-faint text-xs mt-1 text-right">{value.length}/300</p>
    </div>
  );
}
