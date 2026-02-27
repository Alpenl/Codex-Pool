import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowUpRight, Gauge, KeyRound, RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Button as NextButton,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Progress,
  Select,
  SelectItem,
  Skeleton,
} from '@heroui/react'

import { tenantKeysApi } from '@/api/tenantKeys'
import { tenantUsageApi } from '@/api/tenantUsage'
import AnimatedContent from '@/components/AnimatedContent'
import FadeContent from '@/components/FadeContent'
import Threads from '@/components/Threads'
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

  const {
    data: topApiKeys,
    isFetching: isFetchingTopApiKeys,
    refetch: refetchTopApiKeys,
  } = useQuery({
    queryKey: ['tenantDashboardTopApiKeys', range.start_ts, range.end_ts, selectedApiKeyId],
    queryFn: () =>
      tenantUsageApi.leaderboardApiKeys({
        ...range,
        api_key_id: selectedApiKeyId,
        limit: 6,
      }),
    refetchInterval: 60_000,
  })

  const isRefreshing = isFetchingSummary || isFetchingTrends || isFetchingTopApiKeys

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
    refetchTopApiKeys()
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

  const totalRequests = summary?.tenant_api_key_total_requests ?? 0
  const activeKeyCount = summary?.unique_tenant_api_key_count ?? 0
  const enabledKeyCount = useMemo(() => keys.filter((item) => item.enabled).length, [keys])
  const totalKeyCount = keys.length
  const enabledKeyRate = totalKeyCount > 0 ? Math.round((enabledKeyCount / totalKeyCount) * 100) : 0
  const rangeHours = Math.max(1, Math.round((range.end_ts - range.start_ts) / 3600))
  const requestVelocity = totalRequests / rangeHours

  const peakHourPoint = useMemo(() => {
    if (chartData.length === 0) {
      return null
    }
    return chartData.reduce((currentMax, item) => (item.requests > currentMax.requests ? item : currentMax))
  }, [chartData])

  const keyById = useMemo(() => {
    return new Map(keys.map((item) => [item.id, item]))
  }, [keys])

  const topKeyRows = useMemo(() => {
    return (topApiKeys?.items ?? []).slice(0, 6).map((item, index) => {
      const keyMeta = keyById.get(item.api_key_id)
      const share = totalRequests > 0 ? Math.round((item.total_requests / totalRequests) * 100) : 0
      return {
        id: item.api_key_id,
        rank: index + 1,
        name:
          keyMeta?.name
          ?? t('tenantDashboard.topKeys.unknownKey', {
            defaultValue: 'Unnamed key',
          }),
        keyPrefix: keyMeta?.key_prefix ?? item.api_key_id.slice(0, 12),
        requests: item.total_requests,
        share,
      }
    })
  }, [keyById, topApiKeys?.items, totalRequests, t])

  const peakHourText = peakHourPoint
    ? new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(peakHourPoint.timestamp))
    : t('tenantDashboard.cards.peakHour.empty', { defaultValue: 'No data' })

  const rangeOptions: Array<{ key: string; label: string }> = [
    { key: '1', label: t('tenantDashboard.filters.range.last24Hours', { defaultValue: 'Last 24 hours' }) },
    { key: '7', label: t('tenantDashboard.filters.range.last7Days', { defaultValue: 'Last 7 days' }) },
    { key: '30', label: t('tenantDashboard.filters.range.last30Days', { defaultValue: 'Last 30 days' }) },
  ]

  const apiKeyOptions = useMemo(() => {
    const options = [
      {
        key: 'all',
        label: t('tenantDashboard.filters.apiKeyAll', { defaultValue: 'All API keys' }),
      },
    ]
    for (const item of keys) {
      options.push({
        key: item.id,
        label: `${item.name} (${item.key_prefix})`,
      })
    }
    return options
  }, [keys, t])

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 opacity-35 dark:opacity-55">
          <Threads color={[0.14, 0.56, 0.94]} amplitude={0.75} distance={0.2} />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_55%),radial-gradient(circle_at_80%_20%,_rgba(14,116,144,0.14),_transparent_52%),linear-gradient(180deg,_rgba(255,255,255,0.7),_rgba(255,255,255,0.25))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_55%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.16),_transparent_50%),linear-gradient(180deg,_rgba(2,6,23,0.82),_rgba(2,6,23,0.58))]" />
      </div>

      <div className="relative z-10 space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <FadeContent blur duration={320} className="h-full">
            <Card shadow="lg" className="h-full border border-white/40 bg-white/70 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="flex flex-col items-start gap-4 p-5 pb-2 sm:p-6 sm:pb-2">
                <Chip color="primary" variant="flat" className="font-medium">
                  {t('tenantDashboard.hero.badge', { defaultValue: 'Tenant Workspace Overview' })}
                </Chip>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                    {t('tenantDashboard.title', { defaultValue: 'Tenant Dashboard' })}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {t('tenantDashboard.hero.summaryPrefix', { defaultValue: 'Scope: current tenant ' })}
                    {selectedApiKeyId
                      ? t('tenantDashboard.hero.summarySingleApiKey', { defaultValue: '(single API key)' })
                      : t('tenantDashboard.hero.summaryAllApiKeys', { defaultValue: '(all API keys)' })}
                    {' · '}
                    {rangeLabel(rangePreset)}
                  </p>
                </div>
              </CardHeader>
              <CardBody className="p-5 pt-3 sm:p-6 sm:pt-3">
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {t('tenantDashboard.subtitle.scopePrefix', { defaultValue: 'Scope: current tenant ' })}
                  {selectedApiKeyId
                    ? t('tenantDashboard.subtitle.singleApiKey', { defaultValue: '(single API key)' })
                    : t('tenantDashboard.subtitle.allApiKeys', { defaultValue: '(all API keys)' })}
                  {t('tenantDashboard.subtitle.timeWindow', { defaultValue: ', time window: ' })}
                  {rangeLabel(rangePreset)}
                </p>
              </CardBody>
            </Card>
          </FadeContent>

          <AnimatedContent distance={16} duration={0.28} ease="power3.out" className="h-full">
            <Card shadow="lg" className="h-full border border-white/40 bg-white/70 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t('tenantDashboard.filters.rangeAriaLabel', { defaultValue: 'Time range' })}
                </p>
              </CardHeader>
              <CardBody className="space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
                <Select
                  aria-label={t('tenantDashboard.filters.rangeAriaLabel', { defaultValue: 'Time range' })}
                  disallowEmptySelection
                  selectedKeys={[String(rangePreset)]}
                  onChange={(event) => setRangePreset(Number(event.target.value) as RangePreset)}
                  variant="bordered"
                  size="sm"
                >
                  {rangeOptions.map((option) => (
                    <SelectItem key={option.key}>{option.label}</SelectItem>
                  ))}
                </Select>
                <Select
                  aria-label={t('tenantDashboard.filters.apiKeyAriaLabel', { defaultValue: 'API key' })}
                  disallowEmptySelection
                  selectedKeys={[apiKeyId]}
                  onChange={(event) => setApiKeyId(event.target.value)}
                  variant="bordered"
                  size="sm"
                  items={apiKeyOptions}
                >
                  {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.filters.apiKeyHint', {
                    defaultValue: 'Tip: use API key filter to isolate hotspots quickly.',
                  })}
                </p>
                <Divider className="my-1" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <NextButton
                    variant="flat"
                    color="primary"
                    onPress={() => navigate({ pathname: '/logs', search: `?${logsSearch}` })}
                    endContent={<ArrowUpRight className="h-4 w-4" />}
                  >
                    {t('tenantDashboard.actions.viewRequestLogs', { defaultValue: 'View request logs' })}
                  </NextButton>
                  <NextButton
                    variant="flat"
                    color="default"
                    onPress={() => navigate({ pathname: '/billing', search: `?${billingSearch}` })}
                    endContent={<ArrowUpRight className="h-4 w-4" />}
                  >
                    {t('tenantDashboard.actions.viewBilling', { defaultValue: 'View billing' })}
                  </NextButton>
                  <NextButton
                    variant="flat"
                    color="secondary"
                    className="sm:col-span-2"
                    onPress={() => navigate('/api-keys')}
                    endContent={<ArrowUpRight className="h-4 w-4" />}
                  >
                    {t('tenantDashboard.actions.manageApiKeys', { defaultValue: 'Manage API keys' })}
                  </NextButton>
                </div>
                <NextButton
                  variant="bordered"
                  size="sm"
                  className="w-full"
                  onPress={handleRefresh}
                  isDisabled={isRefreshing}
                  startContent={<RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
                >
                  {t('tenantDashboard.actions.refresh', { defaultValue: 'Refresh' })}
                </NextButton>
              </CardBody>
            </Card>
          </AnimatedContent>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <AnimatedContent distance={12} duration={0.24} className="h-full">
            <Card className="h-full border border-white/40 bg-white/70 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="pb-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('tenantDashboard.cards.totalRequests.title', {
                    defaultValue: 'Total tenant API key requests (selected period)',
                  })}
                </p>
              </CardHeader>
              <CardBody className="pt-0">
                <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  {totalRequests.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.cards.totalRequests.scopePrefix', { defaultValue: 'Scope: current tenant' })}
                  {selectedApiKeyId
                    ? t('tenantDashboard.cards.totalRequests.scopeSingleKey', { defaultValue: ' / single key' })
                    : t('tenantDashboard.cards.totalRequests.scopeAllKeys', { defaultValue: ' / all keys' })}
                </p>
              </CardBody>
            </Card>
          </AnimatedContent>

          <AnimatedContent distance={16} duration={0.26} className="h-full">
            <Card className="h-full border border-white/40 bg-white/70 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="pb-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('tenantDashboard.cards.activeKeys.title', {
                    defaultValue: 'Active API key count (selected period)',
                  })}
                </p>
              </CardHeader>
              <CardBody className="pt-0">
                <p className="flex items-center gap-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  <KeyRound className="h-5 w-5 text-cyan-500" />
                  {activeKeyCount.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.cards.activeKeys.description', {
                    defaultValue: 'Note: only keys with requests are counted',
                  })}
                </p>
              </CardBody>
            </Card>
          </AnimatedContent>

          <AnimatedContent distance={20} duration={0.28} className="h-full">
            <Card className="h-full border border-white/40 bg-white/70 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="pb-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('tenantDashboard.cards.availableKeys.title', { defaultValue: 'Currently available API keys' })}
                </p>
              </CardHeader>
              <CardBody className="pt-0">
                <p className="flex items-center gap-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  {enabledKeyCount.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.cards.availableKeys.description', {
                    defaultValue: 'Based on tenant key management settings',
                  })}
                </p>
                <Progress
                  className="mt-3"
                  aria-label={t('tenantDashboard.cards.keyEnableRate.title', { defaultValue: 'Enabled key ratio' })}
                  color="success"
                  value={enabledKeyRate}
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.cards.keyEnableRate.description', {
                    defaultValue: 'Enabled ratio: {{rate}}% ({{enabled}} / {{total}} keys)',
                    rate: enabledKeyRate,
                    enabled: enabledKeyCount,
                    total: totalKeyCount,
                  })}
                </p>
              </CardBody>
            </Card>
          </AnimatedContent>

          <AnimatedContent distance={24} duration={0.3} className="h-full">
            <Card className="h-full border border-white/40 bg-white/70 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="pb-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('tenantDashboard.cards.requestVelocity.title', { defaultValue: 'Request velocity (per hour)' })}
                </p>
              </CardHeader>
              <CardBody className="pt-0">
                <p className="flex items-center gap-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  <Gauge className="h-5 w-5 text-amber-500" />
                  {requestVelocity.toFixed(1)}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.cards.requestVelocity.description', {
                    defaultValue: 'Average requests per hour in selected range',
                  })}
                </p>
                <Divider className="my-3" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('tenantDashboard.cards.peakHour.title', { defaultValue: 'Peak hour' })}
                </p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{peakHourText}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {peakHourPoint?.requests?.toLocaleString()
                    ?? t('tenantDashboard.cards.peakHour.description', { defaultValue: 'Highest request volume window' })}
                </p>
              </CardBody>
            </Card>
          </AnimatedContent>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[1.7fr_1fr]">
          <FadeContent duration={280} className="h-full">
            <Card className="h-full border border-white/40 bg-white/72 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t('tenantDashboard.trend.title', { defaultValue: 'Request trend' })}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {t('tenantDashboard.trend.description', {
                      defaultValue: 'Scope: tenant API key request volume (hourly granularity)',
                    })}
                  </p>
                </div>
              </CardHeader>
              <CardBody>
                {isFetchingTrends && chartData.length === 0 ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-48 rounded-xl" />
                    <Skeleton className="h-[280px] w-full rounded-xl" />
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 text-sm text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
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
              </CardBody>
            </Card>
          </FadeContent>

          <AnimatedContent distance={20} duration={0.3} className="h-full">
            <Card className="h-full border border-white/40 bg-white/72 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/55">
              <CardHeader className="flex flex-col items-start gap-1">
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('tenantDashboard.topKeys.title', { defaultValue: 'Top API keys' })}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('tenantDashboard.topKeys.description', {
                    defaultValue: 'Based on request volume in selected period',
                  })}
                </p>
              </CardHeader>
              <CardBody className="space-y-3">
                {isFetchingTopApiKeys && topKeyRows.length === 0 ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={`skeleton-${index}`} className="space-y-2 rounded-xl border border-white/40 p-3 dark:border-slate-700/60">
                      <Skeleton className="h-4 w-2/3 rounded-md" />
                      <Skeleton className="h-2.5 w-full rounded-full" />
                    </div>
                  ))
                ) : topKeyRows.length === 0 ? (
                  <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 text-sm text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
                    {t('tenantDashboard.topKeys.empty', { defaultValue: 'No API key usage rankings yet' })}
                  </div>
                ) : (
                  topKeyRows.map((item) => (
                    <div key={`${item.id}-${item.rank}`} className="rounded-xl border border-white/40 bg-white/55 p-3 dark:border-slate-700/60 dark:bg-slate-900/40">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.rank}. {item.name}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {item.keyPrefix}
                          </p>
                        </div>
                        <Chip color="primary" variant="flat" size="sm">
                          {t('tenantDashboard.topKeys.requests', {
                            count: item.requests,
                          })}
                        </Chip>
                      </div>
                      <Progress aria-label={`${item.name} share`} value={item.share} color="primary" size="sm" />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {t('tenantDashboard.topKeys.share', {
                          defaultValue: 'Share {{percent}}%',
                          percent: item.share,
                        })}
                      </p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </AnimatedContent>
        </div>
      </div>
    </div>
  )
}
