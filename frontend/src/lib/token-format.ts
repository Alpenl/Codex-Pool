const TOKEN_COMPACT_THRESHOLD = 1_000_000

interface FormatTokenOptions {
  locale?: string
  maximumFractionDigits?: number
  minimumFractionDigits?: number
}

function normalizeTokenValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return value
}

export function formatTokenCount(value: number, locale?: string): string {
  return formatTokenValue(value, {
    locale,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
}

export function formatTokenRate(value: number, locale?: string): string {
  return formatTokenValue(value, {
    locale,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

export function formatTokenValue(value: number, options: FormatTokenOptions = {}): string {
  const normalized = normalizeTokenValue(value)
  const {
    locale,
    maximumFractionDigits = Number.isInteger(normalized) ? 0 : 2,
    minimumFractionDigits = 0,
  } = options

  if (Math.abs(normalized) >= TOKEN_COMPACT_THRESHOLD) {
    const millionValue = normalized / TOKEN_COMPACT_THRESHOLD
    return `${millionValue.toLocaleString(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })}M`
  }

  return normalized.toLocaleString(locale, {
    maximumFractionDigits,
    minimumFractionDigits,
  })
}
