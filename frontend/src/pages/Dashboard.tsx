import { useEffect, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Activity, Key, RefreshCcw, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { adminKeysApi } from '@/api/adminKeys'
import { adminTenantsApi } from '@/api/adminTenants'
import { dashboardApi } from '@/api/dashboard'
import { usageApi } from '@/api/usage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import { TrendChart } from '@/components/ui/trend-chart'
import { cn } from '@/lib/utils'

type AlertSeverity = 'critical' | 'warning' | 'info'
type AlertStatus = 'open' | 'resolved'
type DashboardScope = 'global' | 'tenant' | 'api_key'
type RangePreset = 1 | 7 | 30

interface AlertRow {
  id: string
  severity: AlertSeverity
  source: 'data_plane' | 'usage_repo'
  status: AlertStatus
  message: string
  actionLabel: string
  happenedAt: string
}

interface DashboardTopKeyRow {
  apiKeyId: string
  tenantId: string
  requests: number
}

interface StoredDashboardFilters {
  scope: DashboardScope
  rangePreset: RangePreset
  tenantId: string
  apiKeyId: string
}

const DASHBOARD_FILTERS_STORAGE_KEY = 'cp:admin-dashboard-filters:v1'

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
}

function nowRangeByDays(days: number) {
  const end = Math.floor(Date.now() / 1000)
  const start = end - days * 24 * 60 * 60
  return { startTs: start, endTs: end }
}

function loadStoredFilters(): StoredDashboardFilters {
  if (typeof window === 'undefined') {
    return {
      scope: 'global',
      rangePreset: 1,
      tenantId: '',
      apiKeyId: '',
    }
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_FILTERS_STORAGE_KEY)
    if (!raw) {
      return {
        scope: 'global',
        rangePreset: 1,
        tenantId: '',
        apiKeyId: '',
      }
    }
    const parsed = JSON.parse(raw) as Partial<StoredDashboardFilters>
    return {
      scope: parsed.scope ?? 'global',
      rangePreset: parsed.rangePreset ?? 1,
      tenantId: parsed.tenantId ?? '',
      apiKeyId: parsed.apiKeyId ?? '',
    }
  } catch {
    return {
      scope: 'global',
      rangePreset: 1,
      tenantId: '',
      apiKeyId: '',
    }
  }
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [scope, setScope] = useState<DashboardScope>(() => loadStoredFilters().scope)
  const [rangePreset, setRangePreset] = useState<RangePreset>(() => loadStoredFilters().rangePreset)
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => loadStoredFilters().tenantId)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>(() => loadStoredFilters().apiKeyId)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const payload: StoredDashboardFilters = {
      scope,
      rangePreset,
      tenantId: selectedTenantId,
      apiKeyId: selectedApiKeyId,
    }
    window.localStorage.setItem(DASHBOARD_FILTERS_STORAGE_KEY, JSON.stringify(payload))
  }, [scope, rangePreset, selectedTenantId, selectedApiKeyId])

  const { startTs, endTs } = useMemo(() => nowRangeByDays(rangePreset), [rangePreset])
  const scopeLabel = (currentScope: DashboardScope) => {
    if (currentScope === 'global') {
      return t('dashboard.scope.global', { defaultValue: 'Global View' })
    }
    if (currentScope === 'tenant') {
      return t('dashboard.scope.tenant', { defaultValue: 'Tenant View' })
    }
    return t('dashboard.scope.apiKey', { defaultValue: 'API Key View' })
  }

  const { data: tenants = [] } = useQuery({
    queryKey: ['adminDashboardTenants'],
    queryFn: () => adminTenantsApi.listTenants(),
    staleTime: 60_000,
  })

  const { data: adminApiKeys = [] } = useQuery({
    queryKey: ['adminDashboardApiKeys'],
    queryFn: () => adminKeysApi.list(),
    staleTime: 60_000,
  })

  const effectiveTenantId = useMemo(() => {
    if (scope === 'global') return ''
    if (selectedTenantId) return selectedTenantId
    return tenants[0]?.id ?? ''
  }, [scope, selectedTenantId, tenants])

  const filteredApiKeys = useMemo(() => {
    if (!effectiveTenantId) return adminApiKeys
    return adminApiKeys.filter((key) => key.tenant_id === effectiveTenantId)
  }, [adminApiKeys, effectiveTenantId])

  const effectiveApiKeyId = useMemo(() => {
    if (scope !== 'api_key') return ''
    if (selectedApiKeyId && filteredApiKeys.some((item) => item.id === selectedApiKeyId)) {
      return selectedApiKeyId
    }
    return filteredApiKeys[0]?.id ?? ''
  }, [filteredApiKeys, scope, selectedApiKeyId])

  const usageQueryParams = useMemo(() => {
    const params: {
      start_ts: number
      end_ts: number
      limit: number
      tenant_id?: string
      api_key_id?: string
    } = {
      start_ts: startTs,
      end_ts: endTs,
      limit: Math.max(24, rangePreset * 24),
    }
    if (scope === 'tenant' && effectiveTenantId) {
      params.tenant_id = effectiveTenantId
    }
    if (scope === 'api_key') {
      if (effectiveTenantId) {
        params.tenant_id = effectiveTenantId
      }
      if (effectiveApiKeyId) {
        params.api_key_id = effectiveApiKeyId
      }
    }
    return params
  }, [effectiveApiKeyId, effectiveTenantId, endTs, rangePreset, scope, startTs])

  const {
    data: systemState,
    isLoading: isLoadingSystem,
    refetch: refetchSystem,
    isFetching: isRefetchingSystem,
  } = useQuery({
    queryKey: ['adminSystemState'],
    queryFn: dashboardApi.getSystemState,
    refetchInterval: 30_000,
  })

  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    refetch: refetchSummary,
    isFetching: isRefetchingSummary,
  } = useQuery({
    queryKey: ['usageSummary', usageQueryParams],
    queryFn: () => dashboardApi.getUsageSummary(usageQueryParams),
    refetchInterval: 30_000,
  })

  const {
    data: trendData,
    isLoading: isLoadingTrends,
    refetch: refetchTrends,
    isFetching: isRefetchingTrends,
  } = useQuery({
    queryKey: ['hourlyTrends', usageQueryParams],
    queryFn: () => dashboardApi.getHourlyTrends(usageQueryParams),
    refetchInterval: 60_000,
  })

  const { data: leaderboardData, isLoading: isLoadingLeaderboard } = useQuery({
    queryKey: ['dashboardLeaderboard', usageQueryParams],
    queryFn: () =>
      usageApi.getLeaderboard({
        start_ts: usageQueryParams.start_ts,
        end_ts: usageQueryParams.end_ts,
        limit: 12,
        tenant_id: usageQueryParams.tenant_id,
        api_key_id: usageQueryParams.api_key_id,
      }),
    refetchInterval: 60_000,
  })

  const isRefreshing = isRefetchingSystem || isRefetchingSummary || isRefetchingTrends
  const isLoading = isLoadingSystem || isLoadingSummary || isLoadingTrends

  const handleRefresh = () => {
    refetchSystem()
    refetchSummary()
    refetchTrends()
  }

  const logsSearch = useMemo(() => {
    const params = new URLSearchParams()
    params.set('tab', 'request')
    params.set('range', String(rangePreset))
    if (scope !== 'global' && effectiveTenantId) {
      params.set('tenant_id', effectiveTenantId)
    }
    if (scope === 'api_key' && effectiveApiKeyId) {
      params.set('api_key_id', effectiveApiKeyId)
    }
    return params.toString()
  }, [effectiveApiKeyId, effectiveTenantId, rangePreset, scope])

  const billingSearch = useMemo(() => {
    const params = new URLSearchParams()
    params.set('granularity', rangePreset === 30 ? 'month' : 'day')
    if (effectiveTenantId) {
      params.set('tenant_id', effectiveTenantId)
    }
    return params.toString()
  }, [effectiveTenantId, rangePreset])

  const shortTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [i18n.resolvedLanguage],
  )

  const detailedDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    [i18n.resolvedLanguage],
  )

  const chartData = useMemo(() => {
    const map = new Map<number, { timestamp: number; accountRequests: number; tenantApiKeyRequests: number }>()
    for (const row of trendData?.account_totals ?? []) {
      map.set(row.hour_start, {
        timestamp: row.hour_start * 1000,
        accountRequests: row.request_count,
        tenantApiKeyRequests: 0,
      })
    }
    for (const row of trendData?.tenant_api_key_totals ?? []) {
      const existing = map.get(row.hour_start)
      if (existing) {
        existing.tenantApiKeyRequests = row.request_count
      } else {
        map.set(row.hour_start, {
          timestamp: row.hour_start * 1000,
          accountRequests: 0,
          tenantApiKeyRequests: row.request_count,
        })
      }
    }
    return Array.from(map.values()).sort((left, right) => left.timestamp - right.timestamp)
  }, [trendData?.account_totals, trendData?.tenant_api_key_totals])

  const requestMetricLabel =
    scope === 'global'
      ? t('dashboard.kpi.requests.global', { defaultValue: 'Total account requests (selected range)' })
      : scope === 'tenant'
        ? t('dashboard.kpi.requests.tenant', { defaultValue: 'Current tenant API key requests (selected range)' })
        : t('dashboard.kpi.requests.apiKey', { defaultValue: 'Current API key requests (selected range)' })

  const requestMetricValue =
    scope === 'global'
      ? summaryData?.account_total_requests ?? 0
      : summaryData?.tenant_api_key_total_requests ?? 0

  const metrics = [
    {
      title: requestMetricLabel,
      value: requestMetricValue.toLocaleString(),
      change: `${scopeLabel(scope)} / ${rangePreset === 1 ? '24h' : `${rangePreset}d`}`,
      icon: Zap,
    },
    {
      title: t('dashboard.kpi.activeApiKeysInRange', { defaultValue: 'Active API keys (selected range)' }),
      value: (summaryData?.unique_tenant_api_key_count ?? 0).toLocaleString(),
      change: scope === 'global' ? t('dashboard.kpi.globalScope', { defaultValue: 'Global scope' }) : scopeLabel(scope),
      icon: Activity,
    },
    {
      title: t('dashboard.kpi.uptime'),
      value: systemState ? `${Math.floor(systemState.uptime_sec / 3600)}h` : '0h',
      change: t('dashboard.kpi.running'),
      icon: RefreshCcw,
    },
    {
      title: t('nav.apiKeys'),
      value: systemState?.counts.api_keys?.toLocaleString() || '0',
      change: t('dashboard.kpi.totalConfigured'),
      icon: Key,
    },
  ]

  const alerts = useMemo<AlertRow[]>(() => {
    if (!systemState) {
      return []
    }

    const rows: AlertRow[] = []

    if (systemState.data_plane_error) {
      rows.push({
        id: 'data_plane_error',
        severity: 'critical',
        source: 'data_plane',
        status: 'open',
        message: systemState.data_plane_error,
        actionLabel: t('dashboard.alerts.checkRoutes'),
        happenedAt: systemState.generated_at,
      })
    }

    if (!systemState.usage_repo_available) {
      rows.push({
        id: 'usage_repo_unavailable',
        severity: 'warning',
        source: 'usage_repo',
        status: 'open',
        message: t('dashboard.alerts.usageRepoUnavailable'),
        actionLabel: t('dashboard.alerts.resolve'),
        happenedAt: systemState.generated_at,
      })
    }

    return rows
  }, [systemState, t])

  const openAlertCount = alerts.filter((item) => item.status === 'open').length

  const alertColumns = useMemo<ColumnDef<AlertRow>[]>(() => {
    return [
      {
        id: 'severity',
        header: t('dashboard.alerts.columns.severity'),
        accessorFn: (row) => row.severity,
        cell: ({ row }) => {
          const severity = row.original.severity
          const variant =
            severity === 'critical' ? 'destructive' : severity === 'warning' ? 'warning' : 'secondary'
          return (
            <Badge variant={variant} className="uppercase text-[10px]">
              {t(`dashboard.alerts.severity.${severity}`)}
            </Badge>
          )
        },
      },
      {
        id: 'source',
        header: t('dashboard.alerts.columns.source'),
        accessorFn: (row) => row.source,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {t(`dashboard.alerts.source.${row.original.source}`)}
          </span>
        ),
      },
      {
        id: 'message',
        header: t('dashboard.alerts.columns.message'),
        accessorFn: (row) => row.message.toLowerCase(),
        cell: ({ row }) => <span className="text-sm leading-6">{row.original.message}</span>,
      },
      {
        id: 'status',
        header: t('dashboard.alerts.columns.status'),
        accessorFn: (row) => row.status,
        cell: ({ row }) => {
          const status = row.original.status
          const variant = status === 'open' ? 'warning' : 'success'
          return <Badge variant={variant}>{t(`dashboard.alerts.status.${status}`)}</Badge>
        },
      },
      {
        id: 'happenedAt',
        header: t('dashboard.alerts.columns.time'),
        accessorFn: (row) => new Date(row.happenedAt).getTime(),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {detailedDateTimeFormatter.format(new Date(row.original.happenedAt))}
          </span>
        ),
      },
      {
        id: 'action',
        header: t('dashboard.alerts.columns.action'),
        accessorFn: (row) => row.actionLabel.toLowerCase(),
        cell: ({ row }) => <span className="text-xs text-primary">{row.original.actionLabel}</span>,
      },
    ]
  }, [detailedDateTimeFormatter, t])

  const topKeyRows = useMemo<DashboardTopKeyRow[]>(
    () =>
      (leaderboardData?.api_keys ?? []).map((item) => ({
        apiKeyId: item.api_key_id,
        tenantId: item.tenant_id,
        requests: item.total_requests,
      })),
    [leaderboardData?.api_keys],
  )

  const topKeyColumns = useMemo<ColumnDef<DashboardTopKeyRow>[]>(
    () => [
      {
        id: 'apiKeyId',
        header: t('dashboard.table.apiKey', { defaultValue: 'API Key' }),
        accessorFn: (row) => row.apiKeyId.toLowerCase(),
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.apiKeyId}</div>
            <div className="text-xs text-muted-foreground">{row.original.tenantId}</div>
          </div>
        ),
      },
      {
        id: 'requests',
        header: t('dashboard.table.requests', { defaultValue: 'Requests' }),
        accessorKey: 'requests',
        cell: ({ row }) => <span className="font-mono">{row.original.requests.toLocaleString()}</span>,
      },
    ],
    [t],
  )

  const tenantSelectValue = effectiveTenantId || '__none__'
  const apiKeySelectValue = effectiveApiKeyId || '__none__'

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full overflow-y-auto">
      <motion.div className="space-y-8" initial="hidden" animate="show" variants={containerVariants}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <motion.div variants={itemVariants}>
            <h2 className="text-3xl font-semibold tracking-tight">{t('dashboard.title')}</h2>
            <p className="text-muted-foreground mt-1">
              {t('dashboard.subtitle')} ·{' '}
              {t('dashboard.currentScope', { defaultValue: 'Current: {{scope}}', scope: scopeLabel(scope) })}
            </p>
          </motion.div>
          <motion.div variants={itemVariants} className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ pathname: '/logs', search: `?${logsSearch}` })}
            >
              {t('dashboard.actions.viewLogs', { defaultValue: 'View request logs' })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ pathname: '/billing', search: `?${billingSearch}` })}
            >
              {t('dashboard.actions.viewBilling', { defaultValue: 'View billing' })}
            </Button>
            <Select value={scope} onValueChange={(value) => setScope(value as DashboardScope)}>
              <SelectTrigger className="w-[160px]" aria-label={t('dashboard.filters.scopeAriaLabel', { defaultValue: 'Scope' })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">{scopeLabel('global')}</SelectItem>
                <SelectItem value="tenant">{scopeLabel('tenant')}</SelectItem>
                <SelectItem value="api_key">{scopeLabel('api_key')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(rangePreset)}
              onValueChange={(value) => setRangePreset(Number(value) as RangePreset)}
            >
              <SelectTrigger className="w-[170px]" aria-label={t('dashboard.filters.rangeAriaLabel', { defaultValue: 'Time range' })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('dashboard.filters.range.last24Hours', { defaultValue: 'Last 24 hours' })}</SelectItem>
                <SelectItem value="7">{t('dashboard.filters.range.last7Days', { defaultValue: 'Last 7 days' })}</SelectItem>
                <SelectItem value="30">{t('dashboard.filters.range.last30Days', { defaultValue: 'Last 30 days' })}</SelectItem>
              </SelectContent>
            </Select>
            {scope !== 'global' ? (
              <Select
                value={tenantSelectValue}
                onValueChange={(value) => {
                  setSelectedTenantId(value === '__none__' ? '' : value)
                  setSelectedApiKeyId('')
                }}
              >
                <SelectTrigger className="min-w-[220px]" aria-label={t('dashboard.filters.tenantAriaLabel', { defaultValue: 'Tenant' })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t('dashboard.filters.tenantPlaceholder', { defaultValue: 'Select tenant' })}
                  </SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {scope === 'api_key' ? (
              <Select
                value={apiKeySelectValue}
                onValueChange={(value) => setSelectedApiKeyId(value === '__none__' ? '' : value)}
              >
                <SelectTrigger className="min-w-[220px]" aria-label={t('dashboard.filters.apiKeyAriaLabel', { defaultValue: 'API key' })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t('dashboard.filters.apiKeyPlaceholder', { defaultValue: 'Select API key' })}
                  </SelectItem>
                  {filteredApiKeys.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.key_prefix})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="group transition-colors">
              <RefreshCcw
                className={cn(
                  'mr-2 h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors',
                  isRefreshing && 'animate-spin text-primary',
                )}
              />
              {t('common.refresh')}
            </Button>
          </motion.div>
        </div>

        <motion.div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" variants={containerVariants}>
          {metrics.map((m, i) => (
            <motion.div key={i} variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
              <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow duration-300">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{m.title}</CardTitle>
                  <div className="p-2 bg-primary/5 rounded-md">
                    <m.icon className="h-4 w-4 text-primary/70" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-sans tracking-tight">
                    {isLoading ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : m.value}
                  </div>
                  {!isLoading ? <p className="text-xs text-muted-foreground mt-1">{m.change}</p> : null}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="shadow-sm border-border/50">
            <CardContent className="pt-5 text-xs text-muted-foreground">
              {t('dashboard.scopeNotes', {
                defaultValue:
                  'Scope note: account requests are counted by upstream account; tenant API key requests are counted by tenant + API key. Requests not bound to tenant/API key are counted only in account scope.',
              })}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-7">
          <motion.div className="col-span-4 lg:col-span-5" variants={itemVariants}>
            <Card className="h-full shadow-sm border-border/50">
              <CardHeader>
                <CardTitle>{t('dashboard.trafficChart.title')}</CardTitle>
                <CardDescription>
                  {scope === 'global'
                    ? t('dashboard.trafficChart.scope.global', {
                        defaultValue: 'Scope: global account requests + global tenant API key requests',
                      })
                    : scope === 'tenant'
                      ? t('dashboard.trafficChart.scope.tenant', { defaultValue: 'Scope: current tenant API key requests' })
                      : t('dashboard.trafficChart.scope.apiKey', { defaultValue: 'Scope: current API key requests' })}
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-0">
                {isLoading ? (
                  <div className="w-full h-[350px] bg-muted/50 animate-pulse rounded-md ml-6" />
                ) : (
                  <TrendChart
                    data={chartData}
                    lines={
                      scope === 'global'
                        ? [
                            {
                              dataKey: 'accountRequests',
                              name: t('dashboard.trafficChart.series.accountRequests', { defaultValue: 'Account requests' }),
                              stroke: 'var(--chart-1)',
                            },
                            {
                              dataKey: 'tenantApiKeyRequests',
                              name: t('dashboard.trafficChart.series.tenantApiKeyRequests', {
                                defaultValue: 'Tenant API key requests',
                              }),
                              stroke: 'var(--chart-5)',
                            },
                          ]
                        : [
                            {
                              dataKey: 'tenantApiKeyRequests',
                              name: t('dashboard.trafficChart.series.tenantApiKeyRequestsSingle', {
                                defaultValue: 'Tenant API key requests',
                              }),
                              stroke: 'var(--chart-1)',
                            },
                          ]
                    }
                    xAxisFormatter={(val) => shortTimeFormatter.format(new Date(Number(val)))}
                    height={350}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div className="col-span-3 lg:col-span-2" variants={itemVariants}>
            <Card className="h-full shadow-sm border-border/50 flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t('dashboard.alerts.title')}
                  {openAlertCount > 0 && (
                    <Badge variant="destructive" className="ml-auto rounded-full px-2">
                      {openAlertCount}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{t('dashboard.alerts.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px] min-h-0">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="h-9 rounded bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <StandardDataTable
                    columns={alertColumns}
                    data={alerts}
                    density="compact"
                    defaultPageSize={6}
                    pageSizeOptions={[6, 12, 24, 48]}
                    className="h-full"
                    emptyText={t('dashboard.alerts.empty')}
                    searchPlaceholder={t('dashboard.alerts.searchPlaceholder')}
                    searchFn={(row, keyword) =>
                      `${row.message} ${row.source} ${row.severity} ${row.status}`
                        .toLowerCase()
                        .includes(keyword)
                    }
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
            <Card className="shadow-sm border-border/50">
              <CardHeader>
                <CardTitle>{t('dashboard.topApiKeys.title', { defaultValue: 'Top API Keys' })}</CardTitle>
                <CardDescription>
                  {t('dashboard.topApiKeys.scopeDescription', {
                    defaultValue: 'Scope: {{scope}} / selected time window',
                    scope: scopeLabel(scope),
                  })}
                </CardDescription>
              </CardHeader>
            <CardContent>
              {isLoadingLeaderboard ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-8 bg-muted rounded" />
                  ))}
                </div>
              ) : (
                <StandardDataTable
                  columns={topKeyColumns}
                  data={topKeyRows}
                  density="compact"
                  defaultPageSize={8}
                  pageSizeOptions={[8, 16, 32]}
                  emptyText={t('dashboard.topApiKeys.empty', { defaultValue: 'No ranking data yet' })}
                />
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
