import { retryWithBackoff } from "@/lib/retry";
import type { ShippingProvider, RateRequest, RateResult, ShipmentRequest, ShipmentResult, TrackingEvent } from "@/lib/shipping/types";

/**
 * DTDC (https://www.dtdc.in — API access via their merchant portal). Same
 * caveat as Blue Dart: DTDC's API is account-gated and this is written from
 * their publicly documented shapes, not verified against a live sandbox.
 * Structurally correct against the ShippingProvider interface; field names
 * should be confirmed once real merchant credentials are available.
 */

const BASE_URL = "https://blktracksvc.dtdc.com/dtdc-api";

function authHeader() {
  const apiKey = process.env.DTDC_API_KEY;
  if (!apiKey) throw new Error("DTDC_API_KEY is not set");
  return apiKey;
}

async function dtdcFetch(path: string, init: RequestInit = {}) {
  return retryWithBackoff(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "api-key": authHeader(), "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error: any = new Error(`DTDC ${path} failed: ${res.status} ${body}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  });
}

export class DtdcProvider implements ShippingProvider {
  readonly name = "DTDC" as const;

  async getRates(request: RateRequest): Promise<RateResult[]> {
    const data = await dtdcFetch("/rate/calculate", {
      method: "POST",
      body: JSON.stringify({ originPincode: request.originPincode, destinationPincode: request.destinationPincode, weight: request.weightGrams, codAmount: request.codAmount ?? 0 }),
    });
    return [{ courierName: "DTDC", serviceType: "Surface", rate: Math.round(data.totalCharge ?? 0), estimatedDays: 5 }];
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResult> {
    const data = await dtdcFetch("/shipment/softdata", {
      method: "POST",
      body: JSON.stringify({
        consignee_name: request.destination.name,
        consignee_address: `${request.destination.line1} ${request.destination.line2 ?? ""}`,
        consignee_pincode: request.destination.pincode,
        consignee_phone: request.destination.phone,
        reference_number: request.orderNumber,
        weight: request.weightGrams,
        cod_amount: request.codAmount ?? 0,
      }),
    });
    return { awbNumber: data.awb_no ?? "", courierName: "DTDC", labelUrl: null, estimatedDelivery: null };
  }

  async generateLabel(awbNumber: string): Promise<{ labelUrl: string }> {
    const data = await dtdcFetch(`/shipment/label?awb=${awbNumber}`);
    return { labelUrl: data.label_url };
  }

  async requestPickup(params: { awbNumbers: string[]; pickupDate: string }): Promise<{ pickupId: string }> {
    const data = await dtdcFetch("/pickup/request", {
      method: "POST",
      body: JSON.stringify({ awb_numbers: params.awbNumbers, pickup_date: params.pickupDate }),
    });
    return { pickupId: data.pickup_request_id ?? "" };
  }

  async trackShipment(awbNumber: string): Promise<TrackingEvent[]> {
    const data = await dtdcFetch(`/track?awb=${awbNumber}`);
    const scans = data.tracking_history ?? [];
    return scans.map((s: any) => ({ status: mapDtdcStatus(s.status), description: s.status, location: s.location, occurredAt: new Date(s.timestamp) }));
  }

  async createReturnShipment(params: { awbNumber: string; reason: string }): Promise<{ returnAwbNumber: string }> {
    const data = await dtdcFetch("/shipment/return", {
      method: "POST",
      body: JSON.stringify({ original_awb: params.awbNumber, reason: params.reason }),
    });
    return { returnAwbNumber: data.awb_no ?? "" };
  }
}

function mapDtdcStatus(raw: string): TrackingEvent["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (s.includes("transit")) return "IN_TRANSIT";
  if (s.includes("picked")) return "PICKED_UP";
  if (s.includes("rto")) return "RTO";
  return "PENDING";
}
