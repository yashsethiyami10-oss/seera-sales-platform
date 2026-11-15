// Area (state → city) for every WhatsApp Hub recipient, so a campaign can be sent area-wise and
// personalised per city ("Gangapur", "Bhilwara", "Jhansi"…). Pure functions — no DB, unit-tested.
//
// Why a resolver and not just address.city: retailers added from the field app store only a free
// "area" text (+ PIN), not a structured city/state. So the city is taken from the best source the
// record actually has, in this order:
//   1. structured address city / town / village (new records fill this from GPS)
//   2. the retailer's Territory (geography node set by the manager)
//   3. the town of the retailer's distributor (a Gangapur distributor's shops are in/around Gangapur)
//   4. the last part of the free "area" text ("Sadar Bazar, Gangapur" → "Gangapur")
// and the state from: address state → distributor's state → PIN-code zone.

export type ResolvedArea = { city: string | null; state: string | null; key: string; source: "ADDRESS" | "TERRITORY" | "DISTRIBUTOR" | "AREA_TEXT" | "NONE" };

const STATE_ALIASES: Record<string, string> = {
  up: "Uttar Pradesh", "u.p": "Uttar Pradesh", "u p": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh", "उत्तर प्रदेश": "Uttar Pradesh",
  rj: "Rajasthan", raj: "Rajasthan", rajasthan: "Rajasthan", "राजस्थान": "Rajasthan",
  mp: "Madhya Pradesh", "m.p": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh", "मध्य प्रदेश": "Madhya Pradesh",
  cg: "Chhattisgarh", chhattisgarh: "Chhattisgarh", chattisgarh: "Chhattisgarh", "छत्तीसगढ़": "Chhattisgarh",
  gj: "Gujarat", gujarat: "Gujarat", "गुजरात": "Gujarat",
  hr: "Haryana", haryana: "Haryana", "हरियाणा": "Haryana",
  dl: "Delhi", delhi: "Delhi", "new delhi": "Delhi", "दिल्ली": "Delhi",
  pb: "Punjab", punjab: "Punjab",
  uk: "Uttarakhand", uttarakhand: "Uttarakhand",
  br: "Bihar", bihar: "Bihar", "बिहार": "Bihar",
  mh: "Maharashtra", maharashtra: "Maharashtra",
  jh: "Jharkhand", jharkhand: "Jharkhand",
};

// First two PIN digits → state, only where the zone maps to ONE state (ambiguous zones are skipped).
const PIN_STATE: Record<string, string> = {
  "11": "Delhi", "12": "Haryana", "13": "Haryana", "14": "Punjab", "15": "Punjab", "16": "Punjab", "17": "Himachal Pradesh",
  "20": "Uttar Pradesh", "21": "Uttar Pradesh", "22": "Uttar Pradesh", "23": "Uttar Pradesh", "27": "Uttar Pradesh", "28": "Uttar Pradesh",
  "30": "Rajasthan", "31": "Rajasthan", "32": "Rajasthan", "33": "Rajasthan", "34": "Rajasthan",
  "36": "Gujarat", "37": "Gujarat", "38": "Gujarat", "39": "Gujarat",
  "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra", "43": "Maharashtra", "44": "Maharashtra",
  "45": "Madhya Pradesh", "46": "Madhya Pradesh", "47": "Madhya Pradesh", "48": "Madhya Pradesh", "49": "Chhattisgarh",
  "80": "Bihar", "81": "Bihar", "82": "Jharkhand", "83": "Jharkhand", "84": "Bihar", "85": "Bihar",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/^[a-z]/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");

export function normalizeState(raw: unknown, pincode?: string | null): string | null {
  const s = str(raw);
  if (s) {
    const k = s.toLowerCase().replace(/\.+$/, "").replace(/\s+/g, " ");
    return STATE_ALIASES[k] ?? STATE_ALIASES[k.replace(/\./g, "")] ?? titleCase(s);
  }
  const pin = (pincode ?? "").replace(/\D/g, "");
  return pin.length === 6 ? (PIN_STATE[pin.slice(0, 2)] ?? null) : null;
}

// "GANGAPUR CITY", "gangapur", " Gangapur  " → "Gangapur City" / "Gangapur". Strips a PIN, a
// trailing state name and "(Raj.)"-style suffixes so the same town groups together.
export function cleanCity(raw: unknown): string | null {
  let s = str(raw);
  if (!s) return null;
  s = s.replace(/\(.*?\)/g, " ").replace(/[-–]?\s*\d{6}\b/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && (STATE_ALIASES[parts.at(-1)!.toLowerCase()] || /^india$/i.test(parts.at(-1)!))) parts.pop();
  s = parts.join(", ");
  if (!s || /^(na|n\/a|-|none|null|unknown)$/i.test(s)) return null;
  return /[ऀ-ॿ]/.test(s) ? s : titleCase(s);
}

const lastSegment = (area: unknown) => {
  const s = str(area);
  if (!s) return null;
  const parts = s.split(/[,|/]/).map((p) => p.trim()).filter((p) => p && !/^\d+$/.test(p));
  return cleanCity(parts.at(-1));
};

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, "-").replace(/^-|-$/g, "");
export const areaKeyOf = (state: string | null, city: string | null) => `${slug(state ?? "unknown")}|${slug(city ?? "unassigned")}`;
export const stateKeyOf = (state: string | null) => `state:${slug(state ?? "unknown")}`;

export function resolveArea(input: {
  address?: unknown;
  pincode?: string | null;
  territoryName?: string | null;
  distributorAddress?: unknown;
}): ResolvedArea {
  const a = (input.address ?? {}) as Record<string, unknown>;
  const dRaw = input.distributorAddress;
  const d = ((Array.isArray(dRaw) ? dRaw[0] : dRaw) ?? {}) as Record<string, unknown>;
  const pin = input.pincode ?? str(a.pincode);
  let city: string | null = null;
  let source: ResolvedArea["source"] = "NONE";
  const fromAddress = cleanCity(a.city) ?? cleanCity(a.town) ?? cleanCity(a.village);
  if (fromAddress) [city, source] = [fromAddress, "ADDRESS"];
  else if (cleanCity(input.territoryName)) [city, source] = [cleanCity(input.territoryName), "TERRITORY"];
  else if (cleanCity(d.city) ?? cleanCity(d.town)) [city, source] = [cleanCity(d.city) ?? cleanCity(d.town), "DISTRIBUTOR"];
  else if (lastSegment(a.area) ?? lastSegment(a.line)) [city, source] = [lastSegment(a.area) ?? lastSegment(a.line), "AREA_TEXT"];
  const state = normalizeState(a.state, null) ?? normalizeState(d.state, null) ?? normalizeState(null, pin) ?? normalizeState(null, str(d.pincode));
  return { city, state, key: areaKeyOf(state, city), source };
}

export type AreaGroup = { state: string; stateKey: string; total: number; cities: { key: string; city: string; count: number; optedOut: number; byType: Record<string, number> }[] };

// State → city buckets with counts, biggest first, for the area picker.
export function groupAreas(rows: { areaKey: string; city: string | null; state: string | null; partyType: string; optedOut?: boolean }[]): AreaGroup[] {
  const states = new Map<string, AreaGroup>();
  for (const r of rows) {
    const stateName = r.state ?? "State not known";
    const g = states.get(stateName) ?? { state: stateName, stateKey: stateKeyOf(r.state), total: 0, cities: [] };
    let c = g.cities.find((x) => x.key === r.areaKey);
    if (!c) g.cities.push((c = { key: r.areaKey, city: r.city ?? "City not known", count: 0, optedOut: 0, byType: {} }));
    c.count++;
    if (r.optedOut) c.optedOut++;
    c.byType[r.partyType] = (c.byType[r.partyType] ?? 0) + 1;
    g.total++;
    states.set(stateName, g);
  }
  return [...states.values()]
    .map((g) => ({ ...g, cities: g.cities.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)) }))
    .sort((a, b) => (a.state === "State not known" ? 1 : b.state === "State not known" ? -1 : b.total - a.total));
}
