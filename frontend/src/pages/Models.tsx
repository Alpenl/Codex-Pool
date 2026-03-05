import { useCallback, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ActivitySquare,
  CircleAlert,
  Copy,
  Cpu,
  PlusCircle,
  RotateCw,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  modelsApi,
  type ModelEntityItem,
  type ModelPricingItem,
  type ModelSchema,
} from '@/api/models'
import { localizeApiErrorDisplay } from '@/api/errorI18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AccessibleTabList } from '@/components/ui/accessible-tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { POOL_SECTION_CLASS_NAME } from '@/lib/pool-styles'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/time'

type ProviderFilter = 'all' | string

type ModelEditorTab = 'profile' | 'pricing'

interface ModelPoolRow extends ModelSchema {
  source: 'upstream' | 'entity_only' | 'pricing_only'
  entity?: ModelEntityItem
  pricing?: ModelPricingItem
}

function formatMicrocredits(value: number) {
  return (value / 1_000_000).toFixed(4)
}

function defaultCachedInputMicrocredits(inputPriceMicrocredits: number) {
  return Math.max(0, Math.floor(inputPriceMicrocredits / 10))
}

function matchesModelSearch(model: ModelPoolRow, keyword: string) {
  return [
    model.id,
    model.owned_by,
    model.visibility ?? '',
    model.availability_status,
    model.availability_error ?? '',
    model.in_catalog ? 'catalog' : 'unlisted',
    model.source,
    model.pricing?.model ?? '',
    String(model.pricing?.input_price_microcredits ?? ''),
    String(model.pricing?.cached_input_price_microcredits ?? ''),
    String(model.pricing?.output_price_microcredits ?? ''),
  ].some((item) => item.toLowerCase().includes(keyword))
}

function modelCatalogBadgeVariant(model: ModelPoolRow): 'success' | 'warning' | 'info' {
  if (model.source === 'pricing_only' || model.source === 'entity_only') {
    return 'info'
  }
  if (!model.in_catalog) {
    return 'info'
  }
  if ((model.visibility ?? '').toLowerCase() === 'hide') {
    return 'warning'
  }
  return 'success'
}

function modelCatalogLabel(model: ModelPoolRow, t: ReturnType<typeof useTranslation>['t']) {
  if (model.source === 'pricing_only' || model.source === 'entity_only') {
    return t('models.catalog.customOnly', { defaultValue: 'Custom model' })
  }
  if (!model.in_catalog) {
    return t('models.catalog.unlisted')
  }
  if ((model.visibility ?? '').toLowerCase() === 'hide') {
    return t('models.catalog.hidden')
  }
  return t('models.catalog.listed')
}

function modelAvailabilityBadgeVariant(
  status: ModelSchema['availability_status'],
): 'success' | 'destructive' | 'secondary' {
  if (status === 'available') {
    return 'success'
  }
  if (status === 'unavailable') {
    return 'destructive'
  }
  return 'secondary'
}

function modelAvailabilityLabel(
  status: ModelSchema['availability_status'],
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (status === 'available') {
    return t('models.availability.available')
  }
  if (status === 'unavailable') {
    return t('models.availability.unavailable')
  }
  return t('models.availability.unknown')
}

function modelAvailabilityIssueText(
  model: ModelPoolRow,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const parts: string[] = []
  if (model.availability_http_status) {
    parts.push(`HTTP ${model.availability_http_status}`)
  }
  const error = (model.availability_error ?? '').trim()
  if (error) {
    parts.push(error)
  }
  if (parts.length === 0) {
    return t('models.availability.noErrorDetail')
  }
  return parts.join(' · ')
}

function modelSourceLabel(
  source: ModelPoolRow['source'],
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (source === 'entity_only') {
    return t('models.form.sourceValues.entityOnly', { defaultValue: 'Entity only' })
  }
  if (source === 'pricing_only') {
    return t('models.form.sourceValues.pricingOnly', { defaultValue: 'Pricing only' })
  }
  return t('models.form.sourceValues.upstream', { defaultValue: 'Upstream' })
}

export default function Models() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTab, setEditorTab] = useState<ModelEditorTab>('profile')
  const [editingModel, setEditingModel] = useState<ModelPoolRow | null>(null)
  const [modelForm, setModelForm] = useState({
    model: '',
    provider: 'custom',
    visibility: 'list',
  })
  const [pricingForm, setPricingForm] = useState({
    input_price_microcredits: '0',
    cached_input_price_microcredits: '0',
    output_price_microcredits: '0',
    enabled: true,
  })

  const resolveErrorLabel = useCallback(
    (err: unknown, fallback: string) => localizeApiErrorDisplay(t, err, fallback).label,
    [t],
  )

  const { data: modelsPayload, isLoading, isFetching } = useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.listModels,
    staleTime: 180000,
    refetchInterval: 180000,
  })

  const pricingQuery = useQuery({
    queryKey: ['adminModelPricing'],
    queryFn: modelsApi.listModelPricing,
    staleTime: 60000,
  })

  const modelEntitiesQuery = useQuery({
    queryKey: ['adminModelEntities'],
    queryFn: modelsApi.listModelEntities,
    staleTime: 60000,
  })

  const isSyncingPools = isFetching || pricingQuery.isFetching || modelEntitiesQuery.isFetching

  const probeMutation = useMutation({
    mutationFn: () => modelsApi.probeModels({ force: true }),
    onSuccess: (payload) => {
      queryClient.setQueryData(['models'], payload)
      setNotice(
        t('models.notice.probeCompleted', {
          defaultValue: 'Model probing completed. The latest model pool has been synced.',
        }),
      )
      setError(null)
    },
    onError: (err) => {
      setError(
        resolveErrorLabel(
          err,
          t('models.errors.probeFailed', { defaultValue: 'Model probing failed.' }),
        ),
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
  })

  const upsertModelEntityMutation = useMutation({
    mutationFn: async () =>
      modelsApi.upsertModelEntity({
        model: modelForm.model.trim(),
        provider: modelForm.provider.trim() || undefined,
        visibility: modelForm.visibility.trim() || undefined,
      }),
    onSuccess: (item) => {
      setError(null)
      setNotice(
        t('models.notice.modelProfileSaved', {
          defaultValue: 'Model profile saved: {{model}}',
          model: item.model,
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['adminModelEntities'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
      setEditingModel((current) => {
        if (!current) {
          return current
        }
        return {
          ...current,
          id: item.model,
          owned_by: item.provider,
          entity_id: item.id,
          visibility: item.visibility ?? current.visibility,
        }
      })
    },
    onError: (err) => {
      setError(
        resolveErrorLabel(
          err,
          t('models.errors.saveModelProfileFailed', { defaultValue: 'Failed to save model profile.' }),
        ),
      )
    },
  })

  const deleteModelEntityMutation = useMutation({
    mutationFn: async (entityId: string) => modelsApi.deleteModelEntity(entityId),
    onSuccess: () => {
      setError(null)
      setNotice(t('models.notice.modelEntityDeleted', { defaultValue: 'Model entity deleted.' }))
      queryClient.invalidateQueries({ queryKey: ['adminModelEntities'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
      setEditorOpen(false)
      setEditingModel(null)
    },
    onError: (err) => {
      setError(
        resolveErrorLabel(
          err,
          t('models.errors.deleteModelEntityFailed', { defaultValue: 'Failed to delete model entity.' }),
        ),
      )
    },
  })

  const upsertPricingMutation = useMutation({
    mutationFn: async () =>
      modelsApi.upsertModelPricing({
        model: modelForm.model.trim(),
        input_price_microcredits: Number(pricingForm.input_price_microcredits),
        cached_input_price_microcredits: Number(pricingForm.cached_input_price_microcredits),
        output_price_microcredits: Number(pricingForm.output_price_microcredits),
        enabled: pricingForm.enabled,
      }),
    onSuccess: (item) => {
      setError(null)
      setNotice(
        t('models.notice.modelPricingSaved', {
          defaultValue: 'Model pricing saved: {{model}}',
          model: item.model,
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['adminModelPricing'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err) => {
      setError(
        resolveErrorLabel(
          err,
          t('models.errors.saveModelPricingFailed', { defaultValue: 'Failed to save model pricing.' }),
        ),
      )
    },
  })

  const deletePricingMutation = useMutation({
    mutationFn: async (pricingId: string) => modelsApi.deleteModelPricing(pricingId),
    onSuccess: () => {
      setError(null)
      setNotice(t('models.notice.modelPricingDeleted', { defaultValue: 'Model pricing record deleted.' }))
      queryClient.invalidateQueries({ queryKey: ['adminModelPricing'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err) => {
      setError(
        resolveErrorLabel(
          err,
          t('models.errors.deleteModelPricingFailed', { defaultValue: 'Failed to delete model pricing.' }),
        ),
      )
    },
  })

  const models = useMemo(() => modelsPayload?.data ?? [], [modelsPayload])
  const modelsMeta = modelsPayload?.meta
  const pricingRows = useMemo(() => pricingQuery.data ?? [], [pricingQuery.data])
  const modelEntities = useMemo(() => modelEntitiesQuery.data ?? [], [modelEntitiesQuery.data])

  const pricingByModel = useMemo(() => {
    const map = new Map<string, ModelPricingItem>()
    for (const pricing of pricingRows) {
      map.set(pricing.model, pricing)
    }
    return map
  }, [pricingRows])

  const entityByModel = useMemo(() => {
    const map = new Map<string, ModelEntityItem>()
    for (const entity of modelEntities) {
      map.set(entity.model, entity)
    }
    return map
  }, [modelEntities])

  const modelRows = useMemo<ModelPoolRow[]>(() => {
    const rowMap = new Map<string, ModelPoolRow>()
    for (const item of models) {
      const linkedEntity = entityByModel.get(item.id)
      rowMap.set(item.id, {
        ...item,
        owned_by: linkedEntity?.provider ?? item.owned_by,
        entity_id: linkedEntity?.id ?? item.entity_id ?? null,
        visibility: linkedEntity?.visibility ?? item.visibility,
        source: 'upstream',
        entity: linkedEntity,
        pricing: pricingByModel.get(item.id),
      })
    }

    for (const entity of modelEntities) {
      const existing = rowMap.get(entity.model)
      if (existing) {
        rowMap.set(entity.model, {
          ...existing,
          owned_by: entity.provider || existing.owned_by,
          entity_id: entity.id,
          visibility: entity.visibility ?? existing.visibility,
          in_catalog: true,
          entity,
        })
        continue
      }
      rowMap.set(entity.model, {
        id: entity.model,
        object: 'model',
        created: 0,
        owned_by: entity.provider || 'custom',
        entity_id: entity.id,
        visibility: entity.visibility ?? 'custom',
        in_catalog: true,
        availability_status: 'unknown',
        availability_checked_at: null,
        availability_http_status: null,
        availability_error: null,
        source: 'entity_only',
        entity,
        pricing: pricingByModel.get(entity.model),
      })
    }

    for (const pricing of pricingRows) {
      const existing = rowMap.get(pricing.model)
      if (existing) {
        rowMap.set(pricing.model, { ...existing, pricing })
        continue
      }
      rowMap.set(pricing.model, {
        id: pricing.model,
        object: 'model',
        created: 0,
        owned_by: 'custom',
        entity_id: null,
        visibility: 'custom',
        in_catalog: true,
        availability_status: 'unknown',
        availability_checked_at: null,
        availability_http_status: null,
        availability_error: null,
        source: 'pricing_only',
        pricing,
      })
    }

    const rows = Array.from(rowMap.values())
    rows.sort((a, b) => a.id.localeCompare(b.id))
    return rows
  }, [entityByModel, modelEntities, models, pricingByModel, pricingRows])

  const isProbing = probeMutation.isPending

  const providerOptions = useMemo(() => {
    const unique = Array.from(new Set(modelRows.map((item) => item.owned_by).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    )
    return unique
  }, [modelRows])

  const filteredData = useMemo(() => {
    if (providerFilter === 'all') {
      return modelRows
    }
    return modelRows.filter((item) => item.owned_by === providerFilter)
  }, [modelRows, providerFilter])

  const openEditor = useCallback((row: ModelPoolRow) => {
    const inputPrice = row.pricing?.input_price_microcredits ?? 0
    setEditingModel(row)
    setModelForm({
      model: row.id,
      provider: row.entity?.provider ?? row.owned_by ?? 'custom',
      visibility: row.entity?.visibility ?? row.visibility ?? 'list',
    })
    setPricingForm({
      input_price_microcredits: String(inputPrice),
      cached_input_price_microcredits: String(
        row.pricing?.cached_input_price_microcredits ?? defaultCachedInputMicrocredits(inputPrice),
      ),
      output_price_microcredits: String(row.pricing?.output_price_microcredits ?? 0),
      enabled: row.pricing?.enabled ?? true,
    })
    setEditorTab('profile')
    setEditorOpen(true)
  }, [])

  const openCreateModel = useCallback(() => {
    setEditingModel(null)
    setModelForm({
      model: '',
      provider: 'custom',
      visibility: 'list',
    })
    setPricingForm({
      input_price_microcredits: '0',
      cached_input_price_microcredits: '0',
      output_price_microcredits: '0',
      enabled: true,
    })
    setEditorTab('profile')
    setEditorOpen(true)
  }, [])

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }, [])

  const columns = useMemo<ColumnDef<ModelPoolRow>[]>(
    () => [
      {
        accessorKey: 'id',
        header: t('models.columns.id'),
        cell: ({ row }) => (
          <div className="group flex min-w-[220px] items-center gap-1">
            <span className="min-w-0 truncate font-mono text-sm font-medium" title={row.original.id}>
              {row.original.id}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation()
                void copyText(row.original.id)
              }}
              title={t('models.actions.copyModelId', { defaultValue: 'Copy model ID' })}
              aria-label={t('models.actions.copyModelId', { defaultValue: 'Copy model ID' })}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
      {
        id: 'catalog',
        accessorFn: (row) => (row.in_catalog ? row.visibility ?? 'list' : 'unlisted'),
        header: t('models.columns.catalog'),
        cell: ({ row }) => (
          <Badge variant={modelCatalogBadgeVariant(row.original)}>
            {modelCatalogLabel(row.original, t)}
          </Badge>
        ),
      },
      {
        id: 'availability',
        accessorFn: (row) => row.availability_status,
        header: t('models.columns.availability'),
        cell: ({ row }) => {
          const status = row.original.availability_status
          const hasIssue = status === 'unavailable' || Boolean(row.original.availability_error)
          const issueText = modelAvailabilityIssueText(row.original, t)
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant={modelAvailabilityBadgeVariant(status)}>
                {modelAvailabilityLabel(status, t)}
              </Badge>
              {hasIssue ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-warning-foreground transition-colors hover:bg-warning-muted"
                      aria-label={t('models.availability.issueHint')}
                    >
                      <CircleAlert className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="start"
                    className="max-h-40 max-w-[380px] overflow-auto whitespace-pre-wrap break-words leading-relaxed"
                  >
                    {issueText}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          )
        },
      },
      {
        accessorKey: 'owned_by',
        header: t('models.columns.provider'),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.owned_by}</span>,
      },
      {
        id: 'inputPrice',
        accessorFn: (row) => row.pricing?.input_price_microcredits ?? -1,
        header: t('models.columns.inputPrice', { defaultValue: 'Input Price' }),
        cell: ({ row }) => {
          const value = row.original.pricing?.input_price_microcredits
          if (value === undefined) {
            return (
              <span className="text-xs text-muted-foreground">
                {t('models.pricing.notConfigured', { defaultValue: 'Not configured' })}
              </span>
            )
          }
          return (
            <div className="space-y-0.5">
              <div className="font-mono text-xs">{value}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatMicrocredits(value)}{' '}
                {t('models.pricing.creditsPerMillionTokens', { defaultValue: 'credits / 1M tokens' })}
              </div>
            </div>
          )
        },
      },
      {
        id: 'cachedInputPrice',
        accessorFn: (row) => row.pricing?.cached_input_price_microcredits ?? -1,
        header: t('models.columns.cachedInputPrice', { defaultValue: 'Cached Input Price' }),
        cell: ({ row }) => {
          const value = row.original.pricing?.cached_input_price_microcredits
          if (value === undefined) {
            return (
              <span className="text-xs text-muted-foreground">
                {t('models.pricing.notConfigured', { defaultValue: 'Not configured' })}
              </span>
            )
          }
          return (
            <div className="space-y-0.5">
              <div className="font-mono text-xs">{value}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatMicrocredits(value)}{' '}
                {t('models.pricing.creditsPerMillionTokens', { defaultValue: 'credits / 1M tokens' })}
              </div>
            </div>
          )
        },
      },
      {
        id: 'outputPrice',
        accessorFn: (row) => row.pricing?.output_price_microcredits ?? -1,
        header: t('models.columns.outputPrice', { defaultValue: 'Output Price' }),
        cell: ({ row }) => {
          const value = row.original.pricing?.output_price_microcredits
          if (value === undefined) {
            return (
              <span className="text-xs text-muted-foreground">
                {t('models.pricing.notConfigured', { defaultValue: 'Not configured' })}
              </span>
            )
          }
          return (
            <div className="space-y-0.5">
              <div className="font-mono text-xs">{value}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatMicrocredits(value)}{' '}
                {t('models.pricing.creditsPerMillionTokens', { defaultValue: 'credits / 1M tokens' })}
              </div>
            </div>
          )
        },
      },
      {
        id: 'priceStatus',
        accessorFn: (row) => row.pricing?.enabled ?? false,
        header: t('models.columns.pricingStatus', { defaultValue: 'Pricing Status' }),
        cell: ({ row }) => {
          const pricing = row.original.pricing
          if (!pricing) {
            return (
              <Badge variant="secondary">
                {t('models.pricing.notConfigured', { defaultValue: 'Not configured' })}
              </Badge>
            )
          }
          return (
            <Badge variant={pricing.enabled ? 'success' : 'warning'}>
              {pricing.enabled
                ? t('models.pricing.enabled', { defaultValue: 'Enabled' })
                : t('models.pricing.disabled', { defaultValue: 'Disabled' })}
            </Badge>
          )
        },
      },
      {
        id: 'checkedAt',
        accessorFn: (row) => row.availability_checked_at ?? '',
        header: t('models.columns.checkedAt'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.availability_checked_at
              ? formatRelativeTime(new Date(row.original.availability_checked_at).getTime(), i18n.resolvedLanguage, true)
              : t('models.availability.neverChecked')}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: t('models.columns.actions', { defaultValue: 'Actions' }),
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="group" onClick={() => openEditor(row.original)}>
            {t('models.actions.editModel', { defaultValue: 'Edit model' })}
            <SquarePen className="ml-1 h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [copyText, i18n.resolvedLanguage, openEditor, t],
  )

  const probeSummaryText = useMemo(() => {
    if (!modelsMeta) {
      return null
    }
    const ttlHours = Math.max(1, Math.round(modelsMeta.probe_cache_ttl_sec / 3600))
    const checkedAt = modelsMeta.probe_cache_updated_at
      ? formatRelativeTime(new Date(modelsMeta.probe_cache_updated_at).getTime(), i18n.resolvedLanguage, true)
      : t('models.availability.neverChecked')
    return t('models.probeSummary', {
      checkedAt,
      ttlHours,
      source: modelsMeta.source_account_label ?? t('models.probeSourceUnknown'),
      stale: modelsMeta.probe_cache_stale ? t('models.cache.stale') : t('models.cache.fresh'),
    })
  }, [i18n.resolvedLanguage, modelsMeta, t])

  const catalogErrorText = modelsMeta?.catalog_last_error ?? null

  const currentModel = editingModel

  const canDeleteCurrentModelEntity = Boolean(currentModel?.entity_id)
  const canDeleteCurrentPricing = Boolean(currentModel?.pricing?.id)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col overflow-hidden p-8"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {t('models.title', { defaultValue: 'Model pool' })}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {t('models.description', {
              defaultValue: 'View model availability and manage model profiles and pricing here.',
            })}
          </p>
          {probeSummaryText ? (
            <p className="mt-1 text-xs text-muted-foreground">{probeSummaryText}</p>
          ) : null}
          {catalogErrorText ? (
            <p className="mt-1 break-all text-xs text-warning-foreground">{catalogErrorText}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => probeMutation.mutate()}
            disabled={isProbing || isFetching}
          >
            <ActivitySquare className={cn('mr-2 h-4 w-4', isProbing && 'animate-pulse')} />
            {t('models.actions.probeNow')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['models'] })
              queryClient.invalidateQueries({ queryKey: ['adminModelPricing'] })
              queryClient.invalidateQueries({ queryKey: ['adminModelEntities'] })
            }}
            disabled={isSyncingPools || isProbing}
          >
            <RotateCw className={cn('mr-2 h-4 w-4', isSyncingPools && 'animate-spin')} />
            {t('models.actions.sync')}
          </Button>
          <Button onClick={openCreateModel}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('models.actions.createModel', { defaultValue: 'Create model' })}
          </Button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-success-foreground">{notice}</p> : null}

      <div className="relative min-h-0 flex-1">
        <LoadingOverlay
          show={isLoading || pricingQuery.isLoading || modelEntitiesQuery.isLoading}
          title={t('models.syncing')}
          description={t('models.loadingHint', {
            defaultValue: 'Checking catalog and availability status. The latest model list will appear automatically.',
          })}
        />

        <TooltipProvider>
          <StandardDataTable
            columns={columns}
            data={filteredData}
            searchPlaceholder={t('models.actions.search')}
            searchFn={matchesModelSearch}
            emptyText={t('models.empty')}
            filters={(
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[220px]" aria-label={t('models.filters.providerLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('models.filters.allProviders')}</SelectItem>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            actions={
              filteredData.length === 0 ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => navigate('/imports')}>
                    <PlusCircle className="mr-1 h-4 w-4" />
                    {t('models.emptyActions.importAccount')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate('/accounts')}>
                    <Cpu className="mr-1 h-4 w-4" />
                    {t('models.emptyActions.goAccounts')}
                  </Button>
                </div>
              ) : null
            }
          />
        </TooltipProvider>
      </div>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) {
            setEditingModel(null)
            setEditorTab('profile')
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {currentModel
                ? t('models.dialog.titleWithId', {
                    defaultValue: 'Model profile · {{modelId}}',
                    modelId: currentModel.id,
                  })
                : t('models.actions.createModel', { defaultValue: 'Create model' })}
            </DialogTitle>
            <DialogDescription>
              {t('models.dialog.description', {
                defaultValue:
                  'Edit profile and pricing in this dialog. Saved pricing will be written back to the model pool list immediately.',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <AccessibleTabList
              idBase="models-editor"
              ariaLabel={t('models.dialog.tabListAriaLabel', { defaultValue: 'Model profile tabs' })}
              value={editorTab}
              onValueChange={setEditorTab}
              items={[
                {
                  value: 'profile',
                  label: t('models.tabs.profile', { defaultValue: 'Profile' }),
                },
                {
                  value: 'pricing',
                  label: t('models.tabs.pricing', { defaultValue: 'Pricing' }),
                },
              ]}
            />

            {editorTab === 'profile' ? (
              <section
                id="models-editor-panel-profile"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="models-editor-tab-profile"
                className={POOL_SECTION_CLASS_NAME}
              >
                <h3 className="text-base font-medium">
                  {t('models.profile.sectionTitle', { defaultValue: 'Model profile' })}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="model-editor-id" className="text-xs font-medium text-muted-foreground">
                      {t('models.form.modelId', { defaultValue: 'Model ID' })}
                    </label>
                    <Input
                      id="model-editor-id"
                      name="model"
                      value={modelForm.model}
                      disabled={Boolean(currentModel)}
                      onChange={(event) =>
                        setModelForm((prev) => ({ ...prev, model: event.target.value }))
                      }
                      placeholder={t('models.form.modelIdPlaceholder', {
                        defaultValue: 'Example: gpt-5.3-codex',
                      })}
                    />
                    {currentModel ? (
                      <p className="text-xs text-muted-foreground">
                        {t('models.form.modelIdLockedHint', {
                          defaultValue:
                            'Existing models cannot change the ID. Use "Create model" to add a new one.',
                        })}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t('models.form.source', { defaultValue: 'Source' })}
                    </label>
                    <div className="rounded border px-3 py-2 text-sm text-muted-foreground">
                      {modelSourceLabel(currentModel ? currentModel.source : 'entity_only', t)}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="model-editor-provider" className="text-xs font-medium text-muted-foreground">
                      {t('models.form.provider', { defaultValue: 'Provider' })}
                    </label>
                    <Input
                      id="model-editor-provider"
                      name="provider"
                      value={modelForm.provider}
                      onChange={(event) =>
                        setModelForm((prev) => ({ ...prev, provider: event.target.value }))
                      }
                      placeholder={t('models.form.providerPlaceholder', {
                        defaultValue: 'Example: openai / custom',
                      })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="model-editor-visibility" className="text-xs font-medium text-muted-foreground">
                      {t('models.form.visibility', { defaultValue: 'Visibility' })}
                    </label>
                    <Input
                      id="model-editor-visibility"
                      name="visibility"
                      value={modelForm.visibility}
                      onChange={(event) =>
                        setModelForm((prev) => ({ ...prev, visibility: event.target.value }))
                      }
                      placeholder={t('models.form.visibilityPlaceholder', {
                        defaultValue: 'Example: list / hide',
                      })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => {
                      if (!modelForm.model.trim()) {
                        setError(
                          t('models.errors.modelIdRequired', { defaultValue: 'Model ID cannot be empty.' }),
                        )
                        return
                      }
                      upsertModelEntityMutation.mutate()
                    }}
                    disabled={upsertModelEntityMutation.isPending}
                  >
                    {upsertModelEntityMutation.isPending ? (
                      <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t('models.actions.saveModelProfile', { defaultValue: 'Save model profile' })}
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!currentModel?.entity_id) {
                        return
                      }
                      deleteModelEntityMutation.mutate(currentModel.entity_id)
                    }}
                    disabled={!canDeleteCurrentModelEntity || deleteModelEntityMutation.isPending}
                  >
                    {deleteModelEntityMutation.isPending ? (
                      <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {t('models.actions.deleteModel', { defaultValue: 'Delete model' })}
                  </Button>
                </div>

                {!canDeleteCurrentModelEntity ? (
                  <p className="text-xs text-muted-foreground">
                    {t('models.hints.cannotDeleteNonLocalEntity', {
                      defaultValue: 'The current model is not a local entity model, so its entity cannot be deleted.',
                    })}
                  </p>
                ) : null}
              </section>
            ) : null}

            {editorTab === 'pricing' ? (
              <section
                id="models-editor-panel-pricing"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="models-editor-tab-pricing"
                className={POOL_SECTION_CLASS_NAME}
              >
                <h3 className="text-base font-medium">
                  {t('models.pricing.sectionTitle', { defaultValue: 'Model pricing' })}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <label htmlFor="model-pricing-input" className="text-xs font-medium text-muted-foreground">
                      <span className="block">
                        {t('models.pricing.inputPrice', { defaultValue: 'Input price' })}
                      </span>
                      <span className="block">
                        {t('models.pricing.perMillionTokensMicrocredits', {
                          defaultValue: 'Per 1M tokens, in microcredits',
                        })}
                      </span>
                    </label>
                    <Input
                      id="model-pricing-input"
                      name="input_price_microcredits"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={pricingForm.input_price_microcredits}
                      onChange={(event) =>
                        setPricingForm((prev) => ({
                          ...prev,
                          input_price_microcredits: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="model-pricing-cached-input" className="text-xs font-medium text-muted-foreground">
                      <span className="block">
                        {t('models.pricing.cachedInputPrice', { defaultValue: 'Cached input price' })}
                      </span>
                      <span className="block">
                        {t('models.pricing.perMillionTokensMicrocredits', {
                          defaultValue: 'Per 1M tokens, in microcredits',
                        })}
                      </span>
                    </label>
                    <Input
                      id="model-pricing-cached-input"
                      name="cached_input_price_microcredits"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={pricingForm.cached_input_price_microcredits}
                      onChange={(event) =>
                        setPricingForm((prev) => ({
                          ...prev,
                          cached_input_price_microcredits: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="model-pricing-output" className="text-xs font-medium text-muted-foreground">
                      <span className="block">
                        {t('models.pricing.outputPrice', { defaultValue: 'Output price' })}
                      </span>
                      <span className="block">
                        {t('models.pricing.perMillionTokensMicrocredits', {
                          defaultValue: 'Per 1M tokens, in microcredits',
                        })}
                      </span>
                    </label>
                    <Input
                      id="model-pricing-output"
                      name="output_price_microcredits"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={pricingForm.output_price_microcredits}
                      onChange={(event) =>
                        setPricingForm((prev) => ({
                          ...prev,
                          output_price_microcredits: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <label htmlFor="model-pricing-enabled" className="flex items-center gap-2 text-sm text-muted-foreground md:pt-7">
                    <Checkbox
                      id="model-pricing-enabled"
                      checked={pricingForm.enabled}
                      onCheckedChange={(checked) =>
                        setPricingForm((prev) => ({ ...prev, enabled: Boolean(checked) }))
                      }
                    />
                    {t('models.pricing.enablePricing', { defaultValue: 'Enable pricing' })}
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => {
                      if (!modelForm.model.trim()) {
                        setError(
                          t('models.errors.modelIdRequired', { defaultValue: 'Model ID cannot be empty.' }),
                        )
                        return
                      }
                      upsertPricingMutation.mutate()
                    }}
                    disabled={upsertPricingMutation.isPending}
                  >
                    {upsertPricingMutation.isPending ? (
                      <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t('models.actions.savePricing', { defaultValue: 'Save pricing' })}
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!currentModel?.pricing?.id) {
                        return
                      }
                      deletePricingMutation.mutate(currentModel.pricing.id)
                    }}
                    disabled={!canDeleteCurrentPricing || deletePricingMutation.isPending}
                  >
                    {deletePricingMutation.isPending ? (
                      <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {t('models.actions.deletePricing', { defaultValue: 'Delete pricing' })}
                  </Button>
                </div>

                {!canDeleteCurrentPricing ? (
                  <p className="text-xs text-muted-foreground">
                    {t('models.hints.cannotDeleteMissingPricing', {
                      defaultValue:
                        'The current model has no local pricing record. Save pricing first before deleting it.',
                    })}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
