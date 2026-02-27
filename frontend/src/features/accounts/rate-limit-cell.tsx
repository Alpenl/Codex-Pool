import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { OAuthAccountStatusResponse } from '@/api/accounts'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import {
  bucketBarClass,
  bucketLabel,
  clampPercent,
  extractRateLimitDisplays,
  formatRateLimitResetText,
  sortRateLimitDisplays,
} from './utils'

type RateLimitCellProps = {
  status?: OAuthAccountStatusResponse
  locale: string
  refreshing: boolean
}

export function RateLimitCell({ status, locale, refreshing }: RateLimitCellProps) {
  const { t } = useTranslation()
  const wrapperClass = 'flex w-[360px] min-w-0 min-h-[38px] flex-col justify-center gap-1'
  const displays = sortRateLimitDisplays(extractRateLimitDisplays(status))
  const primary = displays[0]
  const remainingCount = Math.max(0, displays.length - 1)

  if (displays.length === 0 && !refreshing) {
    return (
      <div className={wrapperClass}>
        <span className="text-xs text-muted-foreground">{t('accounts.rateLimits.unavailable')}</span>
      </div>
    )
  }

  if (refreshing) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 flex-1 rounded-sm" />
          <Skeleton className="h-6 w-10 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-1.5 flex-1 rounded-full" />
        </div>
      </div>
    )
  }

  if (!primary) {
    return (
      <div className={wrapperClass}>
        <span className="text-xs text-muted-foreground">{t('accounts.rateLimits.unavailable')}</span>
      </div>
    )
  }

  const primaryRemaining = clampPercent(primary.remainingPercent)
  const weeklyOrFallback = displays.find((item) => item.bucket === 'one_week') ?? primary
  const weeklyRemaining = clampPercent(weeklyOrFallback.remainingPercent)
  const primarySummary = `${bucketLabel(primary.bucket, t)} · ${t('accounts.rateLimits.remainingPrefix', { defaultValue: 'Remaining' })} ${primaryRemaining.toFixed(1)}% · ${formatRateLimitResetText({
    resetsAt: primary.resetsAt,
    locale,
    t,
  })}`

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={primarySummary}>
          {primarySummary}
        </span>
        {remainingCount > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                aria-label={t('accounts.rateLimits.moreDetails', {
                  count: remainingCount,
                  defaultValue: `+${remainingCount} more`,
                })}
              >
                +{remainingCount}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[420px] space-y-2 p-2">
              {displays.map((item) => {
                const remaining = clampPercent(item.remainingPercent)
                const used = clampPercent(100 - remaining)
                return (
                  <div key={item.bucket} className="rounded-md border border-border/50 bg-muted/20 p-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-foreground">{bucketLabel(item.bucket, t)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {t('accounts.rateLimits.remainingPrefix', { defaultValue: 'Remaining' })}{' '}
                        {remaining.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-[width] duration-300',
                          bucketBarClass(item.bucket),
                        )}
                        style={{ width: `${remaining}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {t('accounts.rateLimits.usedPrefix', { defaultValue: 'Used' })}{' '}
                      {used.toFixed(1)}%
                      {' · '}
                      {formatRateLimitResetText({
                        resetsAt: item.resetsAt,
                        locale,
                        t,
                      })}
                    </div>
                  </div>
                )
              })}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {bucketLabel(weeklyOrFallback.bucket, t)} {weeklyRemaining.toFixed(1)}%
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/20">
          <div
            className={cn(
              'h-full transition-[width] duration-300',
              bucketBarClass(weeklyOrFallback.bucket),
            )}
            style={{ width: `${weeklyRemaining}%` }}
          />
        </div>
      </div>
    </div>
  )
}
