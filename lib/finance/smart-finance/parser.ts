import {
  BANK_GENERIC_KEYWORDS,
  BANK_NAME_KEYWORDS,
  CASH_KEYWORDS,
  CATEGORY_KEYWORDS,
  DATE_TODAY_WORDS,
  DATE_YESTERDAY_WORDS,
  FRACTION_PREFIX,
  MONEY_IN_WORDS,
  MONEY_OUT_WORDS,
  PARTY_TYPE_KEYWORDS,
  RECEIPT_KEYWORDS,
  SCALE_WORDS,
  STOPWORDS,
  UNIT_WORDS,
  UPI_KEYWORDS,
  type Direction,
} from "./lexicon";

// SEERA SMART FINANCE — DETERMINISTIC PARSER. Turns a typed / dictated natural-language finance
// instruction (Hindi, Hinglish, English) into structured *hints*. It is intentionally rule-based,
// not an LLM: given the same sentence it always produces the same output, and it never invents a
// value it did not read from the text. Every hint it emits is re-validated by service.ts against
// governed master data before anything can be posted, and the user always sees an editable review
// card first (see FINANCIAL SAFETY, spec §21/§32).

export type PartyTypeHint = "DISTRIBUTOR" | "SUPER_STOCKIST" | "VENDOR" | "CUSTOMER" | "EMPLOYEE";
export type TreasuryHint = { kind: "CASH" | "BANK" | "UPI"; bankKeyword?: string };

export type ParsedSmartFinance = {
  originalText: string;
  normalizedText: string;
  amount: number | null;
  amountText: string | null;
  /** ISO yyyy-mm-dd when a date word/phrase was found; null → caller defaults to today. */
  date: string | null;
  dateWord: string | null;
  direction: Direction | null;
  /** True when direction was inferred from category (expense ⇒ OUT) rather than an explicit verb. */
  directionInferred: boolean;
  categoryKeyword: string | null;
  purposeCode: string | null;
  purposeLabel: string | null;
  partyTypeHint: PartyTypeHint | null;
  /** Best-effort party / employee name phrase left after removing every recognised token. */
  partyText: string | null;
  treasuryHint: TreasuryHint | null;
  /** Free "what for" phrase, e.g. "dispatch ke liye" → "dispatch". */
  purposeText: string | null;
  warnings: string[];
};

const WORD = /[a-z0-9./-]+|[\u0900-\u097F]+/gi;

function normalize(text: string): string {
  return text
    .replace(/[₹]/g, " rs ")
    .replace(/\brs\.?\b/gi, " rs ")
    .replace(/(\d),(?=\d{2,3}\b)/g, "$1") // 25,000 → 25000 ; 1,50,000 → 150000
    .replace(/([0-9])\s*(k)\b/gi, "$1 thousand ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter(Boolean);
}

// ── Amount ────────────────────────────────────────────────────────────────────────────────────
// Two strategies, first that yields a positive number wins:
//   1. an explicit digit group (optionally followed by a scale word: "2 hazar", "1.5 lakh")
//   2. a spoken number phrase ("do hazar paanch sau", "dhai lakh")
function parseDigitAmount(tokens: string[]): { amount: number; text: string } | null {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(t)) continue;
    let value = parseFloat(t);
    if (!(value > 0)) continue;
    let text = tokens[i]!;
    const next = tokens[i + 1];
    if (next && SCALE_WORDS[next] != null && SCALE_WORDS[next]! > 1) {
      value *= SCALE_WORDS[next]!;
      text = `${tokens[i]} ${next}`;
      // "2 lakh 50 hazar" style tail
      const after = tokens[i + 2];
      const afterScale = tokens[i + 3];
      if (after && /^\d+$/.test(after.replace(/,/g, "")) && afterScale && SCALE_WORDS[afterScale] != null) {
        value += parseFloat(after.replace(/,/g, "")) * SCALE_WORDS[afterScale]!;
        text = `${text} ${after} ${afterScale}`;
      }
    }
    return { amount: Math.round(value * 100) / 100, text };
  }
  return null;
}

function parseSpokenAmount(tokens: string[]): { amount: number; text: string } | null {
  // Scan for the first token that is a number word, then greedily consume a contiguous run of
  // number words / scale words / fraction prefixes.
  const isNumWord = (t: string) => UNIT_WORDS[t] != null || SCALE_WORDS[t] != null || FRACTION_PREFIX[t] != null || /^\d+$/.test(t.replace(/,/g, ""));
  let start = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isNumWord(tokens[i]!)) { start = i; break; }
  }
  if (start === -1) return null;
  let end = start;
  while (end + 1 < tokens.length && isNumWord(tokens[end + 1]!)) end++;
  const run = tokens.slice(start, end + 1);
  if (run.length === 1 && /^\d/.test(run[0]!)) return null; // pure digit handled elsewhere

  let total = 0;
  let current = 0;
  let fraction = 1;
  let consumedWord = false;
  for (const tok of run) {
    if (FRACTION_PREFIX[tok] != null) { fraction = FRACTION_PREFIX[tok]!; continue; }
    if (UNIT_WORDS[tok] != null) { current += UNIT_WORDS[tok]!; consumedWord = true; continue; }
    if (/^\d+$/.test(tok.replace(/,/g, ""))) { current += parseFloat(tok.replace(/,/g, "")); continue; }
    const scale = SCALE_WORDS[tok];
    if (scale != null) {
      consumedWord = true;
      if (current === 0) current = 1;
      if (scale >= 1000) { total += current * scale; current = 0; }
      else { current *= scale; }
    }
  }
  total += current;
  total *= fraction;
  if (fraction !== 1 && total > 0) consumedWord = true;
  if (!consumedWord || !(total > 0)) return null;
  return { amount: Math.round(total * 100) / 100, text: run.join(" ") };
}

// ── Direction ─────────────────────────────────────────────────────────────────────────────────
function parseDirection(tokens: string[], text: string): { direction: Direction | null; explicit: boolean } {
  const tokenSet = new Set(tokens);
  const hasIn = MONEY_IN_WORDS.some((w) => (w.includes(" ") ? text.includes(w) : tokenSet.has(w)));
  const hasOut = MONEY_OUT_WORDS.some((w) => (w.includes(" ") ? text.includes(w) : tokenSet.has(w)));
  const receiptPhrase = RECEIPT_KEYWORDS.some((w) => text.includes(w));
  if ((hasIn || receiptPhrase) && !hasOut) return { direction: "MONEY_IN", explicit: true };
  if (hasOut && !(hasIn || receiptPhrase)) return { direction: "MONEY_OUT", explicit: true };
  if (hasOut && hasIn) {
    // "diesel ke paise diye" but also "aaye" — trust the last verb in the sentence.
    const lastOut = Math.max(...MONEY_OUT_WORDS.map((w) => text.lastIndexOf(w)));
    const lastIn = Math.max(...MONEY_IN_WORDS.map((w) => text.lastIndexOf(w)));
    return { direction: lastOut > lastIn ? "MONEY_OUT" : "MONEY_IN", explicit: true };
  }
  return { direction: null, explicit: false };
}

// ── Category / purpose ────────────────────────────────────────────────────────────────────────
function parseCategory(text: string): { keyword: string; purposeCode: string; label: string } | null {
  for (const entry of CATEGORY_KEYWORDS) {
    for (const kw of entry.keywords) {
      const needle = kw.trim();
      const re = new RegExp(`(^|[^a-z\u0900-\u097F])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z\u0900-\u097F]|$)`, "i");
      if (re.test(text)) return { keyword: needle, purposeCode: entry.purposeCode, label: entry.label };
    }
  }
  return null;
}

// ── Party type ────────────────────────────────────────────────────────────────────────────────
function parsePartyType(text: string): PartyTypeHint | null {
  for (const entry of PARTY_TYPE_KEYWORDS) {
    if (entry.keywords.some((kw) => text.includes(kw.trim()))) return entry.type;
  }
  return null;
}

// ── Treasury ──────────────────────────────────────────────────────────────────────────────────
function parseTreasury(text: string): TreasuryHint | null {
  const bank = BANK_NAME_KEYWORDS.find((b) => text.includes(b));
  if (bank) return { kind: "BANK", bankKeyword: bank };
  if (UPI_KEYWORDS.some((u) => text.includes(u))) return { kind: "UPI" };
  if (CASH_KEYWORDS.some((c) => text.includes(c))) return { kind: "CASH" };
  if (BANK_GENERIC_KEYWORDS.some((b) => text.includes(b))) return { kind: "BANK" };
  return null;
}

// ── Date ──────────────────────────────────────────────────────────────────────────────────────
function parseDate(tokens: string[], text: string, today: Date): { date: string | null; word: string | null } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const tokenSet = new Set(tokens);
  if (DATE_TODAY_WORDS.some((w) => (w.includes(" ") ? text.includes(w) : tokenSet.has(w)))) return { date: iso(today), word: "today" };
  if (DATE_YESTERDAY_WORDS.some((w) => (w.includes(" ") ? text.includes(w) : tokenSet.has(w)))) {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { date: iso(y), word: "yesterday" };
  }
  // dd/mm or dd-mm(-yyyy)
  const m = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yyyy = m[3] ? Number(m[3]) : today.getFullYear();
    if (yyyy < 100) yyyy += 2000;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) return { date: iso(new Date(yyyy, mm - 1, dd)), word: m[0] };
  }
  return { date: null, word: null };
}

// ── Party / purpose text isolation ────────────────────────────────────────────────────────────
// After a category is identified, everything left that isn't a recognised token is a candidate
// name/purpose phrase. We split on "ke liye" / "for" to separate the purpose ("dispatch") from
// the party ("Fatehnagar distributor").
function isolateResidual(
  originalText: string,
  consumed: { amountText: string | null; categoryKeyword: string | null; dateWord: string | null; bankKeyword?: string },
): { partyText: string | null; purposeText: string | null } {
  let s = ` ${originalText.toLowerCase()} `;
  const drop = [consumed.amountText, consumed.categoryKeyword, consumed.bankKeyword].filter(Boolean) as string[];
  for (const d of drop) s = s.replace(new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  s = s
    .replace(/[₹]/g, " ")
    .replace(/\b\d+(\.\d+)?\b/g, " ")
    .replace(/\brs\.?\b|\brupees?\b|\brupaye\b/gi, " ")
    .replace(/\b(aaj|aj|today|kal|yesterday|abhi)\b/gi, " ");

  // "X ke liye" / "X hetu" / "for X": in Hindi the purpose noun (X) sits immediately BEFORE the
  // marker; in English immediately AFTER. Split on the marker, keep both sides as candidates.
  let headPart = s;
  let tailPart = "";
  let hadMarker = false;
  const splitMatch = s.match(/\b(ke liye|ke lie|hetu|for|regarding|against)\b/i);
  if (splitMatch && splitMatch.index != null) {
    hadMarker = true;
    headPart = s.slice(0, splitMatch.index);
    tailPart = s.slice(splitMatch.index + splitMatch[0].length);
  }

  // Remove party-type words themselves from both sides (keep "Fatehnagar", drop "distributor").
  const stripTypes = (x: string) => {
    for (const entry of PARTY_TYPE_KEYWORDS) for (const kw of entry.keywords) x = x.replace(new RegExp(`\\b${kw.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
    return x;
  };
  const headWords = cleanPhrase(stripTypes(headPart)).split(" ").filter(Boolean);
  const tailWords = cleanPhrase(stripTypes(tailPart)).split(" ").filter(Boolean);

  let partyText: string;
  let purposeText: string | null = null;
  if (hadMarker && tailWords.length > 0 && headWords.length === 0) {
    // English "diesel for dispatch" — purpose after the marker.
    purposeText = tailWords.join(" ");
    partyText = "";
  } else if (hadMarker && headWords.length > 1) {
    // Hindi "Fatehnagar distributor dispatch ke liye" — last word(s) before the marker are the
    // purpose, the rest is the party name.
    purposeText = headWords.slice(-1).join(" ");
    partyText = headWords.slice(0, -1).join(" ");
    if (tailWords.length > 0) partyText = [partyText, tailWords.join(" ")].filter(Boolean).join(" ");
  } else {
    partyText = [...headWords, ...tailWords].join(" ");
  }
  return { partyText: partyText.trim() || null, purposeText: purposeText || null };
}

function cleanPhrase(s: string): string {
  const words = (s.toLowerCase().match(WORD) ?? []).filter((w) => !STOPWORDS.has(w) && !MONEY_IN_WORDS.includes(w) && !MONEY_OUT_WORDS.includes(w));
  return words.join(" ").replace(/\s+/g, " ").trim();
}

// ── Main entry point ──────────────────────────────────────────────────────────────────────────
export function parseSmartFinance(input: string, today: Date = new Date()): ParsedSmartFinance {
  const originalText = input.trim();
  const normalizedText = normalize(originalText);
  const lowerNorm = ` ${normalizedText.toLowerCase()} `;
  const tokens = tokenize(normalizedText);
  const warnings: string[] = [];

  const digit = parseDigitAmount(tokens);
  const spoken = digit ? null : parseSpokenAmount(tokens);
  const amountHit = digit ?? spoken;
  if (!amountHit) warnings.push("No amount detected");

  const category = parseCategory(lowerNorm);
  const dir = parseDirection(tokens, lowerNorm);

  let direction = dir.direction;
  let directionInferred = false;
  if (!direction && category) {
    // Every category in the lexicon today is an expense ⇒ money out. A receipt keyword would have
    // set direction=MONEY_IN above already.
    direction = "MONEY_OUT";
    directionInferred = true;
  }
  if (!direction && RECEIPT_KEYWORDS.some((w) => lowerNorm.includes(w))) direction = "MONEY_IN";

  let purposeCode = category?.purposeCode ?? null;
  let purposeLabel = category?.label ?? null;
  if (!purposeCode && direction === "MONEY_IN") {
    purposeCode = "REC-INS";
    purposeLabel = "Institutional Receipt";
  }
  if (!purposeCode && direction === "MONEY_OUT") warnings.push("Could not match an expense category");

  const partyTypeHint = parsePartyType(lowerNorm);
  const treasuryHint = parseTreasury(lowerNorm);
  const { date, word: dateWord } = parseDate(tokens, lowerNorm, today);
  const { partyText, purposeText } = isolateResidual(originalText, {
    amountText: amountHit?.text ?? null,
    categoryKeyword: category?.keyword ?? null,
    dateWord,
    bankKeyword: treasuryHint?.bankKeyword,
  });

  return {
    originalText,
    normalizedText,
    amount: amountHit?.amount ?? null,
    amountText: amountHit?.text ?? null,
    date,
    dateWord,
    direction,
    directionInferred,
    categoryKeyword: category?.keyword ?? null,
    purposeCode,
    purposeLabel,
    partyTypeHint,
    partyText,
    treasuryHint,
    purposeText,
    warnings,
  };
}
