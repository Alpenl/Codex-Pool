import type { OAuthAccountStatusResponse, UpstreamAccount } from '@/api/accounts'

export type StatusFilter = 'all' | 'active' | 'disabled'
export type ModeFilter = 'all' | 'oauth' | 'api_key'
export type CredentialFilter = 'all' | 'rt' | 'at' | 'unknown'
export type RateLimitBucket = 'five_hours' | 'one_week' | 'github'
export type PlanFilter = 'all' | string
export type CredentialKindShort = 'rt' | 'at' | 'unknown'
export type ToggleAccountPayload = { accountId: string; enabled: boolean }
export type AccountDetailTab = 'profile' | 'oauth' | 'limits' | 'raw'
export type AccountBatchAction =
  | 'enable'
  | 'disable'
  | 'delete'
  | 'refreshLogin'
  | 'pauseFamily'
  | 'resumeFamily'

export const SESSION_MODES = new Set(['chat_gpt_session', 'codex_oauth'])
export const PLAN_UNKNOWN_VALUE = '__unknown__'
export const RATE_LIMIT_BUCKET_ORDER: RateLimitBucket[] = ['five_hours', 'one_week', 'github']
export const EMPTY_ACCOUNTS: UpstreamAccount[] = []
export const EMPTY_OAUTH_STATUSES: OAuthAccountStatusResponse[] = []
export const RECENT_IMPORT_JOBS_STORAGE_KEY = 'codex-pool.import-jobs.recent'
export const MAX_RECENT_IMPORT_JOBS = 20

export interface RateLimitDisplay {
  bucket: RateLimitBucket
  remainingPercent: number
  resetsAt?: string
}
