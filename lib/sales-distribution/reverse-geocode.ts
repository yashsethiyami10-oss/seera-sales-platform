// GPS → place details (landmark, locality, village / town / city, district, state, PIN) so field
// forms can fill the address automatically — including small villages.
//
// Provider: Google Geocoding when GOOGLE_MAPS_API_KEY is set (best landmark / village coverage in
// India; paid), otherwise OpenStreetMap Nominatim (free, no key; light use only — one request per
// second, identified User-Agent, results cached). Called only server-side, so the browser CSP stays
// 'self' and the key never reaches the client.

export type PlaceDetails = {
  landmark: string | null;
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

export function parseNominatim(body: { display_name?: string; name?: string; address?: NominatimAddress }): PlaceDetails | null {
  const a = body.address;
  if (!a) return null;
  const landmark = first(a.amenity, a.shop, a.building, a.tourism, a.office, a.leisure, a.historic, body.name);
  const locality = first(a.neighbourhood, a.suburb, a.quarter, a.residential, a.hamlet, a.road);
  const village = first(a.village, a.hamlet && !a.village ? a.hamlet : undefined);
  const town = first(a.town, a.municipality);
  const city = first(a.city);
  const district = first(a.state_district, a.county);
  const state = first(a.state);
  const pincode = first(a.postcode)?.replace(/\s/g, "") ?? null;
  const formatted = unique([landmark, locality, village, town, city, district, state]).join(", ") + (pincode ? ` – ${pincode}` : "");
  return { landmark, locality, village, town, city, district, state, pincode, formatted: formatted || body.display_name || "", provider: "openstreetmap" };
}

type GoogleComponent = { long_name: string; types: string[] };
export function parseGoogle(body: { status?: string; results?: { formatted_address?: string; address_components?: GoogleComponent[] }[] }): PlaceDetails | null {
  if (body.status !== "OK" || !body.results?.length) return null;
  const pick = (type: string) => {
    for (const r of body.results ?? []) {
      const c = r.address_components?.find((x) => x.types.includes(type));
      if (c) return c.long_name;
    }
    return null;
  };
  const landmark = first(pick("point_of_interest"), pick("establishment"), pick("premise"));
  const locality = first(pick("sublocality_level_2"), pick("sublocality_level_1"), pick("sublocality"), pick("neighborhood"), pick("route"));
  const cityOrTown = pick("locality");
  const village = first(pick("administrative_area_level_4"));
  const district = first(pick("administrative_area_level_3"), pick("administrative_area_level_2"));
  const state = first(pick("administrative_area_level_1"));
  const pincode = first(pick("postal_code"));
  const formatted = unique([landmark, locality, village, cityOrTown, district, state]).join(", ") + (pincode ? ` – ${pincode}` : "");
  return { landmark, locality, village, town: null, city: cityOrTown, district, state, pincode, formatted: formatted || body.results[0]?.formatted_address || "", provider: "google" };
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
    const res = await fetcher(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&region=in&key=${encodeURIComponent(googleKey)}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) value = parseGoogle(await res.json());
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
