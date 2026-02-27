import { tenantApiClient } from './tenantClient'

export interface TenantCreditBalanceResponse {
  tenant_id: string
  balance_microcredits: number
  updated_at: string
}

export interface TenantCreditSummaryResponse {
  tenant_id: string
  balance_microcredits: number
  today_consumed_microcredits: number
  month_consumed_microcredits: number
  updated_at: string
}

export interface TenantCreditLedgerItem {
  id: string
  event_type: string
  api_key_id?: string
  request_id?: string
  delta_microcredits: number
  balance_after_microcredits: number
  model?: string
  unit_price_microcredits?: number
  input_tokens?: number
  output_tokens?: number
  meta_json?: Record<string, unknown>
  created_at: string
}

export interface TenantCreditLedgerResponse {
  items: TenantCreditLedgerItem[]
}

export interface TenantDailyCheckinResponse {
  tenant_id: string
  local_date: string
  reward_microcredits: number
  balance_microcredits: number
}

export const tenantCreditsApi = {
  balance: () => tenantApiClient.get<TenantCreditBalanceResponse>('/credits/balance'),

  summary: () => tenantApiClient.get<TenantCreditSummaryResponse>('/credits/summary'),

  ledger: (limit = 100) =>
    tenantApiClient.get<TenantCreditLedgerResponse>('/credits/ledger', {
      params: { limit },
    }),

  checkin: () => tenantApiClient.post<TenantDailyCheckinResponse>('/credits/checkin'),
}
