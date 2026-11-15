// Pure rules for the Seera WhatsApp Hub: template parsing, variable sources, quiet hours,
// send policy and STOP/START keywords. No database or network here, so every rule is unit-tested.

export type PartyType = "RETAILER" | "DISTRIBUTOR" | "SUPER_STOCKIST";
export const PARTY_TYPES: readonly PartyType[] = ["RETAILER", "DISTRIBUTOR", "SUPER_STOCKIST"];

export type Recipient = {
  partyType: PartyType;
  partyId: string;
  phone: string; // canonical 91XXXXXXXXXX
  businessName: string;
  ownerName: string | null;
  city: string | null;
  distributorName: string | null;
  code: string | null;
};

// Where each template variable's text comes from. CUSTOM uses the campaign's own fixed text.
export const VARIABLE_SOURCES = {
  CONTACT_NAME: { en: "Contact name (owner, else shop)", hi: "संपर्क नाम (मालिक, नहीं तो दुकान)" },
  BUSINESS_NAME: { en: "Shop / firm name", hi: "दुकान / फ़र्म का नाम" },
  OWNER_NAME: { en: "Owner name", hi: "मालिक का नाम" },
  CITY: { en: "City / area", hi: "शहर / इलाका" },
  DISTRIBUTOR_NAME: { en: "Their distributor (retailers)", hi: "उनका डिस्ट्रीब्यूटर (रिटेलर)" },
  PARTY_CODE: { en: "Party code", hi: "पार्टी कोड" },
  CUSTOM: { en: "Fixed text I type", hi: "मेरा लिखा हुआ टेक्स्ट" },
} as const;
export type VariableSource = keyof typeof VARIABLE_SOURCES;
export type VariableMapping = { variable: string; source: VariableSource; value?: string };

export type ParsedTemplate = {
  headerFormat: string | null; // TEXT | IMAGE | VIDEO | DOCUMENT | null
  bodyText: string | null;
  variableNames: string[]; // "1","2",... for positional, or the names for named parameters
  named: boolean;
  hasButtons: boolean;
};

type MetaComponent = { type?: string; format?: string; text?: string; buttons?: unknown[] };

// Reads a Meta message_templates component list. Body variables are {{1}}.. (positional) or
// {{first_name}} (named). Header TEXT variables are not supported by the hub (skipped by sync).
export function parseTemplateComponents(components: MetaComponent[] | null | undefined): ParsedTemplate {
  const list = Array.isArray(components) ? components : [];
  const header = list.find((c) => String(c.type).toUpperCase() === "HEADER");
  const body = list.find((c) => String(c.type).toUpperCase() === "BODY");
  const bodyText = typeof body?.text === "string" ? body.text : null;
  const seen: string[] = [];
  for (const m of (bodyText ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!seen.includes(m[1]!)) seen.push(m[1]!);
  const named = seen.some((v) => !/^\d+$/.test(v));
  const variableNames = named ? seen : seen.sort((a, b) => Number(a) - Number(b));
  return {
    headerFormat: header ? String(header.format ?? "TEXT").toUpperCase() : null,
    bodyText,
    variableNames,
    named,
    hasButtons: list.some((c) => String(c.type).toUpperCase() === "BUTTONS"),
  };
}

const clip = (s: string) => s.replace(/[\n\t]+/g, " ").replace(/\s{4,}/g, "   ").trim().slice(0, 900);

// Fills one variable for one recipient. Meta rejects empty parameters, so a missing value falls
// back to a sensible word rather than an empty string.
export function variableValue(source: VariableSource, r: Recipient, custom?: string): string {
  switch (source) {
    case "CONTACT_NAME":
      return clip(r.ownerName?.trim() || r.businessName || "Partner");
    case "BUSINESS_NAME":
      return clip(r.businessName || "Partner");
    case "OWNER_NAME":
      return clip(r.ownerName?.trim() || r.businessName || "Partner");
    case "CITY":
      return clip(r.city?.trim() || "your area");
    case "DISTRIBUTOR_NAME":
      return clip(r.distributorName?.trim() || "Seera");
    case "PARTY_CODE":
      return clip(r.code || "-");
    case "CUSTOM":
      return clip(custom?.trim() || "-");
  }
}

export function renderPreview(bodyText: string | null, values: Record<string, string>): string {
  return (bodyText ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, v: string) => values[v] ?? `{{${v}}}`);
}

// ---- Quiet hours (Asia/Kolkata, UTC+05:30, no DST) ----
export const IST_OFFSET_MINUTES = 330;
export type QuietHours = { quietHoursEnabled: boolean; quietStartMinute: number; quietEndMinute: number };

export function istMinuteOfDay(at: Date): number {
  const m = Math.floor(at.getTime() / 60000) + IST_OFFSET_MINUTES;
  return ((m % 1440) + 1440) % 1440;
}
export function isQuietTime(at: Date, q: QuietHours): boolean {
  if (!q.quietHoursEnabled || q.quietStartMinute === q.quietEndMinute) return false;
  const m = istMinuteOfDay(at);
  return q.quietStartMinute < q.quietEndMinute ? m >= q.quietStartMinute && m < q.quietEndMinute : m >= q.quietStartMinute || m < q.quietEndMinute;
}
export function nextSendableTime(at: Date, q: QuietHours): Date {
  if (!isQuietTime(at, q)) return at;
  const wait = (q.quietEndMinute - istMinuteOfDay(at) + 1440) % 1440;
  const next = new Date(at.getTime() + wait * 60000);
  next.setUTCSeconds(0, 0);
  return next;
}

// ---- Send policy ----
export type PolicyInput = {
  category: string | null;
  optedOut: boolean;
  lastMarketingSentAt: Date | null;
  marketingGapDays: number;
  now: Date;
};
export type PolicyDecision = { send: true } | { send: false; reason: "OPTED_OUT" | "FREQUENCY_CAP" };

// Opt-out always wins. Marketing messages respect a minimum gap per phone number so nobody is
// flooded; utility messages (about the partner's own orders/account) are not capped.
export function decide(p: PolicyInput): PolicyDecision {
  if (p.optedOut) return { send: false, reason: "OPTED_OUT" };
  if ((p.category ?? "MARKETING").toUpperCase() === "MARKETING" && p.lastMarketingSentAt && p.marketingGapDays > 0) {
    const gapMs = p.marketingGapDays * 86_400_000;
    if (p.now.getTime() - p.lastMarketingSentAt.getTime() < gapMs) return { send: false, reason: "FREQUENCY_CAP" };
  }
  return { send: true };
}

// ---- Inbound keywords ----
const STOP_WORDS = ["stop", "stop promotions", "stop promotion", "unsubscribe", "stop all", "band karo", "band", "बंद", "बंद करो", "ruko", "mat bhejo", "no more"];
const START_WORDS = ["start", "subscribe", "shuru", "शुरू", "resume"];
export function inboundKeyword(text: string | null | undefined): "STOP" | "START" | null {
  const t = (text ?? "").trim().toLowerCase().replace(/[.!।]+$/g, "");
  if (!t || t.length > 30) return null;
  if (STOP_WORDS.includes(t)) return "STOP";
  if (START_WORDS.includes(t)) return "START";
  return null;
}

// The free-form reply window Meta allows after the customer's last message.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
export function withinServiceWindow(lastInboundAt: Date | null, now: Date): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

export function nextRunAfter(from: Date, repeatEveryDays: number | null): Date | null {
  if (!repeatEveryDays || repeatEveryDays < 1) return null;
  return new Date(from.getTime() + repeatEveryDays * 86_400_000);
}
