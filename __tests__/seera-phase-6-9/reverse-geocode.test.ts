import { describe, expect, it } from "vitest";
import { parseGoogle, parseNominatim, reverseGeocode } from "@/lib/sales-distribution/reverse-geocode";

describe("GPS → place details for address auto-fill", () => {
  it("reads a small village from OpenStreetMap", () => {
    const p = parseNominatim({ address: { hamlet: "Bhojla", village: "Babina Khurd", county: "Babina", state_district: "Jhansi", state: "Uttar Pradesh", postcode: "284 401" } });
    expect(p).toMatchObject({ village: "Babina Khurd", district: "Jhansi", state: "Uttar Pradesh", pincode: "284401", city: null });
    expect(p?.formatted).toBe("Bhojla, Babina Khurd, Jhansi, Uttar Pradesh – 284401");
  });

  it("reads landmark, locality and city in a town", () => {
    const p = parseNominatim({ name: "Sipri Bazar Chowk", address: { shop: "Gupta General Store", suburb: "Sipri Bazar", city: "Jhansi", state_district: "Jhansi", state: "Uttar Pradesh", postcode: "284003" } });
    expect(p).toMatchObject({ landmark: "Gupta General Store", locality: "Sipri Bazar", city: "Jhansi", pincode: "284003" });
    expect(p?.formatted).toBe("Gupta General Store, Sipri Bazar, Jhansi, Uttar Pradesh – 284003");
  });

  it("reads Google results when a key is configured", () => {
    const p = parseGoogle({ status: "OK", results: [{ formatted_address: "x", address_components: [
      { long_name: "Elite Chauraha", types: ["point_of_interest", "establishment"] },
      { long_name: "Civil Lines", types: ["sublocality_level_1", "sublocality"] },
      { long_name: "Jhansi", types: ["locality"] },
      { long_name: "Jhansi", types: ["administrative_area_level_3"] },
      { long_name: "Uttar Pradesh", types: ["administrative_area_level_1"] },
      { long_name: "284001", types: ["postal_code"] },
    ] }] });
    expect(p).toMatchObject({ landmark: "Elite Chauraha", locality: "Civil Lines", city: "Jhansi", state: "Uttar Pradesh", pincode: "284001", provider: "google" });
  });

  it("returns null for no result and never calls out for invalid coordinates", async () => {
    expect(parseGoogle({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(parseNominatim({})).toBeNull();
    let called = false;
    expect(await reverseGeocode(200, 78, (async () => { called = true; return new Response("{}"); }) as typeof fetch)).toBeNull();
    expect(called).toBe(false);
  });

  it("uses OpenStreetMap without a key and caches the same spot", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    let calls = 0;
    const fetcher = (async (url: string) => {
      calls++;
      expect(String(url)).toContain("nominatim.openstreetmap.org");
      return new Response(JSON.stringify({ address: { village: "Rajapur", state: "Uttar Pradesh", postcode: "284001" } }));
    }) as unknown as typeof fetch;
    const a = await reverseGeocode(25.41234, 78.61234, fetcher);
    const b = await reverseGeocode(25.41231, 78.61232, fetcher);
    expect(a?.village).toBe("Rajapur");
    expect(b).toEqual(a);
    expect(calls).toBe(1);
  });
});
