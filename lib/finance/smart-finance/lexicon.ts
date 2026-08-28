// SEERA SMART FINANCE — LEXICON. Pure data: the Hindi / Hinglish / English word lists the
// deterministic parser (parser.ts) matches against. Nothing here posts anything or touches the
// database — it only turns a free sentence into candidate structured hints, which service.ts then
// resolves against real governed master data. Keep every mapping conservative: a wrong guess here
// becomes a MEDIUM/LOW-confidence draft the user must correct on the review card, never an
// auto-post.

// Multiplicative number words (Indian + international). Order matters for the parser's scaling
// pass — larger scales are applied outermost.
export const SCALE_WORDS: Record<string, number> = {
  hundred: 100, sau: 100, "सौ": 100,
  thousand: 1000, hazar: 1000, hazaar: 1000, hajar: 1000, hajaar: 1000, "हज़ार": 1000, "हजार": 1000,
  k: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000, "लाख": 100000,
  crore: 10000000, cr: 10000000, "करोड़": 10000000,
  million: 1000000, mn: 1000000,
};

// Additive number words 0–99 (Hinglish + Devanagari + English). Deliberately not exhaustive for
// every 21–99 Hindi form — the common ones people actually dictate. Anything missing simply falls
// back to digit parsing / MEDIUM confidence.
export const UNIT_WORDS: Record<string, number> = {
  zero: 0, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chah: 6, chhah: 6, che: 6, six: 6, saat: 7, seven: 7,
  aath: 8, eight: 8, nau: 9, nine: 9, das: 10, dus: 10, ten: 10,
  gyarah: 11, eleven: 11, barah: 12, twelve: 12, terah: 13, thirteen: 13, chaudah: 14, fourteen: 14,
  pandrah: 15, fifteen: 15, solah: 16, sixteen: 16, satrah: 17, seventeen: 17, atharah: 18, eighteen: 18,
  unnis: 19, nineteen: 19, bees: 20, bis: 20, twenty: 20,
  pachas: 50, pachaas: 50, fifty: 50, sau: 100,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "बीस": 20, "पचास": 50,
};

// "sava" (×1.25), "dhai" (2.5), "adha/aadha" (0.5), "sadhe" (+0.5) — common spoken fractions.
export const FRACTION_PREFIX: Record<string, number> = {
  sava: 1.25, dedh: 1.5, dedhh: 1.5, dhai: 2.5, adha: 0.5, aadha: 0.5, "आधा": 0.5,
};

export type Direction = "MONEY_IN" | "MONEY_OUT";

// Verbs / phrases that signal money coming IN vs going OUT. Matched as whole words.
export const MONEY_IN_WORDS = [
  "aaya", "aya", "aaye", "aye", "aayi", "ayi", "aayaa",
  "mila", "mile", "mili", "milaa",
  "received", "receive", "recieved", "recd",
  "collection", "collected", "vasooli", "vasuli",
  "jama", "prapt", "praapt",
  "credit", "credited",
  "आया", "आये", "मिला", "मिली", "प्राप्त", "जमा",
];
export const MONEY_OUT_WORDS = [
  "diya", "diye", "di", "diyaa", "de",
  "kiya", "kiye", "ki", "kiyaa",
  "paid", "pay", "payment", "chukaya", "chukaye",
  "kharch", "kharcha", "spent", "spend",
  "bhugtan", "bhеjа",
  "दिया", "दिये", "दी", "किया", "किये", "भुगतान", "खर्च", "चुकाया",
];

// Category keyword -> Money Desk purpose code (see money-desk-registry.ts). Every value here is a
// real registry code. Longer / more specific phrases are listed first; parser.ts matches greedily.
export const CATEGORY_KEYWORDS: { keywords: string[]; purposeCode: string; label: string }[] = [
  { purposeCode: "EXP-EMI", label: "EMI / Loan Repayment", keywords: ["emi", "loan repayment", "loan installment", "loan kist", "loan ki kist", "kist", "किश्त", "installment", "instalment", "loan repay", "loan chukaya", "loan"] },
  { purposeCode: "EXP-ADVERTISEMENT", label: "Advertisement", keywords: ["advertisement", "advertising", "advert", "ad ke", "ads ke", "hoarding", "hoardings", "banner", "banners", "pamphlet", "pamphlets", "flex", "newspaper ad", "vigyapan", "विज्ञापन"] },
  { purposeCode: "EXP-MKT", label: "Marketing", keywords: ["marketing", "promotion", "promotional", "scheme", "publicity", "prachar", "प्रचार", "brand activation", "activation"] },
  { purposeCode: "EXP-FUEL", label: "Diesel / Fuel", keywords: ["diesel", "deezal", "deesal", "fuel", "petrol", "cng", "gas", "डीज़ल", "डीजल", "पेट्रोल", "ईंधन"] },
  { purposeCode: "EXP-FREIGHT", label: "Freight", keywords: ["freight", "bhada", "bhadaa", "bhara", "भाड़ा", "transport charge", "transportation", "lorry", "truck bhada", "mal bhada", "cartage", "haulage", "malbhada"] },
  { purposeCode: "EXP-VEHICLE", label: "Vehicle Maintenance", keywords: ["vehicle maintenance", "vehicle repair", "gaadi repair", "gadi repair", "car repair", "truck repair", "servicing", "vehicle service", "tyre", "puncture", "वाहन", "गाड़ी मरम्मत"] },
  { purposeCode: "EXP-RENT", label: "Rent", keywords: ["rent", "kiraya", "kiraaya", "किराया", "office rent", "shop rent", "godown rent", "warehouse rent"] },
  { purposeCode: "EXP-ELECTRICITY", label: "Electricity", keywords: ["electricity", "bijli", "बिजली", "power bill", "current bill", "electricity bill", "meter bill"] },
  { purposeCode: "EXP-WAREHOUSE", label: "Warehouse", keywords: ["warehouse expense", "godown expense", "godown kharcha", "warehousing", "गोदाम", "loading unloading", "hamali", "labour godown", "palledari"] },
  { purposeCode: "EXP-COURIER", label: "Courier / Delivery", keywords: ["courier", "कूरियर", "delivery charge", "parcel", "speed post", "dtdc", "bluedart", "delivery charges"] },
  { purposeCode: "EXP-PACK", label: "Packaging", keywords: ["packaging", "packing", "पैकिंग", "packing material", "carton", "tape", "wrapping"] },
  { purposeCode: "EXP-OFFICE", label: "Office Expense", keywords: ["office expense", "office kharcha", "stationery", "stationary", "printer", "cartridge", "कार्यालय", "office supplies", "tea coffee", "pantry"] },
  { purposeCode: "EXP-TRAVEL", label: "Travel (Other)", keywords: ["travel", "yatra", "यात्रा", "bus ticket", "train ticket", "flight", "hotel stay", "lodging", "auto fare", "taxi"] },
  { purposeCode: "EXP-UTILITY", label: "Utility", keywords: ["utility", "water bill", "internet bill", "wifi", "broadband", "phone bill", "mobile recharge", "telephone", "पानी बिल"] },
  { purposeCode: "EXP-REIMBURSEMENT", label: "Employee Expense Reimbursement", keywords: ["reimbursement", "reimburse", "प्रतिपूर्ति", "expense claim", "kharcha wapas", "staff claim"] },
  { purposeCode: "SAL-EMP", label: "Salary", keywords: ["salary", "salry", "tankhwah", "tankhah", "वेतन", "pagar", "pagaar", "wages", "mehntana", "मज़दूरी", "monthly salary"] },
];

// Money-In keyword hints (the sentence is about a receipt / collection).
export const RECEIPT_KEYWORDS = [
  "payment aaya", "payment aya", "payment received", "payment mila", "receipt", "collection",
  "amount received", "paisa aaya", "paisa aya", "paise aaye", "rupee received", "rs aaye", "rs aaya",
  "prapti", "प्राप्ति", "vasooli", "advance received", "advance aaya",
];

// Party-type hints.
export const PARTY_TYPE_KEYWORDS: { type: "DISTRIBUTOR" | "SUPER_STOCKIST" | "VENDOR" | "CUSTOMER" | "EMPLOYEE"; keywords: string[] }[] = [
  { type: "SUPER_STOCKIST", keywords: ["super stockist", "superstockist", "super-stockist", "s.s.", "ss ", " ss", "s s ", "sup stockist"] },
  { type: "DISTRIBUTOR", keywords: ["distributor", "distributer", "vitrak", "वितरक", "dist ", "distribtor", "dealer"] },
  { type: "VENDOR", keywords: ["vendor", "supplier", "विक्रेता", "party se maal", "raw material vendor"] },
  { type: "CUSTOMER", keywords: ["customer", "grahak", "ग्राहक", "client", "institution", "institutional"] },
  { type: "EMPLOYEE", keywords: ["employee", "staff", "karmchari", "कर्मचारी", "salesman", "worker", "driver", "helper"] },
];

// Treasury hints. Bank name keywords resolve against SeeraTreasuryAccount.name in service.ts.
export const BANK_NAME_KEYWORDS = [
  "hdfc", "sbi", "state bank", "icici", "axis", "kotak", "pnb", "punjab national",
  "bob", "bank of baroda", "canara", "union bank", "yes bank", "idfc", "indusind",
  "idbi", "federal bank", "rbl", "bandhan", "au bank", "au small",
];
export const CASH_KEYWORDS = ["cash", "nakad", "nagad", "नकद", "cash se", "cash me", "rokad", "by cash", "hard cash"];
export const UPI_KEYWORDS = ["upi", "gpay", "google pay", "phonepe", "phone pe", "paytm", "bhim", "qr code", "qr se", "scan"];
export const BANK_GENERIC_KEYWORDS = ["bank se", "bank transfer", "neft", "rtgs", "imps", "cheque", "check se", "chq", "bank me", "account se", "khate se", "net banking", "netbanking"];

// Date words.
export const DATE_TODAY_WORDS = ["aaj", "aj", "today", "आज", "abhi", "just now", "isi waqt"];
export const DATE_YESTERDAY_WORDS = ["kal", "yesterday", "बीता कल", "beeta kal", "pichhle din", "gata kal", "gaya kal"];

// Filler tokens stripped when isolating a party / purpose phrase.
export const STOPWORDS = new Set([
  "rs", "rs.", "rupees", "rupee", "rupaye", "rupaya", "rupya", "rupay", "inr", "/-", "ka", "ki", "ke",
  "ko", "se", "mein", "me", "par", "pe", "liye", "hetu", "for", "the", "a", "an", "to", "from", "of",
  "aur", "and", "with", "diye", "diya", "di", "kiya", "kiye", "paid", "pay", "payment", "aaya", "aya",
  "aaye", "mila", "received", "hua", "hui", "gaya", "gaye", "gayi", "kar", "karke", "wala", "wali",
  "amount", "total", "sum", "paisa", "paise", "money", "cash", "bank", "via", "through",
  "re", "note", "notes",
]);
