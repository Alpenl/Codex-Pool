import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import {
  AlertCircle,
  HardDriveDownload,
  Loader2,
  PlayCircle,
  UploadCloud,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { importJobsApi } from '@/api/importJobs'
import { extractApiErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import { cn } from '@/lib/utils'

import { JobDetailPanel, LiveProgressPanel } from '@/features/import-jobs/panels'
import {
  MAX_RECENT_JOBS,
  RECENT_JOBS_STORAGE_KEY,
  type RecentJobRow,
  type StagedImportFile,
} from '@/features/import-jobs/types'
import {
  buildFileId,
  calcProgress,
  formatBytes,
  getImportStatusLabel,
  getStagedStatusBadgeVariant,
  getStagedStatusLabel,
  inspectStagedFile,
  loadRecentJobIds,
} from '@/features/import-jobs/utils'

export default function ImportJobs() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const prefersReducedMotion = useReducedMotion()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [isDragging, setIsDragging] = useState(false)
  const [isInspectingFiles, setIsInspectingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [manualJobId, setManualJobId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [recentJobIds, setRecentJobIds] = useState<string[]>(() => loadRecentJobIds())
  const [stagedFiles, setStagedFiles] = useState<StagedImportFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setRecentJobIds((prev) => {
        const next = [summary.job_id, ...prev.filter((id) => id !== summary.job_id)].slice(0, MAX_RECENT_JOBS)
        return next
      })
      setSelectedJobId(summary.job_id)
    },
    onError: (err: unknown) => {
      setUploadError(extractApiErrorMessage(err) || t('importJobs.error'))
      setUploadNotice(null)
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
  }, [selectedJobId, recentJobIds])

  const reviewStats = useMemo(() => {
    let ready = 0
    let warning = 0
    let invalid = 0
    let totalBytes = 0

    stagedFiles.forEach((item) => {
      totalBytes += item.file.size
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
            <div className="font-medium break-all">{row.original.file.name}</div>
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
              <div className="mt-1 text-[11px]">
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
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="cursor-pointer"
              onClick={() => {
                setStagedFiles((prev) => prev.filter((candidate) => candidate.id !== row.original.id))
              }}
            >
              {t('importJobs.actions.remove')}
            </Button>
          </div>
        ),
      },
    ],
    [t],
  )

  const retryRecentJobMutation = useMutation({
    mutationFn: (jobId: string) => importJobsApi.retryFailed(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobSummary', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobItems', jobId] })
    },
  })

  const cancelRecentJobMutation = useMutation({
    mutationFn: (jobId: string) => importJobsApi.cancelJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobSummary', jobId] })
    },
  })

  const recentJobQueries = useQueries({
    queries: recentJobIds.map((jobId) => ({
      queryKey: ['jobSummary', jobId],
      queryFn: () => importJobsApi.getJobSummary(jobId),
      retry: false,
      staleTime: 180000,
      refetchInterval: 180000,
    })),
  })

  const recentJobs = useMemo<RecentJobRow[]>(() => {
    return recentJobIds.map((jobId, index) => {
      const query = recentJobQueries[index]
      return {
        job_id: jobId,
        summary: query?.data,
        errorMessage: query?.error ? (extractApiErrorMessage(query.error) ?? undefined) : undefined,
        isLoading: query?.isLoading ?? false,
        isError: query?.isError ?? false,
      }
    })
  }, [recentJobIds, recentJobQueries])

  const recentJobColumns = useMemo<ColumnDef<RecentJobRow>[]>(
    () => [
      {
        id: 'job_id',
        accessorFn: (row) => row.job_id.toLowerCase(),
        header: t('importJobs.queue.columns.jobId', { defaultValue: 'Job ID' }),
        cell: ({ row }) => (
          <div className="min-w-[220px]">
            <div className="truncate font-mono text-xs font-medium">{row.original.job_id}</div>
            {row.original.isError ? (
              <div className="mt-1 truncate text-[11px] text-destructive">
                {row.original.errorMessage ?? t('importJobs.messages.unknownError')}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.summary?.status ?? 'queued',
        header: t('importJobs.metrics.status'),
        cell: ({ row }) => {
          if (row.original.isLoading) {
            return (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('common.loading')}
              </span>
            )
          }
          if (row.original.isError || !row.original.summary) {
            if (row.original.isError) {
              return (
                <Badge variant="destructive">
                  {t('importJobs.messages.queryFailed', { defaultValue: 'Query Failed' })}
                </Badge>
              )
            }
            return <Badge variant="destructive">{t('importJobs.messages.jobNotFound')}</Badge>
          }
          const status = row.original.summary.status
          const statusVariant =
            status === 'completed'
              ? 'success'
              : status === 'failed' || status === 'cancelled'
                ? 'destructive'
                : 'warning'
          return (
            <Badge variant={statusVariant} className="uppercase text-[10px]">
              {getImportStatusLabel(t, status)}
            </Badge>
          )
        },
      },
      {
        id: 'progress',
        accessorFn: (row) => calcProgress(row.summary),
        header: t('importJobs.metrics.processed'),
        cell: ({ row }) => {
          if (!row.original.summary) {
            return <span className="text-xs text-muted-foreground">-</span>
          }
          const summary = row.original.summary
          return (
            <span className="text-xs text-muted-foreground tabular-nums">
              {summary.processed}/{summary.total}
            </span>
          )
        },
      },
      {
        id: 'failed',
        accessorFn: (row) => row.summary?.failed_count ?? 0,
        header: t('importJobs.metrics.failed'),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.summary?.failed_count ?? '-'}</span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: t('accounts.columns.actions'),
        cell: ({ row }) => {
          const summary = row.original.summary
          const isRunning = summary?.status === 'running' || summary?.status === 'queued'
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                size="xs"
                variant={effectiveSelectedJobId === row.original.job_id ? 'default' : 'outline'}
                onClick={() => setSelectedJobId(row.original.job_id)}
              >
                {effectiveSelectedJobId === row.original.job_id
                  ? t('common.confirm')
                  : t('common.edit')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={!summary || summary.failed_count <= 0 || retryRecentJobMutation.isPending}
                onClick={() => retryRecentJobMutation.mutate(row.original.job_id)}
              >
                {t('importJobs.actions.retryFailed')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={!summary || !isRunning || cancelRecentJobMutation.isPending}
                onClick={() => {
                  void (async () => {
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
                    cancelRecentJobMutation.mutate(row.original.job_id)
                  })()
                }}
              >
                {t('importJobs.actions.cancel')}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setRecentJobIds((prev) => prev.filter((item) => item !== row.original.job_id))
                }
              >
                {t('importJobs.actions.remove')}
              </Button>
            </div>
          )
        },
      },
    ],
    [cancelRecentJobMutation, confirm, effectiveSelectedJobId, retryRecentJobMutation, t],
  )

  const queueFilesForReview = useCallback(async (incomingFiles: File[]) => {
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
  }, [stagedFiles, t])

  const handleDropZoneDrag = useCallback((event: React.DragEvent<HTMLDivElement>) => {
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
  }, [queueFilesForReview])

  const addRecentJobId = () => {
    const jobId = manualJobId.trim()
    if (!jobId) {
      return
    }
    setRecentJobIds((prev) => [jobId, ...prev.filter((id) => id !== jobId)].slice(0, MAX_RECENT_JOBS))
    setSelectedJobId(jobId)
    setManualJobId('')
  }

  const handleStartImport = () => {
    if (importableFiles.length === 0) {
      setUploadError(t('importJobs.precheck.noneImportable'))
      return
    }
    uploadMutation.mutate(importableFiles)
  }

  const downloadTemplate = () => {
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
  }

  const container = prefersReducedMotion
    ? undefined
    : {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    }

  const item = prefersReducedMotion
    ? undefined
    : {
      hidden: { opacity: 0, y: 12 },
      show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 280, damping: 26 },
      },
    }

  return (
    <motion.div
      variants={container}
      initial={prefersReducedMotion ? undefined : 'hidden'}
      animate={prefersReducedMotion ? undefined : 'show'}
      className="flex-1 px-4 py-6 md:px-8 md:py-8 overflow-y-auto space-y-6"
    >
      <motion.div variants={item} className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{t('importJobs.title')}</h2>
        <p className="text-muted-foreground">{t('importJobs.subtitleModern')}</p>
      </motion.div>

      <motion.div
        variants={item}
        className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
      >
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>{t('importJobs.workspace.title')}</CardTitle>
              <CardDescription>{t('importJobs.workspace.desc')}</CardDescription>
            </div>
            <div className="flex items-start gap-0 sm:gap-0">
              <div className="flex flex-1 flex-col items-center text-center rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-xs">
                <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
                  1
                </span>
                <div className="font-medium">{t('importJobs.workspace.stepSelect')}</div>
                <div className="mt-1 text-muted-foreground">{t('importJobs.dropzone.selectFiles')}</div>
              </div>
              <div className="hidden sm:flex items-center self-center">
                <div className="h-px w-6 bg-border" />
              </div>
              <div className="flex flex-1 flex-col items-center text-center rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-xs">
                <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
                  2
                </span>
                <div className="font-medium">{t('importJobs.workspace.stepCheck')}</div>
                <div className="mt-1 text-muted-foreground">
                  {t('importJobs.workspace.stepCheckDesc')}
                </div>
              </div>
              <div className="hidden sm:flex items-center self-center">
                <div className="h-px w-6 bg-border" />
              </div>
              <div className="flex flex-1 flex-col items-center text-center rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-xs">
                <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
                  3
                </span>
                <div className="font-medium">{t('importJobs.workspace.stepImport')}</div>
                <div className="mt-1 text-muted-foreground">
                  {t('importJobs.workspace.stepImportDesc')}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div
              className={cn(
                'rounded-xl border-2 border-dashed p-6 sm:p-8 transition-colors',
                isDragging ? 'border-primary bg-primary/5' : 'border-border/70 bg-card/60',
                (uploadMutation.isPending || isInspectingFiles) && 'opacity-80 pointer-events-none',
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
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                ) : (
                  <UploadCloud className="h-10 w-10 text-primary" />
                )}
                <h3 className="mt-4 text-lg font-semibold">{t('importJobs.dropzone.titleNew')}</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                  {t('importJobs.dropzone.acceptsNew')}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    className="cursor-pointer"
                    onClick={() => {
                      fileInputRef.current?.click()
                    }}
                  >
                    {t('importJobs.dropzone.selectFiles')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={downloadTemplate}
                  >
                    <HardDriveDownload className="h-4 w-4" />
                    {t('importJobs.template.downloadJsonl')}
                  </Button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {uploadError ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2"
                  aria-live="polite"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>{uploadError}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {uploadNotice ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-md border border-success/30 bg-success-muted px-4 py-3 text-sm text-success-foreground"
                  aria-live="polite"
                >
                  {uploadNotice}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                {t('importJobs.workspace.totalFiles', { count: reviewStats.total })}
              </Badge>
              <Badge variant="success">
                {t('importJobs.workspace.readyFiles', { count: reviewStats.ready })}
              </Badge>
              <Badge variant="warning">
                {t('importJobs.workspace.warningFiles', { count: reviewStats.warning })}
              </Badge>
              <Badge variant="destructive">
                {t('importJobs.workspace.invalidFiles', { count: reviewStats.invalid })}
              </Badge>
              <span className="text-muted-foreground">
                {t('importJobs.workspace.totalSize', {
                  size: formatBytes(reviewStats.totalBytes),
                })}
              </span>
            </div>

            <div className="h-[320px]">
              <StandardDataTable
                columns={stagedColumns}
                data={stagedFiles}
                density="compact"
                defaultPageSize={10}
                pageSizeOptions={[10, 20, 50]}
                emptyText={t('importJobs.workspace.empty')}
                searchFn={(row, keyword) => {
                  const haystack =
                    `${row.file.name} ${row.checks.join(' ')} ${row.extension}`.toLowerCase()
                  return haystack.includes(keyword)
                }}
              />
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-muted-foreground">
                {reviewStats.invalid > 0
                  ? t('importJobs.workspace.invalidHint', {
                    count: reviewStats.invalid,
                  })
                  : t('importJobs.workspace.readyHint')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={stagedFiles.length === 0 || uploadMutation.isPending}
                  onClick={() => {
                    void (async () => {
                      const confirmed = await confirm({
                        title: t('importJobs.workspace.clearQueue'),
                        description: t('importJobs.workspace.confirmClear'),
                        cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
                        confirmText: t('common.confirm', { defaultValue: 'Confirm' }),
                        variant: 'destructive',
                      })
                      if (!confirmed) {
                        return
                      }
                      setStagedFiles([])
                      setUploadError(null)
                      setUploadNotice(null)
                    })()
                  }}
                >
                  {t('importJobs.workspace.clearQueue')}
                </Button>
                <Button
                  type="button"
                  className="cursor-pointer"
                  disabled={
                    uploadMutation.isPending || isInspectingFiles || importableFiles.length === 0
                  }
                  onClick={handleStartImport}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  {uploadMutation.isPending
                    ? t('importJobs.dropzone.creatingTitle')
                    : t('importJobs.workspace.startImportWithCount', {
                      count: importableFiles.length,
                    })}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 min-w-0">
          <LiveProgressPanel jobId={effectiveSelectedJobId} confirmAction={confirm} />

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                {t('importJobs.queue.titleRecent')}
                <Badge variant="secondary" className="font-mono text-[10px] rounded-full">
                  {recentJobIds.length} {t('importJobs.queue.tracked')}
                </Badge>
              </CardTitle>
              <CardDescription>{t('importJobs.queue.descRecent')}</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px] min-h-0">
              <StandardDataTable
                columns={recentJobColumns}
                data={recentJobs}
                density="compact"
                defaultPageSize={8}
                pageSizeOptions={[8, 16, 32]}
                emptyText={t('importJobs.queue.emptyRecent')}
                searchFn={(row, keyword) => {
                  const status = row.summary?.status ?? ''
                  return `${row.job_id} ${status}`.toLowerCase().includes(keyword)
                }}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-6 space-y-3">
              <label htmlFor="manual-job-id" className="text-sm font-medium">
                {t('importJobs.manual.title')}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="manual-job-id"
                  name="manual_job_id"
                  value={manualJobId}
                  onChange={(event) => setManualJobId(event.target.value)}
                  placeholder={t('importJobs.manual.placeholderModern')}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                <Button type="button" className="cursor-pointer" onClick={addRecentJobId}>
                  {t('importJobs.manual.add')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      <motion.div variants={item}>
        <JobDetailPanel jobId={effectiveSelectedJobId} confirmAction={confirm} />
      </motion.div>
      {confirmDialog}
    </motion.div>
  )
}
