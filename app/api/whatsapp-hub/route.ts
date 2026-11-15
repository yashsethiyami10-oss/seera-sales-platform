import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { configProblems, fetchPhoneProfile, waConfig } from "@/lib/seera-whatsapp/meta";
import { PARTY_TYPES, VARIABLE_SOURCES } from "@/lib/seera-whatsapp/rules";
import {
  getSettings,
  getThread,
  deleteContacts,
  importContacts,
  listAreas,
  listContacts,
  saveContact,
  listCampaigns,
  listTemplates,
  listThreads,
  overview,
  previewAudience,
  replyInThread,
  requireHub,
  saveCampaign,
  scheduleCampaign,
  setCampaignState,
  setOptOut,
  syncTemplates,
  testSend,
  updateSettings,
  listAutoReplies,
  saveAutoReply,
  deleteAutoReply,
  setAutoReplyEnabled,
  testAutoReply,
  type CampaignInput,
} from "@/lib/seera-whatsapp/service";

// Seera WhatsApp Hub (Founder / Admin). POST only; middleware rejects cross-origin POSTs to
// /api/*, and every service call re-checks notifications:manage for the caller itself.
const partyType = z.enum(PARTY_TYPES as unknown as [string, ...string[]]);
const audience = z.object({
  partyTypes: z.array(partyType).min(1).max(6),
  distributorIds: z.array(z.string().max(64)).max(200).optional(),
  // Area-wise: "state|city" keys and/or "state:<state>" for a whole state.
  areaKeys: z.array(z.string().max(160)).max(500).optional(),
  // Everyone except these cities / states.
  excludeAreaKeys: z.array(z.string().max(160)).max(500).optional(),
  // With MANUAL: only these contact groups ("__none__" = contacts without a group).
  manualGroups: z.array(z.string().max(60)).max(100).optional(),
});
const contact = z.object({
  phone: z.string().max(20),
  name: z.string().max(120).nullish(),
  businessName: z.string().max(120).nullish(),
  city: z.string().max(120).nullish(),
  state: z.string().max(60).nullish(),
  groupName: z.string().max(60).nullish(),
  notes: z.string().max(300).nullish(),
});
const variableMap = z
  .array(
    z.object({
      variable: z.string().max(60),
      source: z.enum(Object.keys(VARIABLE_SOURCES) as [string, ...string[]]),
      value: z.string().max(900).optional(),
      areaValues: z.record(z.string().max(160), z.string().max(900)).refine((o) => Object.keys(o).length <= 300, "Too many areas").optional(),
    }),
  )
  .max(20);
const campaign = z.object({
  name: z.string().max(120),
  templateName: z.string().min(1).max(512),
  language: z.string().min(2).max(15),
  audience,
  variableMap,
  headerMediaUrl: z.string().max(1000).nullish(),
  repeatEveryDays: z.number().int().min(1).max(90).nullish(),
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bootstrap") }),
  z.object({ action: z.literal("sync_templates") }),
  z.object({ action: z.literal("phone_profile") }),
  z.object({ action: z.literal("settings"), patch: z.object({ sendEnabled: z.boolean().optional(), quietHoursEnabled: z.boolean().optional(), quietStartMinute: z.number().optional(), quietEndMinute: z.number().optional(), marketingGapDays: z.number().optional() }).strict() }),
  z.object({ action: z.literal("preview"), audience, templateName: z.string().max(512).optional(), language: z.string().max(15).optional(), variableMap: variableMap.optional() }),
  z.object({ action: z.literal("areas"), audience: audience.omit({ areaKeys: true, excludeAreaKeys: true }) }),
  z.object({ action: z.literal("save_campaign"), id: z.string().max(64).optional(), campaign }),
  z.object({ action: z.literal("test_send"), phone: z.string().max(20), campaign }),
  z.object({ action: z.literal("schedule"), id: z.string().max(64), startAt: z.string().datetime().nullish() }),
  z.object({ action: z.literal("campaign_state"), id: z.string().max(64), state: z.enum(["PAUSE", "CANCEL"]) }),
  z.object({ action: z.literal("threads"), q: z.string().max(80).optional() }),
  z.object({ action: z.literal("thread"), phone: z.string().max(20) }),
  z.object({ action: z.literal("reply"), phone: z.string().max(20), text: z.string().min(1).max(4000) }),
  z.object({ action: z.literal("opt_out"), phone: z.string().max(20), optOut: z.boolean(), reason: z.string().max(100).optional() }),
  z.object({ action: z.literal("opt_outs") }),
  z.object({ action: z.literal("auto_list") }),
  z.object({ action: z.literal("auto_toggle"), enabled: z.boolean() }),
  z.object({ action: z.literal("auto_test"), text: z.string().max(500) }),
  z.object({ action: z.literal("auto_delete"), id: z.string().max(64) }),
  z.object({ action: z.literal("auto_save"), rule: z.object({ id: z.string().max(64).optional(), kind: z.string().max(12).optional(), name: z.string().max(80), keywords: z.array(z.string().max(80)).max(60), replyText: z.string().max(1000), mediaType: z.string().max(12).nullish(), mediaUrl: z.string().max(1000).nullish(), buttons: z.array(z.string().max(40)).max(3), alertTeam: z.boolean(), active: z.boolean(), priority: z.number().optional(), cooldownMinutes: z.number().optional() }) }),
  z.object({ action: z.literal("contacts"), q: z.string().max(80).optional(), group: z.string().max(60).optional() }),
  z.object({ action: z.literal("save_contact"), id: z.string().max(64).optional(), contact }),
  z.object({ action: z.literal("import_contacts"), text: z.string().min(1).max(200_000), groupName: z.string().max(60).nullish(), city: z.string().max(120).nullish(), state: z.string().max(60).nullish() }),
  z.object({ action: z.literal("delete_contacts"), ids: z.array(z.string().max(64)).min(1).max(500) }),
]);

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`whatsapp-hub:${user.id}`, 120, 60_000);
    const b = body.parse(await request.json());
    const id = user.id;
    switch (b.action) {
      case "bootstrap": {
        await requireHub(prisma, id);
        const [stats, settings, templates, campaigns, distributors, contactGroups] = await Promise.all([
          overview(prisma, id),
          getSettings(prisma),
          listTemplates(prisma),
          listCampaigns(prisma),
          prisma.seeraPartner.findMany({ where: { type: "DISTRIBUTOR" }, select: { id: true, tradeName: true, legalName: true }, orderBy: { legalName: "asc" }, take: 300 }),
          // Manual contact groups for the campaign form; [] until the contacts table exists.
          prisma.seeraWaContact.groupBy({ by: ["groupName"], _count: { _all: true }, orderBy: { groupName: "asc" } }).catch(() => []),
        ]);
        const c = waConfig();
        return NextResponse.json({
          stats,
          settings,
          templates,
          campaigns,
          distributors: distributors.map((d) => ({ id: d.id, name: d.tradeName ?? d.legalName })),
          contactGroups: contactGroups.map((g) => ({ name: g.groupName ?? "__none__", count: g._count._all })),
          config: { problems: configProblems(), connected: !!(c.phoneNumberId && c.accessToken) },
        });
      }
      case "sync_templates":
        return NextResponse.json({ templates: await syncTemplates(prisma, id) });
      case "phone_profile":
        await requireHub(prisma, id);
        return NextResponse.json({ profile: await fetchPhoneProfile() });
      case "settings":
        return NextResponse.json({ settings: await updateSettings(prisma, id, b.patch) });
      case "preview":
        return NextResponse.json(await previewAudience(prisma, id, b as never));
      case "areas":
        return NextResponse.json({ areas: await listAreas(prisma, id, b.audience as never) });
      case "save_campaign":
        return NextResponse.json({ campaign: await saveCampaign(prisma, id, { ...(b.campaign as CampaignInput), id: b.id }) });
      case "test_send":
        enforceRateLimit(`whatsapp-hub-test:${id}`, 10, 60_000);
        return NextResponse.json(await testSend(prisma, id, { ...(b.campaign as CampaignInput), phone: b.phone }));
      case "schedule":
        return NextResponse.json({ campaign: await scheduleCampaign(prisma, id, b.id, b.startAt ? new Date(b.startAt) : null) });
      case "campaign_state":
        return NextResponse.json(await setCampaignState(prisma, id, b.id, b.state));
      case "threads":
        return NextResponse.json({ threads: await listThreads(prisma, id, b.q) });
      case "thread":
        return NextResponse.json(await getThread(prisma, id, b.phone));
      case "reply":
        enforceRateLimit(`whatsapp-hub-reply:${id}`, 30, 60_000);
        return NextResponse.json(await replyInThread(prisma, id, b.phone, b.text));
      case "opt_out":
        return NextResponse.json(await setOptOut(prisma, id, b.phone, b.optOut, b.reason));
      case "contacts":
        return NextResponse.json(await listContacts(prisma, id, b.q, b.group));
      case "save_contact":
        return NextResponse.json({ contact: await saveContact(prisma, id, { ...b.contact, id: b.id }) });
      case "import_contacts":
        enforceRateLimit(`whatsapp-hub-import:${id}`, 10, 60_000);
        return NextResponse.json(await importContacts(prisma, id, b));
      case "delete_contacts":
        return NextResponse.json(await deleteContacts(prisma, id, b.ids));
      case "auto_list":
        return NextResponse.json(await listAutoReplies(prisma, id));
      case "auto_toggle":
        return NextResponse.json(await setAutoReplyEnabled(prisma, id, b.enabled));
      case "auto_test":
        return NextResponse.json({ match: await testAutoReply(prisma, id, b.text) });
      case "auto_delete":
        return NextResponse.json(await deleteAutoReply(prisma, id, b.id));
      case "auto_save":
        return NextResponse.json({ rule: await saveAutoReply(prisma, id, b.rule) });
      case "opt_outs":
        await requireHub(prisma, id);
        return NextResponse.json({ optOuts: await prisma.seeraWaOptOut.findMany({ orderBy: { createdAt: "desc" }, take: 500 }) });
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021")
      return NextResponse.json({ error: { code: "WA_HUB_NOT_SET_UP", message: "WhatsApp Hub tables are not on this server yet — the latest database migration has to be applied." } }, { status: 503 });
    if (error instanceof Error && error.name === "MetaApiError")
      return NextResponse.json({ error: { code: "META_API", message: `Meta: ${error.message}` } }, { status: 502 });
    return apiFailure(error, request);
  }
}
