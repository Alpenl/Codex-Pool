import { tenantCreditsApi, type TenantCreditLedgerItem } from './tenantCredits'

export interface TenantBillingSummaryResponse {
  balance_microcredits: number
  today_consumed_microcredits: number
  month_consumed_microcredits: number
}

export interface TenantBillingLedgerResponse {
  items: TenantCreditLedgerItem[]
}

export const billingApi = {
  tenantSummary: async (): Promise<TenantBillingSummaryResponse> => {
    const summary = await tenantCreditsApi.summary()
    return {
      balance_microcredits: summary.balance_microcredits,
      today_consumed_microcredits: summary.today_consumed_microcredits,
      month_consumed_microcredits: summary.month_consumed_microcredits,
    }
  },

  tenantLedger: async (limit = 200): Promise<TenantBillingLedgerResponse> => {
    const response = await tenantCreditsApi.ledger(limit)
    return { items: response.items }
  },
}
