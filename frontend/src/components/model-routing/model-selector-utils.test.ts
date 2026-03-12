/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSelectedModelItems,
  formatModelPriceSummary,
  getPublishedVersionWindow,
  type ModelSelectorCatalogInput,
} from './model-selector-utils.ts'

function createModel(
  id: string,
  overrides: Partial<ModelSelectorCatalogInput> = {},
): ModelSelectorCatalogInput {
  return {
    id,
    availability_status: 'available',
    official: {
      title: `${id} title`,
      input_price_microcredits: 1_000_000,
      cached_input_price_microcredits: 100_000,
      output_price_microcredits: 8_000_000,
    },
    effective_pricing: {
      source: 'official_sync',
      input_price_microcredits: 1_000_000,
      cached_input_price_microcredits: 100_000,
      output_price_microcredits: 8_000_000,
    },
    ...overrides,
  }
}

test('buildSelectedModelItems preserves saved order and keeps unknown models visible', () => {
  const catalog = [
    createModel('gpt-5.4'),
    createModel('gpt-5.2-codex'),
  ]

  const items = buildSelectedModelItems(catalog, ['gpt-5.2-codex', 'legacy-custom-model'])

  assert.equal(items.length, 2)
  assert.equal(items[0]?.id, 'gpt-5.2-codex')
  assert.equal(items[0]?.missingFromCatalog, false)
  assert.equal(items[1]?.id, 'legacy-custom-model')
  assert.equal(items[1]?.missingFromCatalog, true)
  assert.equal(items[1]?.availabilityStatus, 'unknown')
})

test('formatModelPriceSummary prefers effective pricing and falls back to official pricing', () => {
  const fromEffective = formatModelPriceSummary(
    createModel('gpt-5.4', {
      effective_pricing: {
        source: 'manual_override',
        input_price_microcredits: 2_500_000,
        cached_input_price_microcredits: 250_000,
        output_price_microcredits: 10_000_000,
      },
    }),
  )
  const fromOfficial = formatModelPriceSummary(
    createModel('gpt-5.2-codex', {
      effective_pricing: null,
      official: {
        title: 'fallback',
        input_price_microcredits: 3_000_000,
        cached_input_price_microcredits: 300_000,
        output_price_microcredits: 12_000_000,
      },
    }),
  )

  assert.equal(fromEffective, 'in 2.5000 · cached 0.2500 · out 10.0000')
  assert.equal(fromOfficial, 'in 3.0000 · cached 0.3000 · out 12.0000')
})

test('getPublishedVersionWindow collapses long lists and expands all items on demand', () => {
  const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']

  const collapsed = getPublishedVersionWindow(versions, false, 5)
  const expanded = getPublishedVersionWindow(versions, true, 5)
  const shortList = getPublishedVersionWindow(['v1', 'v2'], false, 5)

  assert.deepEqual(collapsed.visibleItems, ['v1', 'v2', 'v3', 'v4', 'v5'])
  assert.equal(collapsed.hiddenCount, 2)
  assert.equal(collapsed.canToggle, true)

  assert.deepEqual(expanded.visibleItems, versions)
  assert.equal(expanded.hiddenCount, 0)
  assert.equal(expanded.canToggle, true)

  assert.deepEqual(shortList.visibleItems, ['v1', 'v2'])
  assert.equal(shortList.hiddenCount, 0)
  assert.equal(shortList.canToggle, false)
})
