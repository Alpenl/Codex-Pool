export type DisplayServiceTier = 'default' | 'priority' | 'flex'

export type ServiceTierBadgeTone = 'secondary' | 'info' | 'warning'

export function normalizeServiceTierForDisplay(value?: string | null): DisplayServiceTier {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'priority' || normalized === 'fast') {
    return 'priority'
  }
  if (normalized === 'flex') {
    return 'flex'
  }
  return 'default'
}

export function shouldHighlightServiceTier(value?: string | null): boolean {
  const tier = normalizeServiceTierForDisplay(value)
  return tier === 'priority' || tier === 'flex'
}

export function getServiceTierLabelKey(value?: string | null): string {
  return `serviceTier.${normalizeServiceTierForDisplay(value)}`
}

export function getServiceTierDefaultLabel(value?: string | null): string {
  const tier = normalizeServiceTierForDisplay(value)
  if (tier === 'priority') {
    return 'Priority'
  }
  if (tier === 'flex') {
    return 'Flex'
  }
  return 'Default'
}

export function getServiceTierBadgeTone(value?: string | null): ServiceTierBadgeTone {
  const tier = normalizeServiceTierForDisplay(value)
  if (tier === 'priority') {
    return 'info'
  }
  if (tier === 'flex') {
    return 'warning'
  }
  return 'secondary'
}
