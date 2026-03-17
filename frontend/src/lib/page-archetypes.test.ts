/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  describePageRegions,
  resolvePageArchetype,
  type PageArchetype,
} from './page-archetypes.ts'

test('resolvePageArchetype gives auth a branded but non-effect-heavy structure', () => {
  const archetype = resolvePageArchetype('auth')

  assert.equal(archetype.name, 'auth')
  assert.equal(archetype.introStyle, 'stage')
  assert.equal(archetype.stageMode, 'split')
  assert.equal(archetype.primaryZone, 'form')
  assert.equal(archetype.effectProfile, 'subtle')
  assert.equal(archetype.mobile.stageCompression, 'condense')
  assert.equal(archetype.mobile.primaryFirst, true)
})

test('resolvePageArchetype keeps workspace compact and task-first', () => {
  const archetype = resolvePageArchetype('workspace')

  assert.equal(archetype.name, 'workspace')
  assert.equal(archetype.introStyle, 'compact')
  assert.equal(archetype.primaryZone, 'task')
  assert.equal(archetype.secondaryDensity, 'summary-first')
  assert.equal(archetype.stageMode, 'none')
  assert.equal(archetype.mobile.primaryFirst, true)
  assert.equal(archetype.mobile.stageCompression, 'hide')
})

test('resolvePageArchetype falls back to settings for unknown variants', () => {
  const archetype = resolvePageArchetype('unknown' as PageArchetype)

  assert.equal(archetype.name, 'settings')
  assert.equal(archetype.introStyle, 'compact')
  assert.equal(archetype.primaryZone, 'content')
  assert.equal(archetype.effectProfile, 'none')
  assert.equal(archetype.mobile.primaryFirst, true)
})

test('describePageRegions separates auth stage and keeps workspace summary after the main task', () => {
  assert.deepEqual(describePageRegions('auth'), {
    introAlignment: 'start',
    contentLayout: 'split',
    secondaryPlacement: 'after',
    stageEmphasis: 'high',
  })

  assert.deepEqual(describePageRegions('workspace'), {
    introAlignment: 'between',
    contentLayout: 'split',
    secondaryPlacement: 'aside',
    stageEmphasis: 'low',
  })
})
