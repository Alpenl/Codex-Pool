import type { TFunction } from 'i18next'

import type {
  OAuthImportItemStatus,
  OAuthImportJobSummary,
} from '@/api/importJobs'

import {
  JSON_PARSE_LIMIT_BYTES,
  JSONL_PREVIEW_BYTES,
  MAX_RECENT_JOBS,
  MAX_UPLOAD_FILE_BYTES,
  RECENT_JOBS_STORAGE_KEY,
  type StagedFileExtension,
  type StagedFileStatus,
  type StagedImportFile,
} from './types'

export function getImportStatusLabel(t: TFunction, status: string) {
  switch (status) {
    case 'all':
      return t('importJobs.status.all')
    case 'queued':
      return t('importJobs.status.queued')
    case 'running':
      return t('importJobs.status.running')
    case 'completed':
      return t('importJobs.status.completed')
    case 'pending':
      return t('importJobs.status.pending')
    case 'processing':
      return t('importJobs.status.processing')
    case 'created':
      return t('importJobs.status.created')
    case 'updated':
      return t('importJobs.status.updated')
    case 'failed':
      return t('importJobs.status.failed')
    case 'skipped':
      return t('importJobs.status.skipped')
    case 'cancelled':
      return t('importJobs.status.cancelled')
    default:
      return status
  }
}

export function getImportStatusFilterOptions(
  t: TFunction,
): Array<{ value: OAuthImportItemStatus | 'all'; label: string }> {
  return [
    { value: 'all', label: getImportStatusLabel(t, 'all') },
    { value: 'pending', label: getImportStatusLabel(t, 'pending') },
    { value: 'processing', label: getImportStatusLabel(t, 'processing') },
    { value: 'created', label: getImportStatusLabel(t, 'created') },
    { value: 'updated', label: getImportStatusLabel(t, 'updated') },
    { value: 'failed', label: getImportStatusLabel(t, 'failed') },
    { value: 'skipped', label: getImportStatusLabel(t, 'skipped') },
    { value: 'cancelled', label: getImportStatusLabel(t, 'cancelled') },
  ]
}

export function loadRecentJobIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_JOBS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string').slice(0, MAX_RECENT_JOBS)
  } catch {
    return []
  }
}

export function buildFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function getFileExtension(fileName: string): StagedFileExtension {
  if (fileName.toLowerCase().endsWith('.jsonl')) {
    return 'jsonl'
  }
  if (fileName.toLowerCase().endsWith('.json')) {
    return 'json'
  }
  return 'unknown'
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function strongerStagedStatus(
  current: StagedFileStatus,
  next: StagedFileStatus,
): StagedFileStatus {
  const rank: Record<StagedFileStatus, number> = {
    ready: 0,
    warning: 1,
    invalid: 2,
  }
  return rank[next] > rank[current] ? next : current
}

export function getStagedStatusLabel(t: TFunction, status: StagedFileStatus) {
  if (status === 'ready') {
    return t('importJobs.precheck.status.ready')
  }
  if (status === 'warning') {
    return t('importJobs.precheck.status.warning')
  }
  return t('importJobs.precheck.status.invalid')
}

export function getStagedStatusBadgeVariant(
  status: StagedFileStatus,
): 'success' | 'warning' | 'destructive' {
  if (status === 'ready') return 'success'
  if (status === 'warning') return 'warning'
  return 'destructive'
}

export async function inspectStagedFile(
  file: File,
  hasDuplicateName: boolean,
  t: TFunction,
): Promise<StagedImportFile> {
  let status: StagedFileStatus = 'ready'
  const checks: string[] = []
  const extension = getFileExtension(file.name)

  if (extension === 'unknown') {
    status = strongerStagedStatus(status, 'invalid')
    checks.push(
      t('importJobs.validation.unsupportedFormat', {
        name: file.name,
      }),
    )
  }

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    status = strongerStagedStatus(status, 'invalid')
    checks.push(
      t('importJobs.validation.fileTooLarge', {
        name: file.name,
      }),
    )
  }

  if (hasDuplicateName) {
    status = strongerStagedStatus(status, 'warning')
    checks.push(t('importJobs.precheck.duplicateName'))
  }

  if (status !== 'invalid' && extension === 'jsonl') {
    try {
      const preview = await file.slice(0, JSONL_PREVIEW_BYTES).text()
      const firstDataLine = preview
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0)

      if (!firstDataLine) {
        status = strongerStagedStatus(status, 'warning')
        checks.push(t('importJobs.precheck.emptyPreview'))
      } else {
        const parsed = JSON.parse(firstDataLine)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          status = strongerStagedStatus(status, 'warning')
          checks.push(t('importJobs.precheck.firstLineObject'))
        } else {
          checks.push(t('importJobs.precheck.firstLineValid'))
        }
      }
    } catch {
      status = strongerStagedStatus(status, 'warning')
      checks.push(t('importJobs.precheck.firstLineInvalid'))
    }
  }

  if (status !== 'invalid' && extension === 'json') {
    if (file.size <= JSON_PARSE_LIMIT_BYTES) {
      try {
        const raw = await file.text()
        const parsed = JSON.parse(raw)
        if (!parsed) {
          status = strongerStagedStatus(status, 'warning')
          checks.push(t('importJobs.precheck.jsonEmpty'))
        } else {
          checks.push(t('importJobs.precheck.jsonValid'))
        }
      } catch {
        status = strongerStagedStatus(status, 'warning')
        checks.push(t('importJobs.precheck.jsonInvalid'))
      }
    } else {
      checks.push(t('importJobs.precheck.skipLargeJson'))
    }
  }

  if (checks.length === 0) {
    checks.push(t('importJobs.precheck.defaultReady'))
  }

  return {
    id: buildFileId(file),
    file,
    status,
    checks,
    extension,
  }
}

export function calcProgress(summary: OAuthImportJobSummary | undefined) {
  if (!summary || summary.total <= 0) {
    return 0
  }
  return Math.min(100, (summary.processed / summary.total) * 100)
}

export function getEtaLabel(summary: OAuthImportJobSummary | undefined, t: TFunction) {
  if (!summary || !summary.throughput_per_min || summary.throughput_per_min <= 0) {
    return '-'
  }
  const remaining = Math.max(0, summary.total - summary.processed)
  if (remaining <= 0) {
    return t('importJobs.progress.done')
  }
  const etaMinutes = remaining / summary.throughput_per_min
  if (etaMinutes < 1) {
    return t('importJobs.progress.lessThanMinute')
  }
  return t('importJobs.progress.etaMinutes', {
    count: Math.ceil(etaMinutes),
  })
}
