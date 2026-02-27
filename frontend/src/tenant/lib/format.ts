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
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(input))
}

export function currentRangeByDays(days: number) {
  const endTs = Math.floor(Date.now() / 1000)
  const startTs = endTs - days * 24 * 60 * 60
  return { start_ts: startTs, end_ts: endTs }
}

