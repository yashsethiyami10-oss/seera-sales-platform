/**
 * MUV AI — Stage 6E, Query Normalizer. Resolves Objective 2 (Hindi &
 * Hinglish Retrieval) through retrieval engineering, exactly as instructed
 * — "solve this through retrieval engineering... do NOT duplicate
 * Knowledge Objects." No Knowledge Object is translated, duplicated, or
 * rewritten anywhere in this codebase because of this file. Instead, the
 * QUERY is normalized toward the English vocabulary the real Knowledge
 * Objects are actually written in, before it reaches
 * `runRetrievalPipeline()`/`searchKnowledgeFactories()` — the same English
 * KOs are matched regardless of what language the question arrived in.
 *
 * Deterministic, dictionary-based — not a real machine-translation system.
 * `semantic-retrieval.ts` ADDS the normalized terms to the original query
 * text rather than replacing it, so this can never make an already-working
 * English query worse; it can only add additional match surface for
 * Hindi/Hinglish input.
 *
 * HONEST SCOPE: the dictionaries below cover common question words, verbs,
 * and product/care-domain nouns relevant to this catalog — not general
 * Hindi vocabulary. A Hindi/Hinglish query using vocabulary outside this
 * list will not be translated and falls back to whatever the raw text
 * happens to match (usually nothing, for content written in English) —
 * see `MULTILINGUAL_VALIDATION_REPORT.md` for what was and wasn't proven
 * to work.
 *
 * SECOND HONEST LIMITATION, found during this stage's own verification:
 * translated terms are APPENDED as a bag of words, never reordered into
 * English grammar (Hindi/English word order differ). This is real,
 * working, and sufficient for KEYWORD retrieval (word order doesn't
 * matter for matching against `runRetrievalPipeline()`/
 * `searchKnowledgeFactories()`), but it means a downstream consumer doing
 * multi-word PHRASE matching (Intent Classification's lexicon has entries
 * like "safe to use") cannot rely on a translated phrase reconstructing in
 * the right order — see `intent-engine.ts`'s own note on this.
 */

import type { DetectedLanguage } from "./types";

export type { DetectedLanguage };

export type NormalizedQuery = {
  /** Original text + every real translation/expansion found, space
   * -joined — never a replacement of the original, always an addition. */
  normalizedQuery: string;
  detectedLanguage: DetectedLanguage;
  /** Real (token, translation) pairs actually applied — for audit/testing,
   * so a claim of "this was translated" is always checkable against what
   * literally happened. */
  translations: { token: string; translatedTo: string }[];
};

const DEVANAGARI_RANGE = /[ऀ-ॿ]/;

/** Romanized Hindi / Hinglish vocabulary → English. Lowercase keys only —
 * matching is case-insensitive. */
const ROMAN_HINDI_DICTIONARY: Record<string, string> = {
  kaise: "how", kaisi: "how", kyun: "why", kyon: "why", kab: "when",
  kahan: "where", kahaan: "where", kaun: "who", kitna: "how much", kitne: "how many",
  kya: "what",
  istemal: "use", upyog: "use", prayog: "use",
  karein: "do", kare: "do", karna: "do", karo: "do", kijiye: "do",
  chahiye: "need",
  lagana: "apply", lagayein: "apply", lagaye: "apply", laga: "apply",
  dhona: "wash", dho: "wash", dhoye: "wash", dhoyein: "wash",
  kharidna: "buy", kharide: "buy", kharidein: "buy",
  milega: "available", milta: "available", miltha: "available",
  chalega: "work", chalta: "work",
  sabun: "soap", saabun: "soap",
  nahana: "bath", nahane: "bath", nahaana: "bath", nahaane: "bath",
  tel: "oil",
  safai: "cleaning", saaf: "clean",
  kapde: "clothes", kapda: "cloth",
  bartan: "utensils",
  farsh: "floor",
  shauchalay: "toilet", sauchalay: "toilet", toilet: "toilet",
  kimat: "price", daam: "price", keemat: "price", keemath: "price",
  dukan: "shop",
  paani: "water", pani: "water",
  khushbu: "fragrance", khushboo: "fragrance",
  surakshit: "safe", suraksha: "safety",
  nuksan: "harm", nuksaan: "harm",
  jalan: "irritation",
  khatra: "danger", khatarnak: "dangerous",
  accha: "good", achha: "good", bura: "bad",
  zyada: "more", jyada: "more", kam: "less",
  roz: "daily", din: "day", raat: "night", subah: "morning",
};

/** Same vocabulary, real Devanagari script forms. */
const DEVANAGARI_DICTIONARY: Record<string, string> = {
  "कैसे": "how", "क्यों": "why", "कब": "when", "कहाँ": "where", "कहां": "where",
  "कौन": "who", "कितना": "how much", "कितने": "how many", "क्या": "what",
  "इस्तेमाल": "use", "उपयोग": "use", "प्रयोग": "use",
  "करें": "do", "करे": "do", "करना": "do", "करो": "do",
  "चाहिए": "need",
  "लगाना": "apply", "लगाएं": "apply", "लगाये": "apply",
  "धोना": "wash", "धो": "wash", "धोएं": "wash",
  "खरीदना": "buy", "खरीदें": "buy",
  "मिलेगा": "available", "मिलता": "available",
  "साबुन": "soap",
  "नहाना": "bath", "नहाने": "bath",
  "तेल": "oil",
  "सफाई": "cleaning", "साफ": "clean",
  "कपड़े": "clothes",
  "बर्तन": "utensils",
  "फर्श": "floor",
  "शौचालय": "toilet",
  "कीमत": "price", "दाम": "price",
  "दुकान": "shop",
  "पानी": "water",
  "खुशबू": "fragrance",
  "सुरक्षित": "safe", "सुरक्षा": "safety",
  "नुकसान": "harm",
  "जलन": "irritation",
  "खतरा": "danger",
};

/** Particles/postpositions/copulas that carry no independent keyword
 * meaning for retrieval purposes — dropped, not translated, so they don't
 * pollute the keyword match with noise. */
const STRIP_PARTICLES = new Set(["ka", "ki", "ke", "ko", "se", "mein", "par", "hai", "hain", "hoon", "hu", "tha", "thi", "the", "wala", "wale", "wali", "aur", "ya"]);

/** Compound English product-domain words written without a space —
 * expanded to their spaced form so keyword matching against real KO
 * titles (which are always spaced, e.g. "Body Wash") still hits. */
const COMPOUND_SPLITS: Record<string, string> = {
  bodywash: "body wash",
  facewash: "face wash",
  handwash: "hand wash",
  dishwash: "dish wash",
  floorcleaner: "floor cleaner",
  glasscleaner: "glass cleaner",
  toiletcleaner: "toilet cleaner",
};

/** Deliberately small, real domain-synonym expansion — not a general
 * thesaurus. Each entry ADDS the synonym alongside the original token,
 * never replaces it. */
const SYNONYM_EXPANSION: Record<string, string[]> = {
  skin: ["body"],
  bodywash: ["skin"],
};

function tokenize(text: string): string[] {
  const matches = text.match(/[ऀ-ॿ]+|[A-Za-z0-9]+/g);
  return matches ?? [];
}

export function normalizeQuery(text: string | undefined): NormalizedQuery {
  if (!text || !text.trim()) {
    return { normalizedQuery: "", detectedLanguage: "EN", translations: [] };
  }

  const tokens = tokenize(text);
  const additions: string[] = [];
  const translations: { token: string; translatedTo: string }[] = [];
  let devanagariCount = 0;
  let romanHindiHits = 0;
  let latinCount = 0;

  for (const rawToken of tokens) {
    if (DEVANAGARI_RANGE.test(rawToken)) {
      devanagariCount++;
      const translated = DEVANAGARI_DICTIONARY[rawToken];
      if (translated) {
        additions.push(translated);
        translations.push({ token: rawToken, translatedTo: translated });
      }
      continue;
    }

    latinCount++;
    const lower = rawToken.toLowerCase();

    if (STRIP_PARTICLES.has(lower)) continue;

    const compoundSplit = COMPOUND_SPLITS[lower];
    if (compoundSplit) {
      additions.push(compoundSplit);
      translations.push({ token: rawToken, translatedTo: compoundSplit });
    }

    const romanTranslation = ROMAN_HINDI_DICTIONARY[lower];
    if (romanTranslation) {
      romanHindiHits++;
      additions.push(romanTranslation);
      translations.push({ token: rawToken, translatedTo: romanTranslation });
    }

    const synonyms = SYNONYM_EXPANSION[lower];
    if (synonyms) {
      for (const syn of synonyms) {
        additions.push(syn);
        translations.push({ token: rawToken, translatedTo: syn });
      }
    }
  }

  let detectedLanguage: DetectedLanguage;
  if (devanagariCount > 0 && latinCount > 0) detectedLanguage = "MIXED";
  else if (devanagariCount > 0) detectedLanguage = "HI";
  else if (romanHindiHits > 0) detectedLanguage = "HINGLISH";
  else detectedLanguage = "EN";

  const normalizedQuery = [text, ...additions].join(" ").trim();
  return { normalizedQuery, detectedLanguage, translations };
}
