import type { OAuthImportJobSummary } from '@/api/importJobs'
import type { ConfirmDialogOptions } from '@/components/ui/confirm-dialog'

export const RECENT_JOBS_STORAGE_KEY = 'codex-pool.import-jobs.recent'
export const MAX_RECENT_JOBS = 20
export const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024
export const JSONL_PREVIEW_BYTES = 64 * 1024
export const JSON_PARSE_LIMIT_BYTES = 2 * 1024 * 1024

export type StagedFileStatus = 'ready' | 'warning' | 'invalid'
export type StagedFileExtension = 'json' | 'jsonl' | 'unknown'

export interface StagedImportFile {
  id: string
  file: File
  status: StagedFileStatus
  checks: string[]
  extension: StagedFileExtension
}

export interface RecentJobRow {
  job_id: string
  summary?: OAuthImportJobSummary
  errorMessage?: string
  isLoading: boolean
  isError: boolean
}

export type ConfirmAction = (options: ConfirmDialogOptions) => Promise<boolean>
