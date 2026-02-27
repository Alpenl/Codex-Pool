import { extractApiErrorStatus } from '@/api/client'

const DEFAULT_CONCURRENCY = 8
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_BASE_DELAY_MS = 250

type BatchFailureItem = {
  accountId: string
  error: unknown
}

type BatchSuccessItem<TResult> = {
  accountId: string
  value: TResult
}

export interface BatchExecuteResult<TResult> {
  successes: BatchSuccessItem<TResult>[]
  failures: BatchFailureItem[]
}

export interface BatchExecuteOptions {
  concurrency?: number
  maxRetries?: number
  retryBaseDelayMs?: number
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function shouldRetryBatchError(error: unknown) {
  const status = extractApiErrorStatus(error)
  if (status !== null) {
    return status === 408 || status === 425 || status === 429 || status >= 500
  }

  const code = (error as { code?: string } | undefined)?.code
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_NETWORK'
}

async function executeWithRetry<TResult>(
  worker: () => Promise<TResult>,
  options: Required<BatchExecuteOptions>,
) {
  let attempt = 0
  while (true) {
    try {
      return await worker()
    } catch (error) {
      if (attempt >= options.maxRetries || !shouldRetryBatchError(error)) {
        throw error
      }
      const delay = options.retryBaseDelayMs * (2 ** attempt)
      attempt += 1
      await sleep(delay)
    }
  }
}

export async function executeAccountBatch<TResult>(
  accountIds: string[],
  worker: (accountId: string) => Promise<TResult>,
  options?: BatchExecuteOptions,
): Promise<BatchExecuteResult<TResult>> {
  if (accountIds.length === 0) {
    return { successes: [], failures: [] }
  }

  const normalizedOptions: Required<BatchExecuteOptions> = {
    concurrency: Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY),
    maxRetries: Math.max(0, options?.maxRetries ?? DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: Math.max(0, options?.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS),
  }

  let nextIndex = 0
  const successes: BatchSuccessItem<TResult>[] = []
  const failures: BatchFailureItem[] = []

  const workerCount = Math.min(normalizedOptions.concurrency, accountIds.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex
        nextIndex += 1
        if (currentIndex >= accountIds.length) {
          return
        }

        const accountId = accountIds[currentIndex]
        try {
          const value = await executeWithRetry(
            () => worker(accountId),
            normalizedOptions,
          )
          successes.push({ accountId, value })
        } catch (error) {
          failures.push({ accountId, error })
        }
      }
    }),
  )

  return { successes, failures }
}
