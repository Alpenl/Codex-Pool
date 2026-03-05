import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { motion } from 'framer-motion'
import { AlertTriangle, Download, Info } from 'lucide-react'
import { format } from 'date-fns'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { adminTenantsApi } from '@/api/adminTenants'
import { auditLogsApi, type AuditLogItem } from '@/api/auditLogs'
import { localizeRequestLogErrorDisplay } from '@/api/errorI18n'
import { logsApi, type SystemLogEntry } from '@/api/logs'
import { requestLogsApi, type RequestAuditLogItem } from '@/api/requestLogs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import {
  LogsFilterGrid,
  LogsFilterInput,
  LogsFilterSelect,
} from '@/features/logs/filter-controls'
import { cn } from '@/lib/utils'

type LogLevelFilter = 'all' | 'error' | 'warn' | 'info'
type RangePreset = 1 | 7 | 30

function normalizeAuditValue(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

function currentRangeByDays(days: number) {
  const endTs = Math.floor(Date.now() / 1000)
  const startTs = endTs - days * 24 * 60 * 60
  return { start_ts: startTs, end_ts: endTs }
}

function normalizeLogLevel(level: string): Exclude<LogLevelFilter, 'all'> {
  const normalized = level.trim().toUpperCase()
  if (normalized === 'ERROR') return 'error'
  if (normalized === 'WARN' || normalized === 'WARNING') return 'warn'
  return 'info'
}

function localizeLogAction(action: string, t: TFunction): string {
  if (action === 'admin.system.state') return t('logs.actions.systemState')
  if (action === 'admin.config.update') return t('logs.actions.configUpdate')
  if (action === 'admin.proxies.test') return t('logs.actions.proxiesTest')
  if (action === 'admin.keys.create') return t('logs.actions.keyCreate')
  if (action === 'admin.keys.patch') return t('logs.actions.keyPatch')
  if (action === 'admin.models.list') return t('logs.actions.modelsList')
  if (action === 'admin.models.probe') return t('logs.actions.modelsProbe')
  return t('logs.actions.unknown', { action })
}

function localizeLogMessage(action: string, message: string, t: TFunction): string {
  const normalizedMessage = message.trim()
  if (!normalizedMessage) {
    return t('logs.messages.empty')
  }
  if (action === 'admin.system.state') {
    const matched = normalizedMessage.match(/queried system state:\s*(\d+)\s+accounts/i)
    if (matched) {
      return t('logs.messages.systemState', { count: Number(matched[1]) })
    }
  }
  if (
    action === 'admin.config.update'
    && normalizedMessage.toLowerCase() === 'updated runtime config snapshot in-memory'
  ) {
    return t('logs.messages.configUpdated')
  }
  if (action === 'admin.proxies.test') {
    const matched = normalizedMessage.match(/tested\s*(\d+)\s+proxy nodes/i)
    if (matched) {
      return t('logs.messages.proxiesTested', { count: Number(matched[1]) })
    }
  }
  if (action === 'admin.keys.create') {
    const matched = normalizedMessage.match(/created api key\s+([a-f0-9-]+)/i)
    if (matched) {
      return t('logs.messages.keyCreated', { keyId: matched[1] })
    }
  }
  if (action === 'admin.keys.patch') {
    const matched = normalizedMessage.match(/set api key\s+([a-f0-9-]+)\s+enabled=(true|false)/i)
    if (matched) {
      return t('logs.messages.keyPatched', {
        keyId: matched[1],
        enabled: matched[2] === 'true' ? t('common.yes') : t('common.no'),
      })
    }
  }
  if (action === 'admin.models.list') {
    const matched = normalizedMessage.match(/loaded models from upstream account\s+(.+)/i)
    if (matched) {
      return t('logs.messages.modelsLoaded', { label: matched[1] })
    }
  }
  if (action === 'admin.models.probe') {
    const matched = normalizedMessage.match(
      /model probe \(([^)]+)\) tested\s*(\d+)\s+models via account\s+(.+)\s+\(available=(\d+),\s*unavailable=(\d+)\)/i,
    )
    if (matched) {
      return t('logs.messages.modelsProbed', {
        trigger: matched[1],
        tested: Number(matched[2]),
        label: matched[3],
        available: Number(matched[4]),
        unavailable: Number(matched[5]),
      })
    }
  }
  return t('logs.messages.unmappedAction', {
    action: localizeLogAction(action, t),
    message: normalizedMessage,
  })
}

function levelLabel(level: string, t: TFunction) {
  const normalized = normalizeLogLevel(level)
  if (normalized === 'error') return t('logs.levels.error')
  if (normalized === 'warn') return t('logs.levels.warn')
  return t('logs.levels.info')
}

function levelIcon(level: string) {
  const normalized = normalizeLogLevel(level)
  if (normalized === 'error') {
    return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
  }
  if (normalized === 'warn') {
    return <AlertTriangle className="h-3.5 w-3.5 text-warning" />
  }
  return <Info className="h-3.5 w-3.5 text-info" />
}

function parseRangePreset(raw: string | null): RangePreset {
  if (raw === '7') return 7
  if (raw === '30') return 30
  return 1
}

function localizeAuditActorType(actorType: string | undefined, t: TFunction): string {
  switch (normalizeAuditValue(actorType)) {
    case 'admin_user':
      return t('logs.audit.actorTypes.adminUser', { defaultValue: 'Admin user' })
    case 'tenant_user':
      return t('logs.audit.actorTypes.tenantUser', { defaultValue: 'Tenant user' })
    case 'api_key':
      return t('logs.audit.actorTypes.apiKey', { defaultValue: 'API key' })
    case 'system':
      return t('logs.audit.actorTypes.system', { defaultValue: 'System' })
    default:
      return t('logs.audit.actorTypes.unknown', { defaultValue: 'Unknown actor' })
  }
}

function localizeAuditResultStatus(resultStatus: string | undefined, t: TFunction): string {
  switch (normalizeAuditValue(resultStatus)) {
    case 'ok':
      return t('logs.audit.resultStatuses.ok', { defaultValue: 'Success' })
    case 'failed':
    case 'error':
      return t('logs.audit.resultStatuses.failed', { defaultValue: 'Failed' })
    case 'denied':
      return t('logs.audit.resultStatuses.denied', { defaultValue: 'Denied' })
    default:
      return t('logs.audit.resultStatuses.unknown', { defaultValue: 'Unknown result' })
  }
}

function localizeAuditAction(action: string | undefined, t: TFunction): string {
  const normalized = normalizeAuditValue(action)
  if (!normalized) {
    return t('logs.audit.actionValues.unknown', { defaultValue: 'Unknown action' })
  }

  switch (normalized) {
    case 'admin.system.state':
      return t('logs.actions.systemState', { defaultValue: 'System state query' })
    case 'admin.config.update':
      return t('logs.actions.configUpdate', { defaultValue: 'Config update' })
    case 'admin.proxies.test':
      return t('logs.actions.proxiesTest', { defaultValue: 'Proxy health check' })
    case 'admin.keys.create':
      return t('logs.actions.keyCreate', { defaultValue: 'Create API key' })
    case 'admin.keys.patch':
      return t('logs.actions.keyPatch', { defaultValue: 'Update API key' })
    case 'admin.models.list':
      return t('logs.actions.modelsList', { defaultValue: 'Fetch model list' })
    case 'admin.models.probe':
      return t('logs.actions.modelsProbe', { defaultValue: 'Model probe' })
    default:
      break
  }

  if (normalized.startsWith('admin.')) {
    return t('logs.audit.actionValues.adminOperation', { defaultValue: 'Admin operation' })
  }
  if (normalized.startsWith('tenant.')) {
    return t('logs.audit.actionValues.tenantOperation', { defaultValue: 'Tenant operation' })
  }
  if (normalized.startsWith('auth.')) {
    return t('logs.audit.actionValues.authOperation', { defaultValue: 'Auth operation' })
  }
  if (normalized.startsWith('request.')) {
    return t('logs.audit.actionValues.requestOperation', { defaultValue: 'Request operation' })
  }
  return t('logs.audit.actionValues.unknown', { defaultValue: 'Unknown action' })
}

export default function Logs() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all')
  const [tab, setTab] = useState<'request' | 'system' | 'audit'>(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'request' || tabParam === 'system' || tabParam === 'audit'
      ? tabParam
      : 'system'
  })
  const [rangePreset, setRangePreset] = useState<RangePreset>(() =>
    parseRangePreset(searchParams.get('range')),
  )
  const [selectedTenantId, setSelectedTenantId] = useState(
    () => searchParams.get('tenant_id') || 'all',
  )
  const [apiKeyId, setApiKeyId] = useState(
    () => searchParams.get('api_key_id') || '',
  )
  const [statusCode, setStatusCode] = useState(
    () => searchParams.get('status_code') || '',
  )
  const [requestId, setRequestId] = useState(
    () => searchParams.get('request_id') || '',
  )
  const [keyword, setKeyword] = useState(() => searchParams.get('keyword') || '')
  const [auditActorType, setAuditActorType] = useState(
    () => searchParams.get('actor_type') || '',
  )
  const [auditActorId, setAuditActorId] = useState(
    () => searchParams.get('actor_id') || '',
  )
  const [auditAction, setAuditAction] = useState(
    () => searchParams.get('action') || '',
  )
  const [auditResultStatus, setAuditResultStatus] = useState(
    () => searchParams.get('result_status') || '',
  )
  const [auditKeyword, setAuditKeyword] = useState(
    () => searchParams.get('audit_keyword') || '',
  )

  const { data: tenants = [] } = useQuery({
    queryKey: ['adminTenants', 'logs'],
    queryFn: () => adminTenantsApi.listTenants(),
    staleTime: 60_000,
  })

  const effectiveTenantId = selectedTenantId === 'all' ? undefined : selectedTenantId
  const parsedStatusCode = Number(statusCode)
  const hasStatusCode = Number.isInteger(parsedStatusCode) && parsedStatusCode > 0

  const requestQueryParams = useMemo(() => {
    const range = currentRangeByDays(rangePreset)
    return {
      ...range,
      limit: 200,
      tenant_id: effectiveTenantId,
      api_key_id: apiKeyId.trim() || undefined,
      status_code: hasStatusCode ? parsedStatusCode : undefined,
      request_id: requestId.trim() || undefined,
      keyword: keyword.trim() || undefined,
    }
  }, [apiKeyId, effectiveTenantId, hasStatusCode, keyword, parsedStatusCode, rangePreset, requestId])

  const { data: requestLedger } = useQuery({
    queryKey: ['adminRequestLogs', requestQueryParams],
    queryFn: () => requestLogsApi.adminList(requestQueryParams),
    enabled: tab === 'request',
    staleTime: 30_000,
    refetchInterval: tab === 'request' ? 30_000 : false,
  })

  const auditQueryParams = useMemo(() => {
    const range = currentRangeByDays(rangePreset)
    return {
      ...range,
      limit: 200,
      tenant_id: effectiveTenantId,
      actor_type: auditActorType.trim() || undefined,
      actor_id: auditActorId.trim() || undefined,
      action: auditAction.trim() || undefined,
      result_status: auditResultStatus.trim() || undefined,
      keyword: auditKeyword.trim() || undefined,
    }
  }, [
    auditAction,
    auditActorId,
    auditActorType,
    auditKeyword,
    auditResultStatus,
    effectiveTenantId,
    rangePreset,
  ])

  const { data: auditLogs } = useQuery({
    queryKey: ['adminAuditLogs', auditQueryParams],
    queryFn: () => auditLogsApi.adminList(auditQueryParams),
    enabled: tab === 'audit',
    staleTime: 30_000,
    refetchInterval: tab === 'audit' ? 30_000 : false,
  })

  const { data: rawLogs = [], isLoading } = useQuery({
    queryKey: ['systemLogs'],
    queryFn: () => logsApi.getSystemLogs({ limit: 200 }),
    staleTime: 15000,
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible'
        ? 15000
        : false,
    refetchIntervalInBackground: false,
  })

  const filteredLogs = useMemo(() => {
    return rawLogs.filter((log) => {
      return levelFilter === 'all' || normalizeLogLevel(log.level) === levelFilter
    })
  }, [levelFilter, rawLogs])

  const columns = useMemo<ColumnDef<SystemLogEntry>[]>(
    () => [
      {
        id: 'timestamp',
        accessorFn: (row) => new Date(row.ts).getTime(),
        header: t('logs.columns.timestamp'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {format(new Date(row.original.ts), 'HH:mm:ss.SSS')}
          </span>
        ),
      },
      {
        id: 'level',
        accessorFn: (row) => normalizeLogLevel(row.level),
        header: t('logs.columns.level'),
        cell: ({ row }) => {
          const normalized = normalizeLogLevel(row.original.level)
          return (
            <span
              className={cn(
                'flex items-center gap-1.5 font-medium',
                normalized === 'error'
                  ? 'text-destructive'
                  : normalized === 'warn'
                    ? 'text-warning-foreground'
                    : 'text-info-foreground',
              )}
            >
              {levelIcon(row.original.level)}
              {levelLabel(row.original.level, t)}
            </span>
          )
        },
      },
      {
        id: 'service',
        accessorFn: (row) => localizeLogAction(row.action, t).toLowerCase(),
        header: t('logs.columns.service'),
        cell: ({ row }) => (
          <span className="block max-w-[280px] truncate text-sm text-muted-foreground" title={row.original.action}>
            {localizeLogAction(row.original.action, t)}
          </span>
        ),
      },
      {
        id: 'message',
        accessorFn: (row) => localizeLogMessage(row.action, row.message || '', t).toLowerCase(),
        header: t('logs.columns.message'),
        cell: ({ row }) => (
          <span className="block min-w-[320px] break-words text-sm">
            {localizeLogMessage(row.original.action, row.original.message || '', t)}
          </span>
        ),
      },
    ],
    [t],
  )

  const handleExport = () => {
    const payload = filteredLogs.map((item) => ({
      ts: item.ts,
      level: item.level,
      action: item.action,
      action_localized: localizeLogAction(item.action, t),
      message: item.message,
      message_localized: localizeLogMessage(item.action, item.message || '', t),
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `system-logs-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const requestColumns = useMemo<ColumnDef<RequestAuditLogItem>[]>(
    () => [
      {
        id: 'createdAt',
        header: t('logs.request.columns.createdAt', { defaultValue: 'Time' }),
        accessorFn: (row) => new Date(row.created_at).getTime(),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {format(new Date(row.original.created_at), 'MM-dd HH:mm:ss')}
          </span>
        ),
      },
      {
        id: 'tenant',
        header: t('logs.request.columns.tenant', { defaultValue: 'Tenant' }),
        accessorFn: (row) => (row.tenant_id ?? '').toLowerCase(),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.tenant_id ?? '-'}</span>,
      },
      {
        id: 'requestId',
        header: t('logs.request.columns.requestId', { defaultValue: 'Request ID' }),
        accessorFn: (row) => (row.request_id ?? '').toLowerCase(),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.request_id ?? '-'}
          </span>
        ),
      },
      {
        id: 'apiKey',
        header: t('logs.request.columns.apiKey', { defaultValue: 'API Key' }),
        accessorFn: (row) => (row.api_key_id ?? '').toLowerCase(),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.api_key_id ?? '-'}
          </span>
        ),
      },
      {
        id: 'path',
        header: t('logs.request.columns.path', { defaultValue: 'Path' }),
        accessorFn: (row) => `${row.method} ${row.path}`.toLowerCase(),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-mono text-xs">{row.original.method}</div>
            <div className="text-xs text-muted-foreground">{row.original.path}</div>
          </div>
        ),
      },
      {
        id: 'status',
        header: t('logs.request.columns.status', { defaultValue: 'Status' }),
        accessorFn: (row) => row.status_code,
        cell: ({ row }) => (
          <span
            className={
              row.original.status_code >= 500
                ? 'text-destructive font-mono'
                : row.original.status_code >= 400
                  ? 'text-warning-foreground font-mono'
                  : 'text-success-foreground font-mono'
            }
          >
            {row.original.status_code}
          </span>
        ),
      },
      {
        id: 'latency',
        header: t('logs.request.columns.latency', { defaultValue: 'Latency (ms)' }),
        accessorFn: (row) => row.latency_ms,
        cell: ({ row }) => <span className="font-mono">{row.original.latency_ms}</span>,
      },
      {
        id: 'errorCode',
        header: t('logs.request.columns.errorCode', { defaultValue: 'Error' }),
        accessorFn: (row) =>
          localizeRequestLogErrorDisplay(t, row.error_code, row.status_code).label.toLowerCase(),
        cell: ({ row }) => {
          const display = localizeRequestLogErrorDisplay(t, row.original.error_code, row.original.status_code)
          return (
            <span className="text-xs" title={display.tooltip}>
              {display.label}
            </span>
          )
        },
      },
    ],
    [t],
  )

  const rangeOptions = [
    { value: '1', label: t('logs.range.last24Hours', { defaultValue: 'Last 24 hours' }) },
    { value: '7', label: t('logs.range.last7Days', { defaultValue: 'Last 7 days' }) },
    { value: '30', label: t('logs.range.last30Days', { defaultValue: 'Last 30 days' }) },
  ]

  const tenantOptions = [
    { value: 'all', label: t('logs.filters.allTenants', { defaultValue: 'All tenants' }) },
    ...tenants.map((tenant) => ({
      value: tenant.id,
      label: `${tenant.name} (${tenant.id})`,
    })),
  ]

  const requestLogsPanel = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('logs.request.title', { defaultValue: 'Request Logs' })}</CardTitle>
        <CardDescription>
          {t('logs.request.description', {
            defaultValue: 'Scope: Raw Data Plane request events (status / latency / path / tenant / API key / request ID).',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LogsFilterGrid className="md:grid-cols-3 xl:grid-cols-6">
          <LogsFilterSelect
            value={String(rangePreset)}
            onValueChange={(value) => setRangePreset(Number(value) as RangePreset)}
            ariaLabel={t('logs.request.filters.rangeAriaLabel', { defaultValue: 'Time range' })}
            options={rangeOptions}
          />
          <LogsFilterSelect
            value={selectedTenantId}
            onValueChange={setSelectedTenantId}
            ariaLabel={t('logs.request.filters.tenantAriaLabel', { defaultValue: 'Tenant' })}
            options={tenantOptions}
            className="min-w-[280px]"
          />
          <LogsFilterInput
            value={apiKeyId}
            onValueChange={setApiKeyId}
            aria-label={t('logs.request.filters.apiKeyAriaLabel', { defaultValue: 'API key ID' })}
            placeholder={t('logs.request.filters.apiKeyIdPlaceholder', { defaultValue: 'API Key ID' })}
          />
          <LogsFilterInput
            value={statusCode}
            onValueChange={setStatusCode}
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={t('logs.request.filters.statusCodeAriaLabel', { defaultValue: 'Status code' })}
            placeholder={t('logs.request.filters.statusCodePlaceholder', {
              defaultValue: 'Status code (e.g. 500)',
            })}
          />
          <LogsFilterInput
            value={requestId}
            onValueChange={setRequestId}
            aria-label={t('logs.request.filters.requestIdAriaLabel', { defaultValue: 'Request ID' })}
            placeholder={t('logs.request.filters.requestIdPlaceholder', { defaultValue: 'Request ID' })}
          />
          <LogsFilterInput
            value={keyword}
            onValueChange={setKeyword}
            aria-label={t('logs.request.filters.keywordAriaLabel', { defaultValue: 'Keyword' })}
            placeholder={t('logs.request.filters.keywordPlaceholder', {
              defaultValue: 'Keyword (path / error / model)',
            })}
          />
        </LogsFilterGrid>
        <StandardDataTable
          columns={requestColumns}
          data={requestLedger?.items ?? []}
          density="compact"
          defaultPageSize={20}
          pageSizeOptions={[20, 50, 100]}
          emptyText={t('logs.request.empty', { defaultValue: 'No request log data available' })}
        />
      </CardContent>
    </Card>
  )

  const auditColumns = useMemo<ColumnDef<AuditLogItem>[]>(
    () => [
      {
        id: 'createdAt',
        header: t('logs.audit.columns.createdAt', { defaultValue: 'Time' }),
        accessorFn: (row) => new Date(row.created_at).getTime(),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {format(new Date(row.original.created_at), 'MM-dd HH:mm:ss')}
          </span>
        ),
      },
      {
        id: 'tenant',
        header: t('logs.audit.columns.tenant', { defaultValue: 'Tenant' }),
        accessorFn: (row) => (row.tenant_id ?? '').toLowerCase(),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.tenant_id ?? '-'}</span>,
      },
      {
        id: 'actor',
        header: t('logs.audit.columns.actor', { defaultValue: 'Actor' }),
        accessorFn: (row) =>
          `${localizeAuditActorType(row.actor_type, t)} ${row.actor_id ?? ''}`.toLowerCase(),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs" title={row.original.actor_type}>
              {localizeAuditActorType(row.original.actor_type, t)}
            </div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.actor_id ?? '-'}</div>
          </div>
        ),
      },
      {
        id: 'action',
        header: t('logs.audit.columns.action', { defaultValue: 'Action' }),
        accessorFn: (row) => localizeAuditAction(row.action, t).toLowerCase(),
        cell: ({ row }) => (
          <span className="text-xs" title={row.original.action}>
            {localizeAuditAction(row.original.action, t)}
          </span>
        ),
      },
      {
        id: 'result',
        header: t('logs.audit.columns.result', { defaultValue: 'Result' }),
        accessorFn: (row) => normalizeAuditValue(row.result_status),
        cell: ({ row }) => (
          <span
            className={
              normalizeAuditValue(row.original.result_status) === 'ok'
                ? 'font-mono text-success-foreground'
                : 'font-mono text-destructive'
            }
            title={row.original.result_status}
          >
            {localizeAuditResultStatus(row.original.result_status, t)}
          </span>
        ),
      },
      {
        id: 'target',
        header: t('logs.audit.columns.target', { defaultValue: 'Target' }),
        accessorFn: (row) => `${row.target_type ?? ''} ${row.target_id ?? ''}`.toLowerCase(),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs">{row.original.target_type ?? '-'}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.target_id ?? '-'}</div>
          </div>
        ),
      },
      {
        id: 'reason',
        header: t('logs.audit.columns.reason', { defaultValue: 'Reason' }),
        accessorFn: (row) => `${row.reason ?? ''} ${JSON.stringify(row.payload_json)}`.toLowerCase(),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs">{row.original.reason ?? '-'}</div>
            <div className="max-w-[360px] truncate font-mono text-xs text-muted-foreground">
              {JSON.stringify(row.original.payload_json)}
            </div>
          </div>
        ),
      },
    ],
    [t],
  )

  const auditLogsPanel = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('logs.audit.title', { defaultValue: 'Audit Logs' })}</CardTitle>
        <CardDescription>
          {t('logs.audit.description', {
            defaultValue: 'Scope: Control Plane audit events (role / action / result / target / payload).',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LogsFilterGrid className="md:grid-cols-3 xl:grid-cols-7">
          <LogsFilterSelect
            value={String(rangePreset)}
            onValueChange={(value) => setRangePreset(Number(value) as RangePreset)}
            ariaLabel={t('logs.audit.filters.rangeAriaLabel', { defaultValue: 'Time range' })}
            options={rangeOptions}
          />
          <LogsFilterSelect
            value={selectedTenantId}
            onValueChange={setSelectedTenantId}
            ariaLabel={t('logs.audit.filters.tenantAriaLabel', { defaultValue: 'Tenant' })}
            options={tenantOptions}
            className="min-w-[280px]"
          />
          <LogsFilterInput
            value={auditActorType}
            onValueChange={setAuditActorType}
            aria-label={t('logs.audit.filters.actorTypeAriaLabel', { defaultValue: 'Actor type' })}
            placeholder={t('logs.audit.filters.actorTypePlaceholder', { defaultValue: 'Actor type' })}
          />
          <LogsFilterInput
            value={auditActorId}
            onValueChange={setAuditActorId}
            aria-label={t('logs.audit.filters.actorIdAriaLabel', { defaultValue: 'Actor ID' })}
            placeholder={t('logs.audit.filters.actorIdPlaceholder', { defaultValue: 'Actor ID' })}
          />
          <LogsFilterInput
            value={auditAction}
            onValueChange={setAuditAction}
            aria-label={t('logs.audit.filters.actionAriaLabel', { defaultValue: 'Action' })}
            placeholder={t('logs.audit.filters.actionPlaceholder', { defaultValue: 'Action' })}
          />
          <LogsFilterInput
            value={auditResultStatus}
            onValueChange={setAuditResultStatus}
            aria-label={t('logs.audit.filters.resultStatusAriaLabel', { defaultValue: 'Result status' })}
            placeholder={t('logs.audit.filters.resultStatusPlaceholder', { defaultValue: 'Result status' })}
          />
          <LogsFilterInput
            value={auditKeyword}
            onValueChange={setAuditKeyword}
            aria-label={t('logs.audit.filters.keywordAriaLabel', { defaultValue: 'Keyword' })}
            placeholder={t('logs.audit.filters.keywordPlaceholder', {
              defaultValue: 'Keyword (reason / payload)',
            })}
          />
        </LogsFilterGrid>
        <StandardDataTable
          columns={auditColumns}
          data={auditLogs?.items ?? []}
          density="compact"
          defaultPageSize={20}
          pageSizeOptions={[20, 50, 100]}
          emptyText={t('logs.audit.empty', { defaultValue: 'No audit log data available' })}
        />
      </CardContent>
    </Card>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col overflow-hidden p-4 sm:p-6 lg:p-8"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            {t('logs.title')}
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('logs.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={tab === 'request' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('request')}
          >
            {t('logs.tabs.request', { defaultValue: 'Request Logs' })}
          </Button>
          <Button
            variant={tab === 'system' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('system')}
          >
            {t('logs.tabs.system', { defaultValue: 'System Logs' })}
          </Button>
          <Button
            variant={tab === 'audit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('audit')}
          >
            {t('logs.tabs.audit', { defaultValue: 'Audit Logs' })}
          </Button>
          {tab === 'system' ? (
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              {t('logs.export')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {tab === 'request' ? (
          requestLogsPanel
        ) : tab === 'audit' ? (
          auditLogsPanel
        ) : (
          <>
            <LoadingOverlay
              show={isLoading}
              title={t('common.loading')}
              description={t('logs.subtitle')}
            />

            <StandardDataTable
              columns={columns}
              data={filteredLogs}
              density="compact"
              searchPlaceholder={t('logs.search')}
              searchFn={(row, keyword) => {
                const localizedAction = localizeLogAction(row.action, t).toLowerCase()
                const localizedMessage = localizeLogMessage(row.action, row.message || '', t).toLowerCase()
                const rawAction = row.action.toLowerCase()
                const rawMessage = (row.message || '').toLowerCase()
                const level = levelLabel(row.level, t).toLowerCase()
                return (
                  localizedAction.includes(keyword) ||
                  localizedMessage.includes(keyword) ||
                  rawAction.includes(keyword) ||
                  rawMessage.includes(keyword) ||
                  level.includes(keyword)
                )
              }}
              emptyText={t('logs.waiting')}
              filters={(
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('logs.focus')}</span>
                  <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as LogLevelFilter)}>
                    <SelectTrigger className="w-[180px]" aria-label={t('logs.focus')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('logs.levels.all')}</SelectItem>
                      <SelectItem value="error">{t('logs.levels.error')}</SelectItem>
                      <SelectItem value="warn">{t('logs.levels.warn')}</SelectItem>
                      <SelectItem value="info">{t('logs.levels.info')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </>
        )}
      </div>
    </motion.div>
  )
}
