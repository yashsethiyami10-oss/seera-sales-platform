// GPS → place details (landmark, locality, village / town / city, district, state, PIN) so field
// forms can fill the address automatically — including small villages.
//
// Provider: Google Geocoding when GOOGLE_MAPS_API_KEY is set (best landmark / village coverage in
// India; paid), otherwise OpenStreetMap Nominatim (free, no key; light use only — one request per
// second, identified User-Agent, results cached). Called only server-side, so the browser CSP stays
// 'self' and the key never reaches the client.

export type PlaceDetails = {
  landmark: string | null;
  // House / shop number + road — the street-level part of the exact address.
  street: string | null;
  locality: string | null;
  village: string | null;
  town: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  formatted: string;
  provider: "google" | "openstreetmap";
};

type NominatimAddress = Record<string, string | undefined>;

const first = (...values: (string | undefined | null)[]) => values.find((v) => v && v.trim())?.trim() ?? null;
const unique = (values: (string | null)[]) => values.filter((v, i, all): v is string => !!v && all.findIndex((x) => x?.toLowerCase() === v.toLowerCase()) === i);
const withoutCountry = (s: string | undefined) => (s ?? "").replace(/,\s*India\s*$/i, "").trim();

// Exactness rules (field bug: at a shop inside a town the app showed a NEIGHBOURING village):
// - The settlement is the most specific one the point is actually in: city > town > village.
//   OpenStreetMap often also reports the nearest village node next to a town; when a town/city is
//   present that village is NOT where the shop is, so it is dropped instead of being printed
//   first in the address.
// - The street (house number + road) and neighbourhood come first, so the address reads from the
//   exact spot outward, the way a person would write it.
export function parseNominatim(body: { display_name?: string; name?: string; address?: NominatimAddress }): PlaceDetails | null {
  const a = body.address;
  if (!a) return null;
  const landmark = first(a.amenity, a.shop, a.building, a.tourism, a.office, a.leisure, a.historic, a.craft, body.name);
  const street = first([a.house_number, a.road].filter(Boolean).join(" "));
  const city = first(a.city);
  const town = first(a.town, a.municipality);
  const inUrbanPlace = Boolean(city || town);
  const village = inUrbanPlace ? null : first(a.village, a.hamlet);
  const locality = first(a.neighbourhood, a.suburb, a.quarter, a.residential, a.city_district, inUrbanPlace ? null : a.village && a.hamlet ? a.hamlet : null);
  const district = first(a.state_district, a.county);
  const state = first(a.state);
  const pincode = first(a.postcode)?.replace(/\s/g, "") ?? null;
  const formatted = unique([landmark === street ? null : landmark, street, locality, village, town, city, district, state]).join(", ") + (pincode ? ` – ${pincode}` : "");
  return { landmark, street, locality, village, town, city, district, state, pincode, formatted: formatted || withoutCountry(body.display_name), provider: "openstreetmap" };
}

type GoogleComponent = { long_name: string; types: string[] };
type GoogleResult = { formatted_address?: string; types?: string[]; address_components?: GoogleComponent[] };
export function parseGoogle(body: { status?: string; results?: GoogleResult[] }): PlaceDetails | null {
  if (body.status !== "OK" || !body.results?.length) return null;
  // results[0] is Google's most precise match for the exact coordinate; later results are wider
  // areas. Read every part from the most precise result that has it.
  const pick = (type: string) => {
    for (const r of body.results ?? []) {
      const c = r.address_components?.find((x) => x.types.includes(type));
      if (c) return c.long_name;
    }
    return null;
  };
  const top = body.results[0]!;
  const fromTop = (type: string) => top.address_components?.find((x) => x.types.includes(type))?.long_name ?? null;
  const landmark = first(fromTop("point_of_interest"), fromTop("establishment"), fromTop("premise"));
  const street = first([fromTop("street_number"), fromTop("route")].filter(Boolean).join(" "));
  const locality = first(pick("sublocality_level_2"), pick("sublocality_level_1"), pick("sublocality"), pick("neighborhood"));
  const cityOrTown = pick("locality");
  const village = cityOrTown ? null : first(pick("administrative_area_level_4"));
  const district = first(pick("administrative_area_level_3"), pick("administrative_area_level_2"));
  const state = first(pick("administrative_area_level_1"));
  const pincode = first(pick("postal_code"));
  const built = unique([landmark, street, locality, village, cityOrTown, district, state]).join(", ") + (pincode ? ` – ${pincode}` : "");
  // Plus-code-only results (e.g. "7JQ8+2X Koshiyhal") are not a readable address — use the parts.
  const googleText = withoutCountry(top.formatted_address);
  const formatted = googleText && !/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\b/.test(googleText) && !top.types?.includes("plus_code") ? googleText : built;
  return { landmark, street, locality, village, town: null, city: cityOrTown, district, state, pincode, formatted: formatted || built, provider: "google" };
}

// ~11 m grid cache: the same shop re-checked does not hit the provider again.
const cache = new Map<string, { at: number; value: PlaceDetails }>();
const CACHE_MS = 24 * 3_600_000;
let nextNominatimSlot = 0;

export async function reverseGeocode(lat: number, lng: number, fetcher: typeof fetch = fetch): Promise<PlaceDetails | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: PlaceDetails | null = null;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    // A Google timeout / outage falls through to OpenStreetMap instead of failing the auto-fill.
    try {
      const res = await fetcher(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&region=in&key=${encodeURIComponent(googleKey)}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) value = parseGoogle(await res.json());
    } catch {
      value = null;
    }
  }
  if (!value) {
    // Nominatim usage policy: at most one request per second from this app.
    const wait = nextNominatimSlot - Date.now();
    nextNominatimSlot = Math.max(Date.now(), nextNominatimSlot) + 1100;
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    const res = await fetcher(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`, {
      headers: { "User-Agent": "SeeraSalesApp/1.0 (+https://www.seeradetergent.in)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) value = parseNominatim(await res.json());
  }
  if (value) {
    if (cache.size > 5000) cache.clear();
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}
