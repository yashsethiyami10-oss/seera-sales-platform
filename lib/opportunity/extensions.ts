export const MUV_AI_OPPORTUNITY_INTEGRATION = {
  featureFlag: "muv_ai_opportunity_integration",
  enabled: false,
  reservedEvents: ["opportunity.created", "opportunity.stage_changed", "opportunity.closed"],
} as const;

export interface ReservedOpportunityIntelligenceProvider {
  readonly enabled: false;
}
