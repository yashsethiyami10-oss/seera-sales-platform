export interface MuvAiCustomerGrowthExtension {
  readonly enabled: false;
  onIntelligenceCalculated?(customerId: string): Promise<void>;
  onLoyaltyChanged?(customerId: string): Promise<void>;
  onAnalyticsRefreshed?(scope: string): Promise<void>;
}

export const muvAiCustomerGrowthExtension: MuvAiCustomerGrowthExtension = { enabled: false };
