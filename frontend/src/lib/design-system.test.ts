/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveControlChrome,
  resolveDesignLanguage,
  resolveSurfaceRecipe,
  resolveTableChrome,
} from './design-system.ts'

test('resolveDesignLanguage returns a restrained mineral palette for light mode', () => {
  const language = resolveDesignLanguage('light')

  assert.equal(language.mode, 'light')
  assert.equal(language.palette.neutralFamily, 'stone-graphite')
  assert.equal(language.palette.accentFamily, 'oxide-blue')
  assert.equal(language.palette.canvasTone, 'paper')
  assert.equal(language.radius.control, '12px')
  assert.equal(language.radius.panel, '20px')
  assert.equal(language.shadow.panel, 'resting')
  assert.equal(language.shadow.stage, 'settled')
  assert.equal(language.density.controls, 'comfortable')
})

test('resolveDesignLanguage keeps the same visual family in dark mode without becoming neon', () => {
  const language = resolveDesignLanguage('dark')

  assert.equal(language.mode, 'dark')
  assert.equal(language.palette.neutralFamily, 'stone-graphite')
  assert.equal(language.palette.accentFamily, 'oxide-blue')
  assert.equal(language.palette.canvasTone, 'ink')
  assert.equal(language.shadow.panel, 'deep-resting')
  assert.equal(language.shadow.stage, 'deep-settled')
  assert.equal(language.density.panels, 'relaxed')
})

test('resolveDesignLanguage falls back to the light redesign baseline for unknown modes', () => {
  const language = resolveDesignLanguage('sepia')

  assert.equal(language.mode, 'light')
  assert.equal(language.palette.accentFamily, 'oxide-blue')
  assert.equal(language.radius.stage, '28px')
})

test('resolveSurfaceRecipe returns shared panel, muted panel, stage, and sidebar material recipes', () => {
  assert.deepEqual(resolveSurfaceRecipe('panel', 'light'), {
    kind: 'panel',
    emphasis: 'medium',
    border: 'etched',
    background: 'vellum',
    shadow: 'resting',
    temperature: 'warm',
  })

  assert.deepEqual(resolveSurfaceRecipe('panel-muted', 'light'), {
    kind: 'panel-muted',
    emphasis: 'low',
    border: 'soft',
    background: 'powder',
    shadow: 'barely-there',
    temperature: 'warm',
  })

  assert.deepEqual(resolveSurfaceRecipe('stage', 'dark'), {
    kind: 'stage',
    emphasis: 'medium',
    border: 'etched',
    background: 'matte',
    shadow: 'deep-settled',
    temperature: 'neutral',
  })

  assert.deepEqual(resolveSurfaceRecipe('sidebar', 'dark'), {
    kind: 'sidebar',
    emphasis: 'medium',
    border: 'soft',
    background: 'cabinet',
    shadow: 'none',
    temperature: 'neutral',
  })
})

test('resolveSurfaceRecipe keeps panel tiers restrained while giving stage and sidebar their own material role', () => {
  const panel = resolveSurfaceRecipe('panel', 'dark')
  const mutedPanel = resolveSurfaceRecipe('panel-muted', 'dark')
  const stage = resolveSurfaceRecipe('stage', 'light')
  const sidebar = resolveSurfaceRecipe('sidebar', 'light')

  assert.equal(panel.shadow, 'deep-resting')
  assert.equal(mutedPanel.shadow, 'barely-there')
  assert.equal(mutedPanel.emphasis, 'low')
  assert.equal(stage.emphasis, 'medium')
  assert.equal(stage.temperature, 'warm')
  assert.equal(sidebar.background, 'cabinet')
})

test('resolveControlChrome maps primary, outline, and ghost controls to distinct interaction roles', () => {
  assert.deepEqual(resolveControlChrome('default'), {
    kind: 'default',
    emphasis: 'high',
    palette: 'oxide-blue',
    surface: 'ink-solid',
    radius: '12px',
    focus: 'ring',
  })

  assert.deepEqual(resolveControlChrome('outline'), {
    kind: 'outline',
    emphasis: 'medium',
    palette: 'graphite',
    surface: 'lined',
    radius: '12px',
    focus: 'ring',
  })

  assert.deepEqual(resolveControlChrome('ghost'), {
    kind: 'ghost',
    emphasis: 'low',
    palette: 'graphite',
    surface: 'quiet',
    radius: '12px',
    focus: 'ring',
  })
})

test('resolveTableChrome keeps toolbar, header, and row surfaces separate', () => {
  assert.deepEqual(resolveTableChrome('toolbar'), {
    kind: 'toolbar',
    surface: 'tool-plate',
    border: 'soft',
    emphasis: 'medium',
  })

  assert.deepEqual(resolveTableChrome('header'), {
    kind: 'header',
    surface: 'linen-strip',
    border: 'soft',
    emphasis: 'low',
  })

  assert.deepEqual(resolveTableChrome('row'), {
    kind: 'row',
    surface: 'quiet-row',
    border: 'etched',
    emphasis: 'low',
  })
})
