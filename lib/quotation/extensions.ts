export const MUV_AI_QUOTATION_INTEGRATION = {
  featureFlag: "muv_ai_quotation_integration", enabled: false,
  reservedEvents: ["quotation.created", "quotation.approved", "quotation.accepted"],
} as const;
export interface ReservedQuotationIntelligenceProvider { readonly enabled: false }
