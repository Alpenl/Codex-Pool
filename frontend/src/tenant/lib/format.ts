import { formatDateTime as formatLocalizedDateTime } from '@/lib/i18n-format'

export function formatMicrocredits(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }
  return (value / 1_000_000).toFixed(2)
}

export function splitAllowlist(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function formatDateTime(input: string) {
  return formatLocalizedDateTime(input, { preset: 'datetime', fallback: '-' })
}

export function currentRangeByDays(days: number) {
  const endTs = Math.floor(Date.now() / 1000)
  const startTs = endTs - days * 24 * 60 * 60
  return { start_ts: startTs, end_ts: endTs }
}
