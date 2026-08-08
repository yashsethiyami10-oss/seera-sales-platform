import type { ShippingProvider } from "@/lib/shipping/types";
import { ShiprocketProvider } from "@/lib/shipping/providers/shiprocket";
import { DelhiveryProvider } from "@/lib/shipping/providers/delhivery";
import { BlueDartProvider } from "@/lib/shipping/providers/bluedart";
import { DtdcProvider } from "@/lib/shipping/providers/dtdc";

/**
 * `SHIPPING_PROVIDER` env var picks which courier integration is active.
 * Everything in app/actions/shipping.ts and the webhook handler calls
 * `getShippingProvider()` rather than importing a specific provider class —
 * changing couriers, or running a different provider per season/region, is
 * a config change here, not a code change anywhere else.
 */
export function getShippingProvider(): ShippingProvider {
  const provider = process.env.SHIPPING_PROVIDER ?? "SHIPROCKET";
  switch (provider) {
    case "SHIPROCKET":
      return new ShiprocketProvider();
    case "DELHIVERY":
      return new DelhiveryProvider();
    case "BLUEDART":
      return new BlueDartProvider();
    case "DTDC":
      return new DtdcProvider();
    default:
      throw new Error(`Unknown SHIPPING_PROVIDER: ${provider}`);
  }
}

export * from "@/lib/shipping/types";
