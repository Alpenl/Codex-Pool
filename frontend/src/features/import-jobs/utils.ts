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
  type StagedImportMetadata,
  type StagedFileStatus,
  type StagedImportFile,
} from './types'

const METADATA_MAX_RECORDS = 500
const JSONL_METADATA_READ_LIMIT_BYTES = 4 * 1024 * 1024

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

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function readValueByPath(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record
  for (const key of path) {
    const currentObject = asObject(current)
    if (!currentObject || !(key in currentObject)) {
      return undefined
    }
    current = currentObject[key]
  }
  return current
}

function pickFirstString(record: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = asString(readValueByPath(record, path))
    if (value) {
      return value
    }
  }
  return undefined
}

function summarizeTopValues(counter: Map<string, number>, limit = 3): string[] {
  if (counter.size === 0) {
    return []
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value} (${count})`)
}

function collectMetadata(
  records: Record<string, unknown>[],
  estimatedRecords: number,
): StagedImportMetadata {
  let refreshTokenRecords = 0
  let accessTokenRecords = 0
  let chatgptAccountIdRecords = 0
  let emailRecords = 0

  const baseUrlCounter = new Map<string, number>()
  const sourceTypeCounter = new Map<string, number>()
  const planTypeCounter = new Map<string, number>()

  const refreshTokenPaths = [
    ['refresh_token'],
    ['refreshToken'],
    ['rt'],
    ['refreshTokenPlaintext'],
    ['token_info', 'refresh_token'],
    ['tokens', 'refresh_token'],
    ['oauth', 'refresh_token'],
    ['auth', 'refresh_token'],
  ]
  const accessTokenPaths = [
    ['access_token'],
    ['accessToken'],
    ['token'],
    ['bearer_token'],
    ['token_info', 'access_token'],
    ['tokens', 'access_token'],
    ['oauth', 'access_token'],
    ['auth', 'access_token'],
  ]
  const chatgptAccountIdPaths = [
    ['chatgpt_account_id'],
    ['chatgptAccountId'],
    ['account_id'],
    ['accountId'],
    ['token_info', 'chatgpt_account_id'],
  ]
  const emailPaths = [['email'], ['mail'], ['username'], ['user_email']]
  const baseUrlPaths = [['base_url'], ['baseUrl'], ['endpoint'], ['upstream_base_url']]
  const sourceTypePaths = [['source_type'], ['sourceType'], ['type'], ['provider_type']]
  const planTypePaths = [
    ['chatgpt_plan_type'],
    ['token_info', 'chatgpt_plan_type'],
    ['openai_auth', 'chatgpt_plan_type'],
    ['https://api.openai.com/auth', 'chatgpt_plan_type'],
  ]

  for (const record of records) {
    if (pickFirstString(record, refreshTokenPaths)) {
      refreshTokenRecords += 1
    }
    if (pickFirstString(record, accessTokenPaths)) {
      accessTokenRecords += 1
    }
    if (pickFirstString(record, chatgptAccountIdPaths)) {
      chatgptAccountIdRecords += 1
    }
    if (pickFirstString(record, emailPaths)) {
      emailRecords += 1
    }

    const baseUrl = pickFirstString(record, baseUrlPaths)
    if (baseUrl) {
      baseUrlCounter.set(baseUrl, (baseUrlCounter.get(baseUrl) ?? 0) + 1)
    }

    const sourceType = pickFirstString(record, sourceTypePaths)
    if (sourceType) {
      sourceTypeCounter.set(sourceType, (sourceTypeCounter.get(sourceType) ?? 0) + 1)
    }

    const planType = pickFirstString(record, planTypePaths)
    if (planType) {
      planTypeCounter.set(planType, (planTypeCounter.get(planType) ?? 0) + 1)
    }
  }

  return {
    parsedRecords: records.length,
    estimatedRecords: Math.max(estimatedRecords, records.length),
    refreshTokenRecords,
    accessTokenRecords,
    chatgptAccountIdRecords,
    emailRecords,
    baseUrlTop: summarizeTopValues(baseUrlCounter),
    sourceTypeTop: summarizeTopValues(sourceTypeCounter),
    planTypeTop: summarizeTopValues(planTypeCounter),
  }
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
  const sampleRecords: Record<string, unknown>[] = []
  let estimatedRecords = 0

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
      const shouldReadMore = file.size <= JSONL_METADATA_READ_LIMIT_BYTES
      const raw = await file
        .slice(0, shouldReadMore ? file.size : JSONL_PREVIEW_BYTES)
        .text()
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      if (shouldReadMore) {
        estimatedRecords = lines.length
      } else if (lines.length > 0) {
        const avgLineBytes = Math.max(1, raw.length / lines.length)
        estimatedRecords = Math.max(lines.length, Math.floor(file.size / avgLineBytes))
      }

      const firstDataLine = lines[0]

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

      for (const line of lines) {
        if (sampleRecords.length >= METADATA_MAX_RECORDS) {
          break
        }
        try {
          const parsed = JSON.parse(line)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            sampleRecords.push(parsed as Record<string, unknown>)
          }
        } catch {
          continue
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
          estimatedRecords = 0
        } else {
          checks.push(t('importJobs.precheck.jsonValid'))
          if (Array.isArray(parsed)) {
            estimatedRecords = parsed.length
            parsed.forEach((item) => {
              if (
                sampleRecords.length < METADATA_MAX_RECORDS
                && item
                && typeof item === 'object'
                && !Array.isArray(item)
              ) {
                sampleRecords.push(item as Record<string, unknown>)
              }
            })
          } else if (typeof parsed === 'object') {
            estimatedRecords = 1
            sampleRecords.push(parsed as Record<string, unknown>)
          } else {
            estimatedRecords = 0
          }
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

  const metadata = collectMetadata(sampleRecords, estimatedRecords)

  return {
    id: buildFileId(file),
    file,
    status,
    checks,
    extension,
    metadata,
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
