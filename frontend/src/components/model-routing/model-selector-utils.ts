export type ModelAvailabilityStatus = 'available' | 'unavailable' | 'unknown'

type ModelPricingView = {
  source?: string | null
  input_price_microcredits?: number | null
  cached_input_price_microcredits?: number | null
  output_price_microcredits?: number | null
} | null

type ModelOfficialInfo = {
  title?: string | null
  description?: string | null
  context_window_tokens?: number | null
  max_output_tokens?: number | null
  input_price_microcredits?: number | null
  cached_input_price_microcredits?: number | null
  output_price_microcredits?: number | null
} | null

export type ModelSelectorCatalogInput = {
  id: string
  availability_status?: ModelAvailabilityStatus | null
  official?: ModelOfficialInfo
  effective_pricing?: ModelPricingView
}

export type ModelSelectorItem = {
  id: string
  title: string | null
  description: string | null
  availabilityStatus: ModelAvailabilityStatus
  priceSummary: string
  contextSummary: string | null
  pricingSource: string | null
  missingFromCatalog: boolean
}

function normalizeAvailabilityStatus(status?: string | null): ModelAvailabilityStatus {
  if (status === 'available') return 'available'
  if (status === 'unavailable') return 'unavailable'
  return 'unknown'
}

function formatMicrocredits(value?: number | null) {
  if (typeof value !== 'number') return '-'
  return (value / 1_000_000).toFixed(4)
}

function compactTokenCount(value?: number | null) {
  if (typeof value !== 'number' || value <= 0) return null
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}M`
  }
  if (value >= 1_000) {
    return `${Number((value / 1_000).toFixed(1))}K`
  }
  return String(value)
}

function resolvePricing(model: ModelSelectorCatalogInput) {
  return {
    source: model.effective_pricing?.source ?? null,
    input:
      model.effective_pricing?.input_price_microcredits ??
      model.official?.input_price_microcredits ??
      null,
    cached:
      model.effective_pricing?.cached_input_price_microcredits ??
      model.official?.cached_input_price_microcredits ??
      null,
    output:
      model.effective_pricing?.output_price_microcredits ??
      model.official?.output_price_microcredits ??
      null,
  }
}

export function formatModelPriceSummary(model: ModelSelectorCatalogInput) {
  const pricing = resolvePricing(model)
  return `in ${formatMicrocredits(pricing.input)} · cached ${formatMicrocredits(pricing.cached)} · out ${formatMicrocredits(pricing.output)}`
}

function buildContextSummary(model: ModelSelectorCatalogInput) {
  const context = compactTokenCount(model.official?.context_window_tokens)
  const output = compactTokenCount(model.official?.max_output_tokens)
  if (!context && !output) return null
  return `ctx ${context ?? '-'} · out ${output ?? '-'}`
}

function buildCatalogItem(model: ModelSelectorCatalogInput): ModelSelectorItem {
  const pricing = resolvePricing(model)
  return {
    id: model.id,
    title: model.official?.title?.trim() || null,
    description: model.official?.description?.trim() || null,
    availabilityStatus: normalizeAvailabilityStatus(model.availability_status),
    priceSummary: formatModelPriceSummary(model),
    contextSummary: buildContextSummary(model),
    pricingSource: pricing.source,
    missingFromCatalog: false,
  }
}

function availabilityRank(status: ModelAvailabilityStatus) {
  if (status === 'available') return 0
  if (status === 'unknown') return 1
  return 2
}

export function buildCatalogModelItems(models: ModelSelectorCatalogInput[]): ModelSelectorItem[] {
  return models
    .map(buildCatalogItem)
    .sort((left, right) => {
      if (availabilityRank(left.availabilityStatus) !== availabilityRank(right.availabilityStatus)) {
        return availabilityRank(left.availabilityStatus) - availabilityRank(right.availabilityStatus)
      }
      return left.id.localeCompare(right.id)
    })
}

export function buildSelectedModelItems(
  models: ModelSelectorCatalogInput[],
  selectedIds: string[],
): ModelSelectorItem[] {
  const catalogMap = new Map(buildCatalogModelItems(models).map((item) => [item.id, item]))
  const seen = new Set<string>()

  return selectedIds
    .filter((id) => {
      const normalized = id.trim()
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .map((id) => {
      const catalogItem = catalogMap.get(id)
      if (catalogItem) {
        return catalogItem
      }
      return {
        id,
        title: null,
        description: null,
        availabilityStatus: 'unknown' as const,
        priceSummary: 'in - · cached - · out -',
        contextSummary: null,
        pricingSource: null,
        missingFromCatalog: true,
      }
    })
}

export function getPublishedVersionWindow<T>(
  items: T[],
  expanded: boolean,
  initialVisibleCount = 5,
) {
  const canToggle = items.length > initialVisibleCount
  if (expanded || !canToggle) {
    return {
      canToggle,
      hiddenCount: 0,
      visibleItems: items,
    }
  }
  return {
    canToggle,
    hiddenCount: items.length - initialVisibleCount,
    visibleItems: items.slice(0, initialVisibleCount),
  }
}
