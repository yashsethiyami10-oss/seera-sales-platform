import { retryWithBackoff } from "@/lib/retry";
import type { ShippingProvider, RateRequest, RateResult, ShipmentRequest, ShipmentResult, TrackingEvent } from "@/lib/shipping/types";

/**
 * Blue Dart (https://www.bluedart.com/tracking-api). Their REST API
 * (as opposed to their older SOAP/XML services) uses a JWT-style login
 * token exchanged for a licence key + login ID. This is the thinnest of the
 * four provider implementations here — Blue Dart's API access is typically
 * partner-gated (you need an approved commercial account before their docs
 * portal is even usable), so this is written from their publicly documented
 * shapes without the ability to verify against a live sandbox. Treat this
 * as the interface-correct skeleton, and expect to adjust field names once
 * you have real account access and docs.
 */

const BASE_URL = "https://apigateway.bluedart.com";

async function getAuthToken(): Promise<string> {
  const licenceKey = process.env.BLUEDART_LICENCE_KEY;
  const loginId = process.env.BLUEDART_LOGIN_ID;
  if (!licenceKey || !loginId) throw new Error("BLUEDART_LICENCE_KEY / BLUEDART_LOGIN_ID are not set");

  const res = await fetch(`${BASE_URL}/in/transportation/token/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ClientID: loginId, ClientSecret: licenceKey }),
  });
  if (!res.ok) throw new Error(`Blue Dart auth failed: ${res.status}`);
  const data = await res.json();
  return data.JWTToken;
}

async function bluedartFetch(path: string, init: RequestInit = {}) {
  const token = await getAuthToken();
  return retryWithBackoff(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { JWTToken: token, "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error: any = new Error(`Blue Dart ${path} failed: ${res.status} ${body}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  });
}

export class BlueDartProvider implements ShippingProvider {
  readonly name = "BLUEDART" as const;

  async getRates(request: RateRequest): Promise<RateResult[]> {
    const data = await bluedartFetch("/in/transportation/finance/v1/TransactionRateCalculator", {
      method: "POST",
      body: JSON.stringify({
        pOriginArea: request.originPincode,
        pDestinationArea: request.destinationPincode,
        pActualWeight: request.weightGrams / 1000,
        pPaymentType: request.codAmount ? "C" : "P",
      }),
    });
    return [{ courierName: "Blue Dart", serviceType: "Surface", rate: Math.round(data.TotalAmount ?? 0), estimatedDays: 3 }];
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResult> {
    const data = await bluedartFetch("/in/transportation/waybill/v1/GenerateWayBill", {
      method: "POST",
      body: JSON.stringify({
        Consignee: { ConsigneeName: request.destination.name, ConsigneeAddress1: request.destination.line1, ConsigneePincode: request.destination.pincode, ConsigneeMobile: request.destination.phone },
        Shipment: { ActualWeight: request.weightGrams / 1000, DeclaredValue: request.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0), PieceCount: 1, ProductCode: request.codAmount ? "C" : "A" },
        Reference: request.orderNumber,
      }),
    });
    return { awbNumber: data.AWBNo ?? "", courierName: "Blue Dart", labelUrl: data.LabelURL ?? null, estimatedDelivery: null };
  }

  async generateLabel(awbNumber: string): Promise<{ labelUrl: string }> {
    const data = await bluedartFetch(`/in/transportation/waybill/v1/GenerateLabel?awb=${awbNumber}`);
    return { labelUrl: data.LabelURL };
  }

  async requestPickup(params: { awbNumbers: string[]; pickupDate: string }): Promise<{ pickupId: string }> {
    const data = await bluedartFetch("/in/transportation/pickup/v1/RequestPickup", {
      method: "POST",
      body: JSON.stringify({ AWBNos: params.awbNumbers, PickupDate: params.pickupDate }),
    });
    return { pickupId: data.TokenNumber ?? "" };
  }

  async trackShipment(awbNumber: string): Promise<TrackingEvent[]> {
    const data = await bluedartFetch(`/in/transportation/tracking/v1/shipment?awb=${awbNumber}`);
    const scans = data.ShipmentData?.Scans ?? [];
    return scans.map((s: any) => ({ status: mapBlueDartStatus(s.Status), description: s.Status, location: s.Location, occurredAt: new Date(s.ScanDate) }));
  }

  async createReturnShipment(params: { awbNumber: string; reason: string }): Promise<{ returnAwbNumber: string }> {
    const data = await bluedartFetch("/in/transportation/waybill/v1/GenerateReturnWayBill", {
      method: "POST",
      body: JSON.stringify({ OriginalAWB: params.awbNumber, Reason: params.reason }),
    });
    return { returnAwbNumber: data.AWBNo ?? "" };
  }
}

function mapBlueDartStatus(raw: string): TrackingEvent["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (s.includes("transit")) return "IN_TRANSIT";
  if (s.includes("picked")) return "PICKED_UP";
  if (s.includes("rto")) return "RTO";
  return "PENDING";
}
