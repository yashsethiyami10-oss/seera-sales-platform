import { describe, expect, it } from "vitest";
import { cleanCity, groupAreas, normalizeState, resolveArea } from "@/lib/seera-whatsapp/areas";
import { areaText, variableValue, type Recipient } from "@/lib/seera-whatsapp/rules";

describe("WhatsApp Hub — area-wise audience", () => {
  it("normalises states and cities so the same town groups together", () => {
    expect(normalizeState("U.P.")).toBe("Uttar Pradesh");
    expect(normalizeState("rajasthan")).toBe("Rajasthan");
    expect(normalizeState(null, "284003")).toBe("Uttar Pradesh");
    expect(normalizeState(null, "311001")).toBe("Rajasthan");
    expect(cleanCity("GANGAPUR CITY")).toBe("Gangapur City");
    expect(cleanCity("Bhilwara, Rajasthan - 311001")).toBe("Bhilwara");
    expect(cleanCity("NA")).toBeNull();
  });

  it("takes the city from the best source the shop record has", () => {
    expect(resolveArea({ address: { area: "Sadar Bazar", city: "gangapur", state: "RJ" } })).toMatchObject({ city: "Gangapur", state: "Rajasthan", key: "rajasthan|gangapur", source: "ADDRESS" });
    expect(resolveArea({ address: { area: "Station Road" }, territoryName: "Bhilwara" })).toMatchObject({ city: "Bhilwara", source: "TERRITORY" });
    expect(resolveArea({ address: { area: "Main Market" }, distributorAddress: { city: "Jhansi", state: "UP" } })).toMatchObject({ city: "Jhansi", state: "Uttar Pradesh", source: "DISTRIBUTOR" });
    expect(resolveArea({ address: { area: "Gandhi Chowk, Raipur" }, pincode: "311803" })).toMatchObject({ city: "Raipur", state: "Rajasthan", source: "AREA_TEXT" });
    expect(resolveArea({ address: {} })).toMatchObject({ city: null, state: null, key: "unknown|unassigned", source: "NONE" });
  });

  it("groups recipients state → city with counts, biggest first", () => {
    const rows = [
      { areaKey: "rajasthan|gangapur", city: "Gangapur", state: "Rajasthan", partyType: "RETAILER" },
      { areaKey: "rajasthan|gangapur", city: "Gangapur", state: "Rajasthan", partyType: "RETAILER", optedOut: true },
      { areaKey: "rajasthan|bhilwara", city: "Bhilwara", state: "Rajasthan", partyType: "RETAILER" },
      { areaKey: "uttar-pradesh|jhansi", city: "Jhansi", state: "Uttar Pradesh", partyType: "RETAILER" },
      { areaKey: "unknown|unassigned", city: null, state: null, partyType: "RETAILER" },
    ];
    const g = groupAreas(rows);
    expect(g.map((x) => x.state)).toEqual(["Rajasthan", "Uttar Pradesh", "State not known"]);
    expect(g[0]!.cities[0]).toMatchObject({ city: "Gangapur", count: 2, optedOut: 1 });
    expect(g[0]!.stateKey).toBe("state:rajasthan");
  });

  it("personalises text per city, then per state, then the fallback", () => {
    const r: Recipient = { partyType: "RETAILER", partyId: "1", phone: "919800000000", businessName: "Sharma Store", ownerName: null, city: "Gangapur", state: "Rajasthan", areaKey: "rajasthan|gangapur", distributorName: null, code: null };
    const values = { "rajasthan|gangapur": "Gangapur offer", "state:uttar-pradesh": "UP offer" };
    expect(variableValue("AREA_TEXT", r, "Default offer", values)).toBe("Gangapur offer");
    expect(areaText({ ...r, areaKey: "uttar-pradesh|jhansi", state: "Uttar Pradesh" }, values, "Default offer")).toBe("UP offer");
    expect(variableValue("AREA_TEXT", { ...r, areaKey: "rajasthan|bhilwara" }, "Default offer", values)).toBe("Default offer");
    expect(variableValue("STATE", r)).toBe("Rajasthan");
  });
});
