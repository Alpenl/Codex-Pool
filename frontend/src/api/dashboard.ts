import { apiClient } from './client'
import type { AdminSystemStateResponse, UsageSummaryQueryResponse, UsageHourlyTrendsResponse } from './types'
import { subDays } from 'date-fns'

export interface DashboardUsageQueryParams {
    start_ts?: number
    end_ts?: number
    tenant_id?: string
    account_id?: string
    api_key_id?: string
    limit?: number
}

function defaultRange() {
    const endTs = Math.floor(Date.now() / 1000)
    const startTs = Math.floor(subDays(new Date(), 1).getTime() / 1000)
    return { startTs, endTs }
}

export const dashboardApi = {
    getSystemState: () =>
        apiClient.get<AdminSystemStateResponse>('/admin/system/state'),

    getUsageSummary: (params?: DashboardUsageQueryParams) => {
        const { startTs, endTs } = defaultRange()
        return apiClient.get<UsageSummaryQueryResponse>(`/admin/usage/summary`, {
            params: {
                start_ts: params?.start_ts ?? startTs,
                end_ts: params?.end_ts ?? endTs,
                tenant_id: params?.tenant_id,
                account_id: params?.account_id,
                api_key_id: params?.api_key_id,
            }
        })
    },

    getHourlyTrends: (params?: DashboardUsageQueryParams) => {
        const { startTs, endTs } = defaultRange()
        return apiClient.get<UsageHourlyTrendsResponse>(`/admin/usage/trends/hourly`, {
            params: {
                start_ts: params?.start_ts ?? startTs,
                end_ts: params?.end_ts ?? endTs,
                tenant_id: params?.tenant_id,
                account_id: params?.account_id,
                api_key_id: params?.api_key_id,
                limit: params?.limit ?? 24,
            }
        })
    }
}
