import { apiClient } from './client'
import type { UsageHourlyTenantTrendsResponse, UsageLeaderboardOverviewResponse } from './types'

export const usageApi = {
    getLeaderboard: (params: { start_ts: number, end_ts: number, limit?: number, tenant_id?: string, api_key_id?: string }) =>
        apiClient.get<UsageLeaderboardOverviewResponse>('/usage/leaderboard/overview', { params }),

    getHourlyTenantTrends: (params: { start_ts: number, end_ts: number, limit?: number, tenant_id?: string, api_key_id?: string }) =>
        apiClient.get<UsageHourlyTenantTrendsResponse>('/usage/trends/hourly/tenants', { params }),
}
