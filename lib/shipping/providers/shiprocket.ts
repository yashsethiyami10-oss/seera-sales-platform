import { retryWithBackoff } from "@/lib/retry";
import type { ShippingProvider, RateRequest, RateResult, ShipmentRequest, ShipmentResult, TrackingEvent } from "@/lib/shipping/types";

/**
 * Shiprocket (https://apidocs.shiprocket.in). Endpoint paths and payload
 * shapes below match their documented v1 API as of this writing — Shiprocket
 * has changed field names between API versions before, so confirm against
 * current docs before relying on this in production; this isn't hedging,
 * it's the honest state of an integration written without a live account
 * to test against.
 */

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAuthToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) throw new Error("SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD are not set");

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Shiprocket auth failed: ${res.status}`);
  const data = await res.json();

  // Shiprocket tokens are valid for 10 days — cached in-process for 9 to
  // leave margin. In a multi-instance deployment, cache this in Redis
  // instead so every instance isn't re-authenticating independently.
  cachedToken = { token: data.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return data.token;
}

async function shiprocketFetch(path: string, init: RequestInit = {}) {
  const token = await getAuthToken();
  return retryWithBackoff(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error: any = new Error(`Shiprocket ${path} failed: ${res.status} ${body}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  });
}

export class ShiprocketProvider implements ShippingProvider {
  readonly name = "SHIPROCKET" as const;

  async getRates(request: RateRequest): Promise<RateResult[]> {
    const params = new URLSearchParams({
      pickup_postcode: request.originPincode,
      delivery_postcode: request.destinationPincode,
      weight: (request.weightGrams / 1000).toString(), // Shiprocket expects kg
      cod: request.codAmount ? "1" : "0",
    });
    const data = await shiprocketFetch(`/courier/serviceability?${params}`);

    return (data.data?.available_courier_companies ?? []).map((c: any) => ({
      courierName: c.courier_name,
      serviceType: c.mode ?? "Surface",
      rate: Math.round(c.rate),
      estimatedDays: c.estimated_delivery_days ?? 5,
    }));
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResult> {
    const order = await shiprocketFetch("/orders/create/adhoc", {
      method: "POST",
      body: JSON.stringify({
        order_id: request.orderNumber,
        order_date: new Date().toISOString().slice(0, 10),
        billing_customer_name: request.destination.name,
        billing_phone: request.destination.phone,
        billing_address: request.destination.line1,
        billing_address_2: request.destination.line2 ?? "",
        billing_city: request.destination.city,
        billing_state: request.destination.state,
        billing_pincode: request.destination.pincode,
        billing_country: "India",
        shipping_is_billing: true,
        payment_method: request.codAmount ? "COD" : "Prepaid",
        sub_total: request.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
        weight: request.weightGrams / 1000,
        order_items: request.items.map((i) => ({ name: i.name, units: i.quantity, selling_price: i.unitPrice })),
      }),
    });

    // Shiprocket's create-order call doesn't assign an AWB by itself —
    // courier assignment is a separate call, using the shipment_id it just returned.
    const awbResult = await shiprocketFetch("/courier/assign/awb", {
      method: "POST",
      body: JSON.stringify({ shipment_id: order.payload.shipment_id }),
    });

    return {
      awbNumber: awbResult.response.data.awb_code,
      courierName: awbResult.response.data.courier_name,
      labelUrl: null, // generated via a separate call — see generateLabel
      estimatedDelivery: null,
    };
  }

  async generateLabel(awbNumber: string): Promise<{ labelUrl: string }> {
    const data = await shiprocketFetch("/courier/generate/label", {
      method: "POST",
      body: JSON.stringify({ shipment_id: [awbNumber] }),
    });
    return { labelUrl: data.label_url };
  }

  async requestPickup(params: { awbNumbers: string[]; pickupDate: string }): Promise<{ pickupId: string }> {
    const data = await shiprocketFetch("/courier/generate/pickup", {
      method: "POST",
      body: JSON.stringify({ shipment_id: params.awbNumbers, pickup_date: params.pickupDate }),
    });
    return { pickupId: data.pickup_status?.pickup_token_number ?? "" };
  }

  async trackShipment(awbNumber: string): Promise<TrackingEvent[]> {
    const data = await shiprocketFetch(`/courier/track/awb/${awbNumber}`);
    const events = data.tracking_data?.shipment_track_activities ?? [];

    return events.map((e: any) => ({
      status: mapShiprocketStatus(e.status),
      description: e.activity,
      location: e.location,
      occurredAt: new Date(e.date),
    }));
  }

  async createReturnShipment(params: { awbNumber: string; reason: string }): Promise<{ returnAwbNumber: string }> {
    const data = await shiprocketFetch("/orders/create/return", {
      method: "POST",
      body: JSON.stringify({ order_id: params.awbNumber, reason: params.reason }),
    });
    return { returnAwbNumber: data.awb_code ?? "" };
  }
}

function mapShiprocketStatus(raw: string): TrackingEvent["status"] {
  // Shiprocket's free-text status strings, normalized to this app's enum —
  // this mapping is the part most likely to need adjusting once real
  // webhook payloads are seen in production; treat it as a starting point.
  const s = raw.toLowerCase();
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (s.includes("transit")) return "IN_TRANSIT";
  if (s.includes("picked up")) return "PICKED_UP";
  if (s.includes("pickup")) return "PICKUP_SCHEDULED";
  if (s.includes("rto") || s.includes("return")) return "RTO";
  if (s.includes("cancel")) return "CANCELLED";
  return "PENDING";
}
