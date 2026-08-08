import { retryWithBackoff } from "@/lib/retry";
import type { ShippingProvider, RateRequest, RateResult, ShipmentRequest, ShipmentResult, TrackingEvent } from "@/lib/shipping/types";

/**
 * Delhivery (https://track.delhivery.com/api-docs). Token-auth, single
 * static API key rather than a login flow — simpler than Shiprocket's
 * token lifecycle, but confirm current endpoint paths against Delhivery's
 * docs before production use, same caveat as the Shiprocket provider.
 */

const BASE_URL = "https://track.delhivery.com";

function authHeader() {
  const apiKey = process.env.DELHIVERY_API_KEY;
  if (!apiKey) throw new Error("DELHIVERY_API_KEY is not set");
  return `Token ${apiKey}`;
}

async function delhiveryFetch(path: string, init: RequestInit = {}) {
  return retryWithBackoff(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: authHeader(), "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error: any = new Error(`Delhivery ${path} failed: ${res.status} ${body}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  });
}

export class DelhiveryProvider implements ShippingProvider {
  readonly name = "DELHIVERY" as const;

  async getRates(request: RateRequest): Promise<RateResult[]> {
    const params = new URLSearchParams({
      md: "S", // surface — Delhivery also offers "E" (express); expose both if needed
      o_pin: request.originPincode,
      d_pin: request.destinationPincode,
      cgm: request.weightGrams.toString(),
      pt: request.codAmount ? "COD" : "Pre-paid",
      cod: request.codAmount ? request.codAmount.toString() : "0",
    });
    const data = await delhiveryFetch(`/api/kinko/v1/invoice/charges/.json?${params}`);

    // Delhivery's rate endpoint returns a single quote per request (unlike
    // Shiprocket's multi-courier comparison) — normalized into the same
    // array shape so app/actions/shipping.ts can treat all providers alike.
    return [
      {
        courierName: "Delhivery",
        serviceType: params.get("md") === "E" ? "Express" : "Surface",
        rate: Math.round(data[0]?.total_amount ?? 0),
        estimatedDays: 4,
      },
    ];
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResult> {
    const payload = {
      shipments: [
        {
          name: request.destination.name,
          add: `${request.destination.line1} ${request.destination.line2 ?? ""}`,
          city: request.destination.city,
          state: request.destination.state,
          pin: request.destination.pincode,
          phone: request.destination.phone,
          order: request.orderNumber,
          payment_mode: request.codAmount ? "COD" : "Prepaid",
          cod_amount: request.codAmount ?? 0,
          weight: request.weightGrams,
        },
      ],
      pickup_location: { name: process.env.DELHIVERY_PICKUP_LOCATION_NAME ?? "MUV Warehouse" },
    };

    const data = await delhiveryFetch("/api/cmu/create.json", {
      method: "POST",
      body: `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`, // Delhivery's create endpoint is form-encoded, not raw JSON
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const result = data.packages?.[0];
    return {
      awbNumber: result?.waybill ?? "",
      courierName: "Delhivery",
      labelUrl: null,
      estimatedDelivery: null,
    };
  }

  async generateLabel(awbNumber: string): Promise<{ labelUrl: string }> {
    // Delhivery serves labels as a direct PDF URL keyed by waybill number,
    // no separate "generate" call needed once the shipment exists.
    return { labelUrl: `${BASE_URL}/api/p/packing_slip?wbns=${awbNumber}&pdf=true` };
  }

  async requestPickup(params: { awbNumbers: string[]; pickupDate: string }): Promise<{ pickupId: string }> {
    const data = await delhiveryFetch("/fm/request/new/", {
      method: "POST",
      body: JSON.stringify({ pickup_date: params.pickupDate, pickup_time: "14:00:00", expected_package_count: params.awbNumbers.length }),
    });
    return { pickupId: data.pickup_id ?? "" };
  }

  async trackShipment(awbNumber: string): Promise<TrackingEvent[]> {
    const data = await delhiveryFetch(`/api/v1/packages/json/?waybill=${awbNumber}`);
    const scans = data.ShipmentData?.[0]?.Shipment?.Scans ?? [];

    return scans.map((s: any) => ({
      status: mapDelhiveryStatus(s.ScanDetail?.Instructions ?? ""),
      description: s.ScanDetail?.Instructions ?? "",
      location: s.ScanDetail?.ScannedLocation,
      occurredAt: new Date(s.ScanDetail?.StatusDateTime),
    }));
  }

  async createReturnShipment(params: { awbNumber: string; reason: string }): Promise<{ returnAwbNumber: string }> {
    const data = await delhiveryFetch("/api/cmu/create.json", {
      method: "POST",
      body: `format=json&data=${encodeURIComponent(JSON.stringify({ shipments: [{ return_of: params.awbNumber, reason: params.reason }] }))}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return { returnAwbNumber: data.packages?.[0]?.waybill ?? "" };
  }
}

function mapDelhiveryStatus(instruction: string): TrackingEvent["status"] {
  const s = instruction.toLowerCase();
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (s.includes("transit") || s.includes("dispatch")) return "IN_TRANSIT";
  if (s.includes("picked")) return "PICKED_UP";
  if (s.includes("pickup")) return "PICKUP_SCHEDULED";
  if (s.includes("rto")) return "RTO";
  return "PENDING";
}
