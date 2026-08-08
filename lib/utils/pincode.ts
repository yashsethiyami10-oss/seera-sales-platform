/**
 * Founder Final Consolidated Polish, Part 2 — real address-mismatch
 * detection, not a fabricated full pincode-to-city database (none exists
 * in this repo). India Post's own PIN code zone system is real, public,
 * and stable: the first digit of every Indian PIN code identifies one of
 * nine postal zones, each mapping to a fixed, well-known set of states.
 * This can only ever produce a genuine "the first digit doesn't match any
 * state you could plausibly mean" warning — it can never wrongly reject an
 * order (a full city-level lookup would need real API access this
 * environment doesn't have), so it fails open, not closed.
 */
const PINCODE_ZONE_STATES: Record<string, string[]> = {
  "1": ["delhi", "haryana", "punjab", "himachal pradesh", "jammu and kashmir", "jammu & kashmir", "chandigarh", "ladakh"],
  "2": ["uttar pradesh", "uttarakhand"],
  "3": ["rajasthan", "gujarat", "daman and diu", "daman & diu", "dadra and nagar haveli", "dadra & nagar haveli"],
  "4": ["maharashtra", "madhya pradesh", "chhattisgarh", "goa"],
  "5": ["andhra pradesh", "telangana", "karnataka"],
  "6": ["tamil nadu", "kerala", "puducherry", "pondicherry", "lakshadweep"],
  "7": [
    "west bengal", "odisha", "orissa", "assam", "north east", "arunachal pradesh", "manipur", "meghalaya",
    "mizoram", "nagaland", "tripura", "sikkim", "andaman and nicobar", "andaman & nicobar",
  ],
  "8": ["bihar", "jharkhand"],
  "9": ["army post office", "field post office", "apo", "fpo"],
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns a human-readable warning when the PIN code's postal zone clearly
 * doesn't include the entered state, or `null` when it's plausible (or
 * either field is incomplete/unrecognized — never blocks on ambiguity).
 */
export function detectPincodeStateMismatch(pincode: string, state: string): string | null {
  if (!/^\d{6}$/.test(pincode) || !state.trim()) return null;
  const zone = pincode[0]!;
  const validStates = PINCODE_ZONE_STATES[zone];
  if (!validStates) return null; // zone 0 doesn't exist; nothing to flag
  const normalizedState = normalize(state);
  const matches = validStates.some((s) => normalizedState.includes(s) || s.includes(normalizedState));
  if (matches) return null;
  return `This PIN code doesn't look right for "${state}" — double-check the PIN and state before continuing.`;
}
