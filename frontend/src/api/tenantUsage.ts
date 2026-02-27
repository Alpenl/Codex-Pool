import { tenantApiClient } from './tenantClient'
import type {
  UsageSummaryQueryResponse,
  UsageHourlyTrendsResponse,
  TenantUsageLeaderboardResponse,
  AccountUsageLeaderboardResponse,
  ApiKeyUsageLeaderboardResponse,
} from './types'

export const tenantUsageApi = {
  summary: (params: { start_ts: number; end_ts: number; api_key_id?: string }) =>
    tenantApiClient.get<UsageSummaryQueryResponse>('/usage/summary', { params }),

  trendsHourly: (params: { start_ts: number; end_ts: number; limit?: number; api_key_id?: string }) =>
    tenantApiClient.get<UsageHourlyTrendsResponse>('/usage/trends/hourly', { params }),

  leaderboardTenants: (params: { start_ts: number; end_ts: number; limit?: number }) =>
    tenantApiClient.get<TenantUsageLeaderboardResponse>('/usage/leaderboard/tenants', { params }),

  leaderboardAccounts: (params: { start_ts: number; end_ts: number; limit?: number }) =>
    tenantApiClient.get<AccountUsageLeaderboardResponse>('/usage/leaderboard/accounts', { params }),

  leaderboardApiKeys: (params: { start_ts: number; end_ts: number; limit?: number; api_key_id?: string }) =>
    tenantApiClient.get<ApiKeyUsageLeaderboardResponse>('/usage/leaderboard/api-keys', { params }),
}
