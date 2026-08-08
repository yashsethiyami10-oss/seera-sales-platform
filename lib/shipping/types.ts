/**
 * Every shipping provider (Shiprocket, Delhivery, Blue Dart, DTDC)
 * implements this same interface. app/actions/shipping.ts and the webhook
 * handler depend only on this shape — adding a fifth courier later means
 * writing one new file in `providers/`, nothing else changes.
 *
 * Shiprocket is technically an aggregator (it routes to Delhivery/Blue
 * Dart/DTDC/etc under the hood) rather than a courier itself — it's
 * included as its own provider because many Indian D2C brands integrate
 * with it directly instead of the underlying couriers, and its API shape
 * differs enough to warrant its own implementation rather than pretending
 * it's "just Delhivery with extra steps."
 */

export type Address = {
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
};

export type RateRequest = {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  codAmount?: number; // present only for COD orders — some couriers price COD differently
};

export type RateResult = {
  courierName: string;
  serviceType: string; // "Surface" | "Air" | "Express" etc — provider-specific label
  rate: number; // rupees
  estimatedDays: number;
};

export type ShipmentRequest = {
  orderNumber: string;
  origin: Address;
  destination: Address;
  weightGrams: number;
  codAmount?: number;
  items: { name: string; quantity: number; unitPrice: number }[];
};

export type ShipmentResult = {
  awbNumber: string;
  courierName: string;
  labelUrl: string | null; // some providers generate the label asynchronously — null until ready
  estimatedDelivery: Date | null;
};

export type TrackingEvent = {
  status: "PENDING" | "PICKUP_SCHEDULED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RTO" | "CANCELLED";
  description: string;
  location?: string;
  occurredAt: Date;
};

export interface ShippingProvider {
  readonly name: "SHIPROCKET" | "DELHIVERY" | "BLUEDART" | "DTDC";

  getRates(request: RateRequest): Promise<RateResult[]>;

  createShipment(request: ShipmentRequest): Promise<ShipmentResult>;

  /** Not every provider generates the label synchronously with shipment
   * creation — this may return the same URL as createShipment did, or poll
   * for one that wasn't ready yet. */
  generateLabel(awbNumber: string): Promise<{ labelUrl: string }>;

  /** Placeholder by design — a real pickup request needs a warehouse
   * address, pickup time slot, and (for most providers) an existing
   * merchant account with pickup locations configured. The interface exists
   * so the admin's "Request Pickup" button has something concrete to call
   * once that account setup exists. */
  requestPickup(params: { awbNumbers: string[]; pickupDate: string }): Promise<{ pickupId: string }>;

  trackShipment(awbNumber: string): Promise<TrackingEvent[]>;

  createReturnShipment(params: { awbNumber: string; reason: string }): Promise<{ returnAwbNumber: string }>;
}
