import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, KeyRound, RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { tenantKeysApi } from '@/api/tenantKeys'
import { tenantUsageApi } from '@/api/tenantUsage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TrendChart } from '@/components/ui/trend-chart'
import { currentRangeByDays } from '@/tenant/lib/format'

type RangePreset = 1 | 7 | 30

export function TenantDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rangePreset, setRangePreset] = useState<RangePreset>(1)
  const [apiKeyId, setApiKeyId] = useState<string>('all')

  const range = useMemo(() => currentRangeByDays(rangePreset), [rangePreset])
  const selectedApiKeyId = apiKeyId === 'all' ? undefined : apiKeyId

  const { data: keys = [] } = useQuery({
    queryKey: ['tenantKeys', 'dashboard'],
    queryFn: () => tenantKeysApi.list(),
    staleTime: 60_000,
  })

  const {
    data: summary,
    isFetching: isFetchingSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['tenantDashboardSummary', range.start_ts, range.end_ts, selectedApiKeyId],
    queryFn: () => tenantUsageApi.summary({ ...range, api_key_id: selectedApiKeyId }),
    refetchInterval: 30_000,
  })

  const {
    data: trends,
    isFetching: isFetchingTrends,
    refetch: refetchTrends,
  } = useQuery({
    queryKey: ['tenantDashboardTrends', range.start_ts, range.end_ts, selectedApiKeyId],
    queryFn: () =>
      tenantUsageApi.trendsHourly({
        ...range,
        api_key_id: selectedApiKeyId,
        limit: Math.max(24, rangePreset * 24),
      }),
    refetchInterval: 60_000,
  })

  const isRefreshing = isFetchingSummary || isFetchingTrends

  const rangeLabel = (days: RangePreset) => {
    if (days === 1) {
      return t('tenantDashboard.filters.range.last24Hours', { defaultValue: 'Last 24 hours' })
    }
    if (days === 7) {
      return t('tenantDashboard.filters.range.last7Days', { defaultValue: 'Last 7 days' })
    }
    return t('tenantDashboard.filters.range.last30Days', { defaultValue: 'Last 30 days' })
  }

  const chartData = useMemo(
    () =>
      (trends?.tenant_api_key_totals ?? []).map((point) => ({
        timestamp: point.hour_start * 1000,
        requests: point.request_count,
      })),
    [trends?.tenant_api_key_totals],
  )

  const handleRefresh = () => {
    refetchSummary()
    refetchTrends()
  }

  const logsSearch = useMemo(() => {
    const params = new URLSearchParams()
    params.set('range', String(rangePreset))
    if (selectedApiKeyId) {
      params.set('api_key_id', selectedApiKeyId)
    }
    return params.toString()
  }, [rangePreset, selectedApiKeyId])

  const billingSearch = useMemo(() => {
    const params = new URLSearchParams()
    params.set('granularity', rangePreset === 30 ? 'month' : 'day')
    return params.toString()
  }, [rangePreset])

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">
            {t('tenantDashboard.title', { defaultValue: 'Tenant Dashboard' })}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('tenantDashboard.subtitle.scopePrefix', { defaultValue: 'Scope: current tenant ' })}
            {selectedApiKeyId
              ? t('tenantDashboard.subtitle.singleApiKey', { defaultValue: '(single API key)' })
              : t('tenantDashboard.subtitle.allApiKeys', { defaultValue: '(all API keys)' })}
            {t('tenantDashboard.subtitle.timeWindow', { defaultValue: ', time window: ' })}
            {rangeLabel(rangePreset)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ pathname: '/logs', search: `?${logsSearch}` })}
          >
            {t('tenantDashboard.actions.viewRequestLogs', { defaultValue: 'View request logs' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ pathname: '/billing', search: `?${billingSearch}` })}
          >
            {t('tenantDashboard.actions.viewBilling', { defaultValue: 'View billing' })}
          </Button>
          <Select
            value={String(rangePreset)}
            onValueChange={(value) => setRangePreset(Number(value) as RangePreset)}
          >
            <SelectTrigger className="w-[170px]" aria-label={t('tenantDashboard.filters.rangeAriaLabel', { defaultValue: 'Time range' })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t('tenantDashboard.filters.range.last24Hours', { defaultValue: 'Last 24 hours' })}</SelectItem>
              <SelectItem value="7">{t('tenantDashboard.filters.range.last7Days', { defaultValue: 'Last 7 days' })}</SelectItem>
              <SelectItem value="30">{t('tenantDashboard.filters.range.last30Days', { defaultValue: 'Last 30 days' })}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={apiKeyId} onValueChange={setApiKeyId}>
            <SelectTrigger className="min-w-[220px]" aria-label={t('tenantDashboard.filters.apiKeyAriaLabel', { defaultValue: 'API key' })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tenantDashboard.filters.apiKeyAll', { defaultValue: 'All API keys' })}</SelectItem>
              {keys.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.key_prefix})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('tenantDashboard.actions.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {t('tenantDashboard.cards.totalRequests.title', {
                defaultValue: 'Total tenant API key requests (selected period)',
              })}
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {(summary?.tenant_api_key_total_requests ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('tenantDashboard.cards.totalRequests.scopePrefix', { defaultValue: 'Scope: current tenant' })}
            {selectedApiKeyId
              ? t('tenantDashboard.cards.totalRequests.scopeSingleKey', { defaultValue: ' / single key' })
              : t('tenantDashboard.cards.totalRequests.scopeAllKeys', { defaultValue: ' / all keys' })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {t('tenantDashboard.cards.activeKeys.title', {
                defaultValue: 'Active API key count (selected period)',
              })}
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {(summary?.unique_tenant_api_key_count ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('tenantDashboard.cards.activeKeys.description', {
              defaultValue: 'Note: only keys with requests are counted',
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('tenantDashboard.cards.availableKeys.title', { defaultValue: 'Currently available API keys' })}</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {keys.filter((item) => item.enabled).length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('tenantDashboard.cards.availableKeys.description', {
              defaultValue: 'Based on tenant key management settings',
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('tenantDashboard.trend.title', { defaultValue: 'Request trend' })}</CardTitle>
          <CardDescription>
            {t('tenantDashboard.trend.description', {
              defaultValue: 'Scope: tenant API key request volume (hourly granularity)',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[320px] rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
              {t('tenantDashboard.trend.empty', { defaultValue: 'No request data yet' })}
            </div>
          ) : (
            <TrendChart
              data={chartData}
              lines={[
                {
                  dataKey: 'requests',
                  name: t('tenantDashboard.trend.series.requests', { defaultValue: 'Requests' }),
                  stroke: 'var(--chart-1)',
                },
              ]}
              height={320}
              xAxisFormatter={(value) =>
                new Intl.DateTimeFormat(undefined, {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(value))
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
