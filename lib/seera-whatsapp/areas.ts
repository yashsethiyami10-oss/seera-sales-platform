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


// Known city / district → state (UP and Rajasthan district HQs + major cities elsewhere), used when a
// record has only a town name (e.g. Market Survey "market"). Names that exist in two states
// (Pratapgarh, Fatehpur) are left out on purpose.
const CITY_STATE: Record<string, string> = {
  "abu road": "Rajasthan",
  "agra": "Uttar Pradesh",
  "ahmedabad": "Gujarat",
  "ajmer": "Rajasthan",
  "aligarh": "Uttar Pradesh",
  "allahabad": "Uttar Pradesh",
  "alwar": "Rajasthan",
  "ambala": "Haryana",
  "ambedkar nagar": "Uttar Pradesh",
  "amethi": "Uttar Pradesh",
  "amritsar": "Punjab",
  "amroha": "Uttar Pradesh",
  "anand": "Gujarat",
  "arrah": "Bihar",
  "auraiya": "Uttar Pradesh",
  "aurangabad": "Maharashtra",
  "ayodhya": "Uttar Pradesh",
  "azamgarh": "Uttar Pradesh",
  "badaun": "Uttar Pradesh",
  "baghpat": "Uttar Pradesh",
  "bahraich": "Uttar Pradesh",
  "ballia": "Uttar Pradesh",
  "balotra": "Rajasthan",
  "balrampur": "Uttar Pradesh",
  "banaras": "Uttar Pradesh",
  "banda": "Uttar Pradesh",
  "bandikui": "Rajasthan",
  "bangalore": "Karnataka",
  "banswara": "Rajasthan",
  "barabanki": "Uttar Pradesh",
  "baran": "Rajasthan",
  "bareilly": "Uttar Pradesh",
  "barmer": "Rajasthan",
  "baroda": "Gujarat",
  "bassi": "Rajasthan",
  "basti": "Uttar Pradesh",
  "bathinda": "Punjab",
  "beawar": "Rajasthan",
  "begusarai": "Bihar",
  "behror": "Rajasthan",
  "bengaluru": "Karnataka",
  "bhadohi": "Uttar Pradesh",
  "bhagalpur": "Bihar",
  "bharatpur": "Rajasthan",
  "bhavnagar": "Gujarat",
  "bhilai": "Chhattisgarh",
  "bhilwara": "Rajasthan",
  "bhind": "Madhya Pradesh",
  "bhiwadi": "Rajasthan",
  "bhiwani": "Haryana",
  "bhopal": "Madhya Pradesh",
  "bhuj": "Gujarat",
  "bijnor": "Uttar Pradesh",
  "bikaner": "Rajasthan",
  "bilaspur": "Chhattisgarh",
  "bokaro": "Jharkhand",
  "budaun": "Uttar Pradesh",
  "bulandshahr": "Uttar Pradesh",
  "bundi": "Rajasthan",
  "burhanpur": "Madhya Pradesh",
  "chandauli": "Uttar Pradesh",
  "chhatarpur": "Madhya Pradesh",
  "chitrakoot": "Uttar Pradesh",
  "chittaurgarh": "Rajasthan",
  "chittorgarh": "Rajasthan",
  "chomu": "Rajasthan",
  "churu": "Rajasthan",
  "darbhanga": "Bihar",
  "datia": "Madhya Pradesh",
  "dausa": "Rajasthan",
  "dehradun": "Uttarakhand",
  "delhi": "Delhi",
  "deoria": "Uttar Pradesh",
  "dewas": "Madhya Pradesh",
  "dhanbad": "Jharkhand",
  "dholpur": "Rajasthan",
  "didwana": "Rajasthan",
  "dungarpur": "Rajasthan",
  "durg": "Chhattisgarh",
  "etah": "Uttar Pradesh",
  "etawah": "Uttar Pradesh",
  "faizabad": "Uttar Pradesh",
  "faridabad": "Haryana",
  "farrukhabad": "Uttar Pradesh",
  "fatehpur shekhawati": "Rajasthan",
  "firozabad": "Uttar Pradesh",
  "gandhinagar": "Gujarat",
  "ganganagar": "Rajasthan",
  "gangapur": "Rajasthan",
  "gangapur city": "Rajasthan",
  "gaya": "Bihar",
  "ghaziabad": "Uttar Pradesh",
  "ghazipur": "Uttar Pradesh",
  "gonda": "Uttar Pradesh",
  "gorakhpur": "Uttar Pradesh",
  "greater noida": "Uttar Pradesh",
  "guna": "Madhya Pradesh",
  "gurgaon": "Haryana",
  "gurugram": "Haryana",
  "gwalior": "Madhya Pradesh",
  "haldwani": "Uttarakhand",
  "hamirpur": "Uttar Pradesh",
  "hanumangarh": "Rajasthan",
  "hapur": "Uttar Pradesh",
  "hardoi": "Uttar Pradesh",
  "haridwar": "Uttarakhand",
  "hathras": "Uttar Pradesh",
  "hindaun": "Rajasthan",
  "hindaun city": "Rajasthan",
  "hisar": "Haryana",
  "hubli": "Karnataka",
  "indore": "Madhya Pradesh",
  "jabalpur": "Madhya Pradesh",
  "jaipur": "Rajasthan",
  "jaisalmer": "Rajasthan",
  "jalandhar": "Punjab",
  "jalaun": "Uttar Pradesh",
  "jalore": "Rajasthan",
  "jamnagar": "Gujarat",
  "jamshedpur": "Jharkhand",
  "jaunpur": "Uttar Pradesh",
  "jhalawar": "Rajasthan",
  "jhansi": "Uttar Pradesh",
  "jhunjhunu": "Rajasthan",
  "jind": "Haryana",
  "jodhpur": "Rajasthan",
  "junagadh": "Gujarat",
  "kannauj": "Uttar Pradesh",
  "kanpur": "Uttar Pradesh",
  "karauli": "Rajasthan",
  "karnal": "Haryana",
  "kasganj": "Uttar Pradesh",
  "kashipur": "Uttarakhand",
  "katni": "Madhya Pradesh",
  "kaushambi": "Uttar Pradesh",
  "kekri": "Rajasthan",
  "khandwa": "Madhya Pradesh",
  "khurja": "Uttar Pradesh",
  "kishangarh": "Rajasthan",
  "kolhapur": "Maharashtra",
  "korba": "Chhattisgarh",
  "kosi kalan": "Uttar Pradesh",
  "kota": "Rajasthan",
  "kotputli": "Rajasthan",
  "kurukshetra": "Haryana",
  "kushinagar": "Uttar Pradesh",
  "lakhimpur kheri": "Uttar Pradesh",
  "lalitpur": "Uttar Pradesh",
  "lalsot": "Rajasthan",
  "laxmangarh": "Rajasthan",
  "loni": "Uttar Pradesh",
  "lucknow": "Uttar Pradesh",
  "ludhiana": "Punjab",
  "maharajganj": "Uttar Pradesh",
  "mahoba": "Uttar Pradesh",
  "mainpuri": "Uttar Pradesh",
  "makrana": "Rajasthan",
  "mandalgarh": "Rajasthan",
  "mandsaur": "Madhya Pradesh",
  "mangaluru": "Karnataka",
  "mathura": "Uttar Pradesh",
  "mau": "Uttar Pradesh",
  "meerut": "Uttar Pradesh",
  "mehsana": "Gujarat",
  "mirzapur": "Uttar Pradesh",
  "modinagar": "Uttar Pradesh",
  "mohali": "Punjab",
  "moradabad": "Uttar Pradesh",
  "morena": "Madhya Pradesh",
  "mumbai": "Maharashtra",
  "muzaffarnagar": "Uttar Pradesh",
  "muzaffarpur": "Bihar",
  "mysore": "Karnataka",
  "mysuru": "Karnataka",
  "nagaur": "Rajasthan",
  "nagpur": "Maharashtra",
  "nashik": "Maharashtra",
  "nathdwara": "Rajasthan",
  "neemrana": "Rajasthan",
  "neemuch": "Madhya Pradesh",
  "new delhi": "Delhi",
  "nimbahera": "Rajasthan",
  "nohar": "Rajasthan",
  "noida": "Uttar Pradesh",
  "orai": "Uttar Pradesh",
  "padrauna": "Uttar Pradesh",
  "palanpur": "Gujarat",
  "pali": "Rajasthan",
  "palwal": "Haryana",
  "panipat": "Haryana",
  "patiala": "Punjab",
  "patna": "Bihar",
  "phalodi": "Rajasthan",
  "pilibhit": "Uttar Pradesh",
  "prayagraj": "Uttar Pradesh",
  "pune": "Maharashtra",
  "purnia": "Bihar",
  "rae bareli": "Uttar Pradesh",
  "raebareli": "Uttar Pradesh",
  "raipur": "Chhattisgarh",
  "rajkot": "Gujarat",
  "rajsamand": "Rajasthan",
  "rampur": "Uttar Pradesh",
  "ranchi": "Jharkhand",
  "ratangarh": "Rajasthan",
  "ratlam": "Madhya Pradesh",
  "rewa": "Madhya Pradesh",
  "rewari": "Haryana",
  "robertsganj": "Uttar Pradesh",
  "rohtak": "Haryana",
  "roorkee": "Uttarakhand",
  "rudrapur": "Uttarakhand",
  "sagar": "Madhya Pradesh",
  "saharanpur": "Uttar Pradesh",
  "sambhal": "Uttar Pradesh",
  "sanganer": "Rajasthan",
  "sant kabir nagar": "Uttar Pradesh",
  "sardarshahar": "Rajasthan",
  "satna": "Madhya Pradesh",
  "sawai madhopur": "Rajasthan",
  "shahjahanpur": "Uttar Pradesh",
  "shahpura": "Rajasthan",
  "shamli": "Uttar Pradesh",
  "shikohabad": "Uttar Pradesh",
  "shivpuri": "Madhya Pradesh",
  "shravasti": "Uttar Pradesh",
  "siddharthnagar": "Uttar Pradesh",
  "sikandrabad": "Uttar Pradesh",
  "sikar": "Rajasthan",
  "sirohi": "Rajasthan",
  "sirsa": "Haryana",
  "sitapur": "Uttar Pradesh",
  "solapur": "Maharashtra",
  "sonbhadra": "Uttar Pradesh",
  "sonipat": "Haryana",
  "sri ganganagar": "Rajasthan",
  "sujangarh": "Rajasthan",
  "sultanpur": "Uttar Pradesh",
  "surat": "Gujarat",
  "suratgarh": "Rajasthan",
  "thane": "Maharashtra",
  "tikamgarh": "Madhya Pradesh",
  "tonk": "Rajasthan",
  "tundla": "Uttar Pradesh",
  "udaipur": "Rajasthan",
  "ujjain": "Madhya Pradesh",
  "unnao": "Uttar Pradesh",
  "vadodara": "Gujarat",
  "varanasi": "Uttar Pradesh",
  "vidisha": "Madhya Pradesh",
  "vrindavan": "Uttar Pradesh",
  "yamunanagar": "Haryana",
};
export function stateForCity(city: string | null): string | null {
  if (!city) return null;
  const k = city.toLowerCase().replace(/\s+/g, " ").trim();
  return CITY_STATE[k] ?? CITY_STATE[k.replace(/ city$/, "")] ?? null;
}
// State from free address text: a 6-digit PIN or a state name inside it.
export function stateFromText(text: unknown): string | null {
  const t = str(text);
  if (!t) return null;
  const pin = t.match(/\b(\d{6})\b/)?.[1];
  if (pin && PIN_STATE[pin.slice(0, 2)]) return PIN_STATE[pin.slice(0, 2)]!;
  const low = ` ${t.toLowerCase().replace(/[.,()|/-]/g, " ")} `;
  for (const [alias, state] of Object.entries(STATE_ALIASES)) if (alias.length > 2 && low.includes(` ${alias} `)) return state;
  if (/\b(u ?p)\b/.test(low)) return "Uttar Pradesh";
  return null;
}

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
  const state = normalizeState(a.state, null) ?? normalizeState(d.state, null) ?? normalizeState(null, pin) ?? stateFromText(a.line) ?? stateFromText(a.area) ?? stateForCity(city) ?? normalizeState(null, str(d.pincode)) ?? stateForCity(cleanCity(d.city) ?? cleanCity(d.town));
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
