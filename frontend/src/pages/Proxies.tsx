import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Activity, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { proxiesApi, type ProxyNode } from '@/api/proxies'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/time'

type ProxyFilter = 'all' | 'healthy' | 'degraded' | 'offline' | 'disabled'

function resolveProxyHealth(proxy: ProxyNode): ProxyFilter {
  if (!proxy.enabled) {
    return 'disabled'
  }
  if (proxy.last_test_status === 'error') {
    return 'offline'
  }
  if (proxy.last_test_status === 'skipped') {
    return 'degraded'
  }
  return 'healthy'
}

function matchesProxySearch(proxy: ProxyNode, keyword: string) {
  return [proxy.label, proxy.base_url, proxy.last_error].some((item) =>
    item?.toLowerCase().includes(keyword),
  )
}

export default function Proxies() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [healthFilter, setHealthFilter] = useState<ProxyFilter>('all')
  const [pendingProxyId, setPendingProxyId] = useState<string | null>(null)
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    const raw = localStorage.getItem('cp.proxies.compact')
    return raw === '1'
  })

  const { data: proxies = [], isLoading, isFetching } = useQuery({
    queryKey: ['proxyNodes'],
    queryFn: proxiesApi.listProxies,
    refetchInterval: 15000,
  })

  const healthCheckMutation = useMutation({
    mutationFn: proxiesApi.testAll,
    onSuccess: (payload) => {
      queryClient.setQueryData(['proxyNodes'], payload.results)
    },
  })

  const filteredData = useMemo(() => {
    if (healthFilter === 'all') {
      return proxies
    }
    return proxies.filter((proxy) => resolveProxyHealth(proxy) === healthFilter)
  }, [healthFilter, proxies])

  const columns = useMemo<ColumnDef<ProxyNode>[]>(
    () => [
      {
        accessorKey: 'base_url',
        header: t('proxies.columns.url'),
        cell: ({ row }) => {
          const isOnline = row.original.enabled && row.original.last_test_status !== 'error'
          return (
            <div className="flex min-w-[220px] items-center gap-2">
              <Server className={cn('h-4 w-4', isOnline ? 'text-primary' : 'text-muted-foreground')} />
              <span className="max-w-[300px] truncate font-mono text-sm font-medium" title={row.original.base_url}>
                {row.original.base_url.replace(/^https?:\/\//, '')}
              </span>
            </div>
          )
        },
      },
      {
        id: 'health',
        accessorFn: (row) => resolveProxyHealth(row),
        header: t('proxies.columns.health'),
        cell: ({ row }) => {
          const health = resolveProxyHealth(row.original)
          if (health === 'disabled') {
            return <Badge variant="secondary">{t('proxies.health.disabled')}</Badge>
          }
          if (health === 'offline') {
            return <Badge variant="destructive">{t('proxies.health.offline')}</Badge>
          }
          if (health === 'degraded') {
            return <Badge variant="warning">{t('proxies.health.degraded')}</Badge>
          }
          return <Badge variant="success">{t('proxies.health.healthy')}</Badge>
        },
      },
      {
        accessorKey: 'last_latency_ms',
        header: t('proxies.columns.latency'),
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {typeof row.original.last_latency_ms === 'number' ? `${row.original.last_latency_ms}ms` : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'updated_at',
        header: t('proxies.columns.lastPing'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.updated_at
              ? formatRelativeTime(row.original.updated_at, i18n.resolvedLanguage, true)
              : t('proxies.pending')}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: t('proxies.columns.actions'),
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setPendingProxyId(row.original.id)
              try {
                const payload = await proxiesApi.testProxy(row.original.id)
                queryClient.setQueryData(['proxyNodes'], payload.results)
              } finally {
                setPendingProxyId(null)
              }
            }}
            disabled={pendingProxyId === row.original.id}
          >
            {row.original.last_test_status === 'error' ? t('proxies.retry') : t('proxies.manage')}
          </Button>
        ),
      },
    ],
    [i18n.resolvedLanguage, pendingProxyId, queryClient, t],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col overflow-hidden p-8"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('proxies.title')}</h2>
          <p className="mt-1 text-muted-foreground">{t('proxies.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const next = !compactMode
              setCompactMode(next)
              localStorage.setItem('cp.proxies.compact', next ? '1' : '0')
            }}
          >
            {compactMode ? t('accounts.actions.comfortableMode') : t('accounts.actions.compactMode')}
          </Button>

          <Button
            onClick={() => healthCheckMutation.mutate()}
            disabled={isFetching || healthCheckMutation.isPending}
          >
            <Activity className={cn('mr-2 h-4 w-4', (isFetching || healthCheckMutation.isPending) && 'animate-spin')} />
            {t('proxies.check')}
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <LoadingOverlay
          show={isLoading}
          title={t('proxies.loading')}
          description={t('common.loading')}
        />

        <StandardDataTable
          columns={columns}
          data={filteredData}
          density={compactMode ? 'compact' : 'comfortable'}
          searchPlaceholder={t('proxies.searchPlaceholder')}
          searchFn={matchesProxySearch}
          emptyText={t('proxies.empty')}
          filters={(
            <Select value={healthFilter} onValueChange={(value) => setHealthFilter(value as ProxyFilter)}>
              <SelectTrigger className="w-[180px]" aria-label={t('proxies.filters.label')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('proxies.filters.all')}</SelectItem>
                <SelectItem value="healthy">{t('proxies.filters.healthy')}</SelectItem>
                <SelectItem value="degraded">{t('proxies.filters.degraded')}</SelectItem>
                <SelectItem value="offline">{t('proxies.filters.offline')}</SelectItem>
                <SelectItem value="disabled">{t('proxies.filters.disabled')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </motion.div>
  )
}
