import { FoundationError } from "@/lib/foundation/errors";

// Meta WhatsApp Cloud API client for the Seera WhatsApp Hub. Uses this deployment's own
// WHATSAPP_* settings (the same Seera number the field app already sends from); never MUV's.
// The access token is read per call and never logged or returned.

const graphBase = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v19.0"}`;

export function waConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null,
    wabaId: env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null,
    accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim() || null,
    hasAppSecret: !!env.WHATSAPP_APP_SECRET?.trim(),
    hasVerifyToken: !!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim(),
    dispatchEnabled: env.SEERA_OUTBOX_DISPATCH_ENABLED === "true",
  };
}

export function configProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const c = waConfig(env);
  const p: string[] = [];
  if (!c.phoneNumberId) p.push("WHATSAPP_PHONE_NUMBER_ID is not set — Seera's number is not connected.");
  if (!c.accessToken) p.push("WHATSAPP_ACCESS_TOKEN is not set — messages cannot be sent.");
  if (!c.wabaId) p.push("WHATSAPP_BUSINESS_ACCOUNT_ID is not set — templates cannot be synced from Meta.");
  if (!c.hasVerifyToken) p.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set — Meta cannot connect the webhook (no inbox, no delivery ticks).");
  if (!c.hasAppSecret) p.push("WHATSAPP_APP_SECRET is not set — incoming webhooks are accepted without signature check.");
  if (!c.dispatchEnabled) p.push("SEERA_OUTBOX_DISPATCH_ENABLED is not \"true\" — the 5-minute sender does not run, so queued messages wait.");
  return p;
}

export class MetaApiError extends Error {
  constructor(message: string, readonly status: number, readonly metaCode?: number | string, readonly permanent = false) {
    super(message);
  }
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = waConfig();
  if (!accessToken) throw new FoundationError("WHATSAPP_NOT_CONFIGURED", "WhatsApp access token is not configured", 503);
  const res = await fetch(`${graphBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string; error_data?: { details?: string } } } & T;
  if (!res.ok) {
    const code = body?.error?.code;
    const msg = String(body?.error?.error_data?.details || body?.error?.message || `Meta API ${res.status}`).slice(0, 300);
    // 4xx other than rate limits (code 4/80007/130429/131048/131056) are permanent for this message.
    const rateLimited = res.status === 429 || [4, 80007, 130429, 131048, 131056].includes(Number(code));
    throw new MetaApiError(msg, res.status, code, res.status >= 400 && res.status < 500 && !rateLimited);
  }
  return body as T;
}

export type MetaTemplate = { id: string; name: string; language: string; status: string; category?: string; components?: { type?: string; format?: string; text?: string }[] };

export async function fetchTemplates(): Promise<MetaTemplate[]> {
  const { wabaId } = waConfig();
  if (!wabaId) throw new FoundationError("WHATSAPP_WABA_NOT_CONFIGURED", "WHATSAPP_BUSINESS_ACCOUNT_ID is not set", 503);
  const out: MetaTemplate[] = [];
  let next: string | null = `/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=200`;
  for (let page = 0; next && page < 10; page++) {
    const r: { data?: MetaTemplate[]; paging?: { next?: string } } = await graph(next);
    out.push(...(r.data ?? []));
    next = r.paging?.next ? r.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "") : null;
  }
  return out;
}

export type PhoneProfile = {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  nameStatus: string | null;
  newDisplayName: string | null;
  newNameStatus: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  messagingLimitTier: string | null;
  isOfficialBusinessAccount: boolean | null;
};

export async function fetchPhoneProfile(): Promise<PhoneProfile> {
  const { phoneNumberId } = waConfig();
  if (!phoneNumberId) throw new FoundationError("WHATSAPP_NOT_CONFIGURED", "WHATSAPP_PHONE_NUMBER_ID is not set", 503);
  const r = await graph<Record<string, unknown>>(
    `/${phoneNumberId}?fields=display_phone_number,verified_name,name_status,new_display_name,new_name_status,quality_rating,code_verification_status,messaging_limit_tier,is_official_business_account`,
  );
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  return {
    displayPhoneNumber: s("display_phone_number"),
    verifiedName: s("verified_name"),
    nameStatus: s("name_status"),
    newDisplayName: s("new_display_name"),
    newNameStatus: s("new_name_status"),
    qualityRating: s("quality_rating"),
    codeVerificationStatus: s("code_verification_status"),
    messagingLimitTier: s("messaging_limit_tier"),
    isOfficialBusinessAccount: typeof r.is_official_business_account === "boolean" ? r.is_official_business_account : null,
  };
}

export type TemplateSend = {
  to: string;
  name: string;
  language: string;
  named: boolean;
  variableNames: string[];
  values: string[];
  headerFormat?: string | null;
  headerMediaUrl?: string | null;
};

export function buildTemplatePayload(t: TemplateSend) {
  const components: unknown[] = [];
  const fmt = (t.headerFormat ?? "").toUpperCase();
  if (t.headerMediaUrl && ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
    const key = fmt.toLowerCase();
    // A document needs a filename, otherwise WhatsApp shows the recipient a meaningless name.
    const filename = key === "document" ? decodeURIComponent(t.headerMediaUrl.split("?")[0]!.split("/").pop() || "document.pdf") : undefined;
    components.push({ type: "header", parameters: [{ type: key, [key]: { link: t.headerMediaUrl, ...(filename ? { filename } : {}) } }] });
  }
  if (t.values.length) {
    components.push({
      type: "body",
      parameters: t.values.map((text, i) => (t.named ? { type: "text", parameter_name: t.variableNames[i], text } : { type: "text", text })),
    });
  }
  return {
    messaging_product: "whatsapp",
    to: t.to,
    type: "template",
    template: { name: t.name, language: { code: t.language }, ...(components.length ? { components } : {}) },
  };
}

export async function sendTemplate(t: TemplateSend): Promise<string> {
  const { phoneNumberId } = waConfig();
  if (!phoneNumberId) throw new FoundationError("WHATSAPP_NOT_CONFIGURED", "WHATSAPP_PHONE_NUMBER_ID is not set", 503);
  const r = await graph<{ messages?: { id?: string }[] }>(`/${phoneNumberId}/messages`, { method: "POST", body: JSON.stringify(buildTemplatePayload(t)) });
  return r.messages?.[0]?.id ?? "";
}

export async function sendText(to: string, text: string): Promise<string> {
  const { phoneNumberId } = waConfig();
  if (!phoneNumberId) throw new FoundationError("WHATSAPP_NOT_CONFIGURED", "WHATSAPP_PHONE_NUMBER_ID is not set", 503);
  const r = await graph<{ messages?: { id?: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: text } }),
  });
  return r.messages?.[0]?.id ?? "";
}
