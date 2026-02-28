import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  HardDriveDownload,
  Loader2,
  Pause,
  Play,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { accountsApi } from '@/api/accounts'
import { extractApiErrorMessage } from '@/api/client'
import {
  importJobsApi,
  type OAuthImportJobItem,
  type OAuthImportJobSummary,
} from '@/api/importJobs'
import AnimatedContent from '@/components/AnimatedContent'
import ShinyText from '@/components/ShinyText'
import Threads from '@/components/Threads'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import { cn } from '@/lib/utils'
import {
  MAX_RECENT_JOBS,
  RECENT_JOBS_STORAGE_KEY,
  type StagedImportFile,
} from '@/features/import-jobs/types'
import {
  buildFileId,
  formatBytes,
  getImportStatusLabel,
  getStagedStatusBadgeVariant,
  getStagedStatusLabel,
  inspectStagedFile,
  loadRecentJobIds,
} from '@/features/import-jobs/utils'

const JOB_ITEMS_PAGE_SIZE = 500
const JOB_ITEMS_MAX_PAGES = 200

function isRunningStatus(status: OAuthImportJobSummary['status'] | undefined) {
  return status === 'queued' || status === 'running'
}

function toDisplayStatus(status: OAuthImportJobSummary['status'] | undefined) {
  return isRunningStatus(status) ? 'running' : 'completed'
}

async function loadAllJobItems(jobId: string) {
  const all: OAuthImportJobItem[] = []
  let cursor: number | undefined
  let pages = 0

  while (pages < JOB_ITEMS_MAX_PAGES) {
    const page = await importJobsApi.getJobItems(jobId, {
      cursor,
      limit: JOB_ITEMS_PAGE_SIZE,
    })
    all.push(...page.items)
    cursor = page.next_cursor
    pages += 1
    if (!cursor) {
      break
    }
  }

  return all
}

function formatTopValues(values: string[]) {
  if (values.length === 0) {
    return '-'
  }
  return values.join(' · ')
}

export default function ImportJobs() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const prefersReducedMotion = useReducedMotion()
  const { confirm, confirmDialog } = useConfirmDialog()

  const [isDragging, setIsDragging] = useState(false)
  const [isInspectingFiles, setIsInspectingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [recentJobIds, setRecentJobIds] = useState<string[]>(() => loadRecentJobIds())
  const [stagedFiles, setStagedFiles] = useState<StagedImportFile[]>([])
  const [pausedTrackingJobIds, setPausedTrackingJobIds] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pausedTrackingJobIdSet = useMemo(
    () => new Set(pausedTrackingJobIds),
    [pausedTrackingJobIds],
  )

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => importJobsApi.createJob(files),
    onSuccess: (summary) => {
      setUploadError(null)
      setUploadNotice(
        t('importJobs.precheck.createdNotice', {
          id: summary.job_id,
        }),
      )
      setStagedFiles([])
      setSelectedJobId(summary.job_id)
      setPausedTrackingJobIds((prev) => prev.filter((id) => id !== summary.job_id))
      setRecentJobIds((prev) => {
        const next = [summary.job_id, ...prev.filter((id) => id !== summary.job_id)]
        return next.slice(0, MAX_RECENT_JOBS)
      })
    },
    onError: (error: unknown) => {
      setUploadError(extractApiErrorMessage(error) || t('importJobs.error'))
      setUploadNotice(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => importJobsApi.cancelJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobSummary', jobId] })
    },
  })

  useEffect(() => {
    localStorage.setItem(RECENT_JOBS_STORAGE_KEY, JSON.stringify(recentJobIds))
  }, [recentJobIds])

  const effectiveSelectedJobId = useMemo(() => {
    if (selectedJobId && recentJobIds.includes(selectedJobId)) {
      return selectedJobId
    }
    return recentJobIds[0] ?? null
  }, [recentJobIds, selectedJobId])

  const reviewStats = useMemo(() => {
    let ready = 0
    let warning = 0
    let invalid = 0
    let totalBytes = 0
    let estimatedRecords = 0
    let refreshTokenRecords = 0
    let accessTokenRecords = 0
    let chatgptAccountIdRecords = 0
    let emailRecords = 0

    const baseUrlHints = new Set<string>()
    const sourceTypeHints = new Set<string>()
    const planTypeHints = new Set<string>()

    stagedFiles.forEach((item) => {
      totalBytes += item.file.size
      estimatedRecords += item.metadata.estimatedRecords
      refreshTokenRecords += item.metadata.refreshTokenRecords
      accessTokenRecords += item.metadata.accessTokenRecords
      chatgptAccountIdRecords += item.metadata.chatgptAccountIdRecords
      emailRecords += item.metadata.emailRecords

      item.metadata.baseUrlTop.forEach((value) => {
        if (baseUrlHints.size < 3) {
          baseUrlHints.add(value)
        }
      })
      item.metadata.sourceTypeTop.forEach((value) => {
        if (sourceTypeHints.size < 3) {
          sourceTypeHints.add(value)
        }
      })
      item.metadata.planTypeTop.forEach((value) => {
        if (planTypeHints.size < 3) {
          planTypeHints.add(value)
        }
      })

      if (item.status === 'ready') {
        ready += 1
      } else if (item.status === 'warning') {
        warning += 1
      } else {
        invalid += 1
      }
    })

    return {
      ready,
      warning,
      invalid,
      total: stagedFiles.length,
      totalBytes,
      estimatedRecords,
      refreshTokenRecords,
      accessTokenRecords,
      chatgptAccountIdRecords,
      emailRecords,
      baseUrlHints: [...baseUrlHints],
      sourceTypeHints: [...sourceTypeHints],
      planTypeHints: [...planTypeHints],
    }
  }, [stagedFiles])

  const importableFiles = useMemo(
    () => stagedFiles.filter((item) => item.status !== 'invalid').map((item) => item.file),
    [stagedFiles],
  )

  const stagedColumns = useMemo<ColumnDef<StagedImportFile>[]>(
    () => [
      {
        id: 'file',
        accessorFn: (row) => row.file.name.toLowerCase(),
        header: t('importJobs.workspace.columns.file'),
        cell: ({ row }) => (
          <div className="min-w-[220px]">
            <div className="break-all font-medium">{row.original.file.name}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              .{row.original.extension === 'unknown' ? '-' : row.original.extension}
            </div>
          </div>
        ),
      },
      {
        id: 'size',
        accessorFn: (row) => row.file.size,
        header: t('importJobs.workspace.columns.size'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatBytes(row.original.file.size)}</span>
        ),
      },
      {
        id: 'metadata',
        accessorFn: (row) => row.metadata.estimatedRecords,
        header: t('importJobs.metrics.total'),
        cell: ({ row }) => {
          const metadata = row.original.metadata
          return (
            <div className="min-w-[280px] space-y-1 text-[11px] text-muted-foreground">
              <div className="font-medium text-foreground">
                {t('importJobs.metrics.total')} {metadata.estimatedRecords}
              </div>
              <div>refresh_token: {metadata.refreshTokenRecords}</div>
              <div>access_token: {metadata.accessTokenRecords}</div>
              <div>chatgpt_account_id: {metadata.chatgptAccountIdRecords}</div>
              <div>email: {metadata.emailRecords}</div>
            </div>
          )
        },
      },
      {
        id: 'check',
        accessorFn: (row) => row.checks.join(' ').toLowerCase(),
        header: t('importJobs.workspace.columns.check'),
        cell: ({ row }) => (
          <div className="min-w-[280px] text-muted-foreground">
            <ul className="space-y-1">
              {row.original.checks.slice(0, 2).map((check, index) => (
                <li key={`${row.original.id}-${index}`}>{check}</li>
              ))}
            </ul>
            {row.original.checks.length > 2 ? (
              <div className="mt-1 text-[11px] text-muted-foreground">
                +{row.original.checks.length - 2} {t('importJobs.workspace.moreChecks')}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: t('importJobs.workspace.columns.status'),
        cell: ({ row }) => (
          <Badge variant={getStagedStatusBadgeVariant(row.original.status)}>
            {getStagedStatusLabel(t, row.original.status)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: t('importJobs.workspace.columns.action'),
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="cursor-pointer"
            onClick={() => {
              setStagedFiles((prev) => prev.filter((item) => item.id !== row.original.id))
            }}
          >
            {t('importJobs.actions.remove')}
          </Button>
        ),
      },
    ],
    [t],
  )

  const queueFilesForReview = useCallback(
    async (incomingFiles: File[]) => {
      if (incomingFiles.length === 0) {
        return
      }

      setUploadError(null)
      setUploadNotice(null)

      const existingIds = new Set(stagedFiles.map((item) => item.id))
      const deduped = incomingFiles.filter((file) => !existingIds.has(buildFileId(file)))

      if (deduped.length === 0) {
        setUploadError(t('importJobs.precheck.duplicateBatch'))
        return
      }

      const nameCounts = new Map<string, number>()
      ;[...stagedFiles.map((item) => item.file), ...deduped].forEach((file) => {
        const key = file.name.trim().toLowerCase()
        nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
      })

      setIsInspectingFiles(true)
      try {
        const inspected = await Promise.all(
          deduped.map((file) =>
            inspectStagedFile(file, (nameCounts.get(file.name.trim().toLowerCase()) ?? 0) > 1, t),
          ),
        )
        setStagedFiles((prev) => [...prev, ...inspected])
      } finally {
        setIsInspectingFiles(false)
      }
    },
    [stagedFiles, t],
  )

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) {
        return
      }
      event.preventDefault()
      void queueFilesForReview(files)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [queueFilesForReview])

  const handleDropZoneDrag = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.type === 'dragenter' || event.type === 'dragover') {
        setIsDragging(true)
        return
      }

      if (event.type === 'dragleave') {
        setIsDragging(false)
        return
      }

      if (event.type === 'drop') {
        setIsDragging(false)
        const files = Array.from(event.dataTransfer.files || [])
        if (files.length > 0) {
          void queueFilesForReview(files)
        }
      }
    },
    [queueFilesForReview],
  )

  const handleStartImport = useCallback(() => {
    if (importableFiles.length === 0) {
      setUploadError(t('importJobs.precheck.noneImportable'))
      return
    }
    uploadMutation.mutate(importableFiles)
  }, [importableFiles, t, uploadMutation])

  const handleDownloadTemplate = useCallback(() => {
    const example = {
      email: 'demo@example.com',
      account_id: '00000000-0000-0000-0000-000000000000',
      refresh_token: 'rt_xxx',
      base_url: 'https://chatgpt.com/backend-api/codex',
      enabled: true,
      priority: 100,
    }
    const blob = new Blob([`${JSON.stringify(example)}\n`], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'oauth-import-template.jsonl'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [])

  const recentJobQueries = useQueries({
    queries: recentJobIds.map((jobId) => ({
      queryKey: ['jobSummary', jobId],
      queryFn: () => importJobsApi.getJobSummary(jobId),
      retry: false,
      staleTime: 3000,
      refetchInterval: pausedTrackingJobIdSet.has(jobId) ? false : 3000,
    })),
  })

  const recentJobs = useMemo(() => {
    return recentJobIds.map((jobId, index) => {
      const query = recentJobQueries[index]
      return {
        jobId,
        summary: query?.data,
        isLoading: query?.isLoading ?? false,
        errorMessage: query?.error ? extractApiErrorMessage(query.error) : null,
      }
    })
  }, [recentJobIds, recentJobQueries])

  const selectedJob = useMemo(
    () => recentJobs.find((item) => item.jobId === effectiveSelectedJobId),
    [effectiveSelectedJobId, recentJobs],
  )

  const selectedSummary = selectedJob?.summary
  const selectedDisplayStatus = toDisplayStatus(selectedSummary?.status)
  const selectedIsRunning = selectedDisplayStatus === 'running'
  const selectedTrackingPaused = effectiveSelectedJobId
    ? pausedTrackingJobIdSet.has(effectiveSelectedJobId)
    : false

  const shouldTrackSelectedJob =
    !!effectiveSelectedJobId && selectedIsRunning && !selectedTrackingPaused

  const selectedJobItemsQuery = useQuery({
    queryKey: ['jobItemsAll', effectiveSelectedJobId],
    enabled: !!effectiveSelectedJobId,
    queryFn: () => loadAllJobItems(effectiveSelectedJobId!),
    staleTime: shouldTrackSelectedJob ? 0 : 20000,
    refetchInterval: shouldTrackSelectedJob ? 3000 : false,
  })

  const accountsInPoolQuery = useQuery({
    queryKey: ['upstreamAccountsForImportJobsPoolProgress'],
    enabled: !!effectiveSelectedJobId,
    queryFn: accountsApi.listAccounts,
    staleTime: shouldTrackSelectedJob ? 0 : 20000,
    refetchInterval: shouldTrackSelectedJob ? 4000 : false,
  })

  const poolProgress = useMemo(() => {
    const summary = selectedSummary
    if (!summary) {
      return {
        inPool: 0,
        total: 0,
        percent: 0,
      }
    }

    const targetItems = (selectedJobItemsQuery.data ?? []).filter(
      (item) => !['failed', 'cancelled', 'skipped'].includes(item.status),
    )

    const targetKeys = new Set<string>()
    targetItems.forEach((item) => {
      if (item.account_id) {
        targetKeys.add(`id:${item.account_id}`)
        return
      }
      if (item.chatgpt_account_id) {
        targetKeys.add(`chatgpt:${item.chatgpt_account_id}`)
      }
    })

    const fallbackTotal = Math.max(0, summary.total - summary.failed_count - summary.skipped_count)
    const total = targetKeys.size > 0 ? targetKeys.size : fallbackTotal

    if (total <= 0) {
      return {
        inPool: 0,
        total: 0,
        percent: 0,
      }
    }

    if (targetKeys.size === 0) {
      const fallbackInPool = Math.min(summary.created_count + summary.updated_count, total)
      return {
        inPool: fallbackInPool,
        total,
        percent: (fallbackInPool / total) * 100,
      }
    }

    const accounts = accountsInPoolQuery.data ?? []
    const accountIdSet = new Set(accounts.map((item) => item.id))
    const chatgptAccountIdSet = new Set(
      accounts
        .map((item) => item.chatgpt_account_id?.trim())
        .filter((value): value is string => !!value),
    )

    let inPool = 0
    targetKeys.forEach((key) => {
      if (key.startsWith('id:')) {
        if (accountIdSet.has(key.slice(3))) {
          inPool += 1
        }
        return
      }
      if (key.startsWith('chatgpt:') && chatgptAccountIdSet.has(key.slice(8))) {
        inPool += 1
      }
    })

    return {
      inPool,
      total,
      percent: (inPool / total) * 100,
    }
  }, [accountsInPoolQuery.data, selectedJobItemsQuery.data, selectedSummary])

  const toggleTrackingPaused = useCallback(() => {
    if (!effectiveSelectedJobId) {
      return
    }
    setPausedTrackingJobIds((prev) => {
      if (prev.includes(effectiveSelectedJobId)) {
        return prev.filter((id) => id !== effectiveSelectedJobId)
      }
      return [...prev, effectiveSelectedJobId]
    })
  }, [effectiveSelectedJobId])

  const handleCancelSelectedJob = useCallback(async () => {
    if (!effectiveSelectedJobId) {
      return
    }
    const confirmed = await confirm({
      title: t('importJobs.actions.cancelJob'),
      description: t('importJobs.actions.confirmCancelJob'),
      cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
      confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }
    cancelMutation.mutate(effectiveSelectedJobId)
  }, [cancelMutation, confirm, effectiveSelectedJobId, t])

  return (
    <motion.div
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex-1 space-y-6 overflow-y-auto px-4 py-6 md:px-8 md:py-8"
    >
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
        <div className="pointer-events-none absolute inset-0 opacity-35">
          <Threads color={[0.2, 0.45, 0.95]} amplitude={1.2} distance={0.2} />
        </div>
        <div className="relative z-10 space-y-3 p-6 md:p-8">
          <ShinyText
            text={t('importJobs.title')}
            speed={4}
            className="text-3xl font-bold tracking-tight text-foreground"
            color="#7f8ca5"
            shineColor="#ffffff"
          />
          <p className="max-w-3xl text-sm text-muted-foreground">{t('importJobs.subtitleModern')}</p>
          <p className="text-xs text-muted-foreground">{t('importJobs.dropzone.acceptsNew')}</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <AnimatedContent className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle>{t('importJobs.workspace.title')}</CardTitle>
              <CardDescription>{t('importJobs.workspace.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={cn(
                  'rounded-xl border-2 border-dashed p-6 transition-colors',
                  isDragging ? 'border-primary bg-primary/5' : 'border-border/70 bg-card/60',
                  (uploadMutation.isPending || isInspectingFiles) && 'pointer-events-none opacity-80',
                )}
                onDragEnter={handleDropZoneDrag}
                onDragOver={handleDropZoneDrag}
                onDragLeave={handleDropZoneDrag}
                onDrop={handleDropZoneDrag}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  name="import_files"
                  className="hidden"
                  aria-label={t('importJobs.dropzone.selectFiles')}
                  accept=".json,.jsonl,application/json"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || [])
                    if (files.length > 0) {
                      void queueFilesForReview(files)
                    }
                    event.currentTarget.value = ''
                  }}
                />

                <div className="flex flex-col items-center text-center">
                  {isInspectingFiles ? (
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  ) : (
                    <UploadCloud className="h-10 w-10 text-primary" />
                  )}
                  <h3 className="mt-4 text-lg font-semibold">{t('importJobs.dropzone.titleNew')}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t('importJobs.dropzone.acceptsNew')}</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => fileInputRef.current?.click()}>
                      {t('importJobs.dropzone.selectFiles')}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
                      <HardDriveDownload className="h-4 w-4" />
                      {t('importJobs.template.downloadJsonl')}
                    </Button>
                  </div>
                </div>
              </div>

              {uploadError ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{uploadError}</div>
                </div>
              ) : null}

              {uploadNotice ? (
                <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{uploadNotice}</div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <StatChip
                  label={t('importJobs.workspace.readyFiles', { count: reviewStats.ready })}
                  value={reviewStats.ready}
                  tone="success"
                />
                <StatChip
                  label={t('importJobs.workspace.warningFiles', { count: reviewStats.warning })}
                  value={reviewStats.warning}
                  tone="warning"
                />
                <StatChip
                  label={t('importJobs.workspace.invalidFiles', { count: reviewStats.invalid })}
                  value={reviewStats.invalid}
                  tone="destructive"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <MiniMetric title={t('importJobs.metrics.total')} value={reviewStats.estimatedRecords} />
                <MiniMetric title="refresh_token" value={reviewStats.refreshTokenRecords} />
                <MiniMetric title="access_token" value={reviewStats.accessTokenRecords} />
                <MiniMetric title="chatgpt_account_id" value={reviewStats.chatgptAccountIdRecords} />
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  {t('importJobs.workspace.totalFiles', { count: reviewStats.total })} ·{' '}
                  {t('importJobs.workspace.totalSize', { size: formatBytes(reviewStats.totalBytes) })}
                </div>
                <div>email: {reviewStats.emailRecords}</div>
                <div>base_url: {formatTopValues(reviewStats.baseUrlHints)}</div>
                <div>source_type: {formatTopValues(reviewStats.sourceTypeHints)}</div>
                <div>plan_type: {formatTopValues(reviewStats.planTypeHints)}</div>
              </div>

              <div className="h-[360px]">
                <StandardDataTable
                  columns={stagedColumns}
                  data={stagedFiles}
                  density="compact"
                  defaultPageSize={10}
                  pageSizeOptions={[10, 20, 50]}
                  searchPlaceholder={t('importJobs.detail.searchPlaceholderModern')}
                  searchFn={(row, keyword) => {
                    const haystack = [
                      row.file.name,
                      row.extension,
                      row.status,
                      row.checks.join(' '),
                      row.metadata.baseUrlTop.join(' '),
                      row.metadata.sourceTypeTop.join(' '),
                      row.metadata.planTypeTop.join(' '),
                    ]
                      .join(' ')
                      .toLowerCase()
                    return haystack.includes(keyword)
                  }}
                  emptyText={t('importJobs.workspace.empty')}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={uploadMutation.isPending || isInspectingFiles}
                onClick={handleStartImport}
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('importJobs.dropzone.uploading')}
                  </>
                ) : (
                  t('importJobs.workspace.startImportWithCount', {
                    count: importableFiles.length,
                  })
                )}
              </Button>
            </CardContent>
          </Card>
        </AnimatedContent>

        <AnimatedContent className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle>{t('importJobs.progress.title')}</CardTitle>
              <CardDescription>
                {effectiveSelectedJobId
                  ? t('importJobs.progress.jobIdLabel', { jobId: effectiveSelectedJobId })
                  : t('importJobs.progress.noJobSelected')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!effectiveSelectedJobId ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t('importJobs.progress.noJobSelected')}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={selectedIsRunning ? 'warning' : 'success'}
                      className="uppercase text-[10px]"
                    >
                      {getImportStatusLabel(t, selectedDisplayStatus)}
                    </Badge>
                    <Badge variant={selectedTrackingPaused ? 'secondary' : 'info'}>
                      {selectedTrackingPaused
                        ? t('accounts.actions.pauseGroup', { defaultValue: 'Paused' })
                        : t('importJobs.queue.tracked')}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                      <span>
                        {t('accounts.title', { defaultValue: 'Accounts' })} {poolProgress.inPool}/
                        {poolProgress.total}
                      </span>
                      <span>{poolProgress.percent.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-[width] duration-300"
                        style={{ width: `${Math.min(100, poolProgress.percent)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MiniMetric
                      title={t('accounts.title', { defaultValue: 'Accounts' })}
                      value={`${poolProgress.inPool}/${poolProgress.total}`}
                    />
                    <MiniMetric
                      title={t('importJobs.metrics.status')}
                      value={getImportStatusLabel(t, selectedDisplayStatus)}
                    />
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {selectedJobItemsQuery.isFetching || accountsInPoolQuery.isFetching ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('common.loading')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {t('importJobs.queue.tracked')}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={toggleTrackingPaused}>
                      {selectedTrackingPaused ? (
                        <>
                          <Play className="mr-1 h-3.5 w-3.5" />
                          {t('accounts.actions.resumeGroup', { defaultValue: 'Resume' })}
                        </>
                      ) : (
                        <>
                          <Pause className="mr-1 h-3.5 w-3.5" />
                          {t('accounts.actions.pauseGroup', { defaultValue: 'Pause' })}
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedIsRunning || cancelMutation.isPending}
                      onClick={() => {
                        void handleCancelSelectedJob()
                      }}
                    >
                      {cancelMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          {t('importJobs.actions.cancel')}
                        </>
                      ) : (
                        <>
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          {t('importJobs.actions.cancelJob')}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle>{t('importJobs.queue.titleRecent')}</CardTitle>
              <CardDescription>{t('importJobs.queue.descRecent')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentJobs.length === 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('importJobs.queue.emptyRecent')}
                </div>
              ) : (
                recentJobs.map((item) => {
                  const status = toDisplayStatus(item.summary?.status)
                  const selected = item.jobId === effectiveSelectedJobId
                  return (
                    <button
                      type="button"
                      key={item.jobId}
                      className={cn(
                        'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5',
                      )}
                      onClick={() => setSelectedJobId(item.jobId)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs">{item.jobId}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {item.summary
                              ? `${item.summary.processed}/${item.summary.total}`
                              : item.isLoading
                                ? t('common.loading')
                                : item.errorMessage ?? t('importJobs.messages.queryFailed')}
                          </div>
                        </div>
                        <Badge
                          variant={status === 'running' ? 'warning' : 'success'}
                          className="uppercase text-[10px]"
                        >
                          {getImportStatusLabel(t, status)}
                        </Badge>
                      </div>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>
        </AnimatedContent>
      </div>

      {confirmDialog}
    </motion.div>
  )
}

function MiniMetric({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <div className="text-[11px] text-muted-foreground">{title}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'warning' | 'destructive'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-xs',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 text-[11px]">{value}</div>
    </div>
  )
}
