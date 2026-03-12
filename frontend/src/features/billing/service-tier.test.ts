/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getServiceTierBadgeTone,
  getServiceTierDefaultLabel,
  getServiceTierLabelKey,
  normalizeServiceTierForDisplay,
  shouldHighlightServiceTier,
} from './service-tier.ts'

test('normalizeServiceTierForDisplay maps fast and priority to priority', () => {
  assert.equal(normalizeServiceTierForDisplay('priority'), 'priority')
  assert.equal(normalizeServiceTierForDisplay(' Priority '), 'priority')
  assert.equal(normalizeServiceTierForDisplay('fast'), 'priority')
})

test('normalizeServiceTierForDisplay keeps flex and collapses default-like values', () => {
  assert.equal(normalizeServiceTierForDisplay('flex'), 'flex')
  assert.equal(normalizeServiceTierForDisplay('default'), 'default')
  assert.equal(normalizeServiceTierForDisplay('auto'), 'default')
  assert.equal(normalizeServiceTierForDisplay(''), 'default')
  assert.equal(normalizeServiceTierForDisplay(undefined), 'default')
  assert.equal(normalizeServiceTierForDisplay('unexpected-tier'), 'default')
})

test('shouldHighlightServiceTier only highlights priority and flex', () => {
  assert.equal(shouldHighlightServiceTier('priority'), true)
  assert.equal(shouldHighlightServiceTier('fast'), true)
  assert.equal(shouldHighlightServiceTier('flex'), true)
  assert.equal(shouldHighlightServiceTier('default'), false)
  assert.equal(shouldHighlightServiceTier('auto'), false)
  assert.equal(shouldHighlightServiceTier(undefined), false)
})

test('getServiceTierLabelKey returns stable i18n keys for normalized tiers', () => {
  assert.equal(getServiceTierLabelKey('priority'), 'serviceTier.priority')
  assert.equal(getServiceTierLabelKey('fast'), 'serviceTier.priority')
  assert.equal(getServiceTierLabelKey('flex'), 'serviceTier.flex')
  assert.equal(getServiceTierLabelKey('default'), 'serviceTier.default')
  assert.equal(getServiceTierLabelKey('unexpected-tier'), 'serviceTier.default')
})

test('getServiceTierBadgeTone maps tiers to expected badge variants', () => {
  assert.equal(getServiceTierBadgeTone('priority'), 'info')
  assert.equal(getServiceTierBadgeTone('flex'), 'warning')
  assert.equal(getServiceTierBadgeTone('default'), 'secondary')
  assert.equal(getServiceTierBadgeTone(undefined), 'secondary')
})

test('getServiceTierDefaultLabel returns readable fallback labels', () => {
  assert.equal(getServiceTierDefaultLabel('priority'), 'Priority')
  assert.equal(getServiceTierDefaultLabel('fast'), 'Priority')
  assert.equal(getServiceTierDefaultLabel('flex'), 'Flex')
  assert.equal(getServiceTierDefaultLabel('default'), 'Default')
  assert.equal(getServiceTierDefaultLabel(undefined), 'Default')
})
