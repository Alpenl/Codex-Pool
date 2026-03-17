/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveControlChrome,
  resolveDesignLanguage,
  resolveSurfaceRecipe,
  resolveTableChrome,
} from './design-system.ts'

test('resolveDesignLanguage returns a structure-first workspace palette for light mode', () => {
  const language = resolveDesignLanguage('light')

  assert.equal(language.mode, 'light')
  assert.equal(language.palette.neutralFamily, 'paper-slate')
  assert.equal(language.palette.accentFamily, 'ink-steel')
  assert.equal(language.palette.canvasTone, 'folio')
  assert.equal(language.radius.control, '10px')
  assert.equal(language.radius.panel, '16px')
  assert.equal(language.shadow.panel, 'flush')
  assert.equal(language.shadow.stage, 'shelf')
  assert.equal(language.density.controls, 'dense')
})

test('resolveDesignLanguage keeps the same structural family in dark mode without turning glossy', () => {
  const language = resolveDesignLanguage('dark')

  assert.equal(language.mode, 'dark')
  assert.equal(language.palette.neutralFamily, 'paper-slate')
  assert.equal(language.palette.accentFamily, 'ink-steel')
  assert.equal(language.palette.canvasTone, 'night')
  assert.equal(language.shadow.panel, 'anchored')
  assert.equal(language.shadow.stage, 'deep-shelf')
  assert.equal(language.density.panels, 'tight')
})

test('resolveDesignLanguage falls back to the light redesign baseline for unknown modes', () => {
  const language = resolveDesignLanguage('sepia')

  assert.equal(language.mode, 'light')
  assert.equal(language.palette.accentFamily, 'ink-steel')
  assert.equal(language.radius.stage, '22px')
})

test('resolveSurfaceRecipe returns continuous workspace recipes instead of material showcase recipes', () => {
  assert.deepEqual(resolveSurfaceRecipe('panel', 'light'), {
    kind: 'panel',
    emphasis: 'structured',
    border: 'divider',
    background: 'section',
    shadow: 'trace',
    temperature: 'paper',
  })

  assert.deepEqual(resolveSurfaceRecipe('panel-muted', 'light'), {
    kind: 'panel-muted',
    emphasis: 'low',
    border: 'quiet',
    background: 'canvas',
    shadow: 'none',
    temperature: 'paper',
  })

  assert.deepEqual(resolveSurfaceRecipe('stage', 'dark'), {
    kind: 'stage',
    emphasis: 'structured',
    border: 'gridline',
    background: 'worktop',
    shadow: 'deep-shelf',
    temperature: 'neutral',
  })

  assert.deepEqual(resolveSurfaceRecipe('sidebar', 'dark'), {
    kind: 'sidebar',
    emphasis: 'low',
    border: 'divider',
    background: 'frame',
    shadow: 'none',
    temperature: 'neutral',
  })
})

test('resolveSurfaceRecipe keeps workspace tiers continuous and avoids floating panel semantics', () => {
  const panel = resolveSurfaceRecipe('panel', 'dark')
  const mutedPanel = resolveSurfaceRecipe('panel-muted', 'dark')
  const stage = resolveSurfaceRecipe('stage', 'light')
  const sidebar = resolveSurfaceRecipe('sidebar', 'light')

  assert.equal(panel.shadow, 'anchored')
  assert.equal(mutedPanel.shadow, 'none')
  assert.equal(mutedPanel.emphasis, 'low')
  assert.equal(stage.emphasis, 'structured')
  assert.equal(stage.temperature, 'paper')
  assert.equal(sidebar.background, 'frame')
})

test('resolveControlChrome maps primary, outline, and ghost controls to distinct interaction roles', () => {
  assert.deepEqual(resolveControlChrome('default'), {
    kind: 'default',
    emphasis: 'high',
    palette: 'ink-steel',
    surface: 'solid',
    radius: '10px',
    focus: 'ring',
  })

  assert.deepEqual(resolveControlChrome('outline'), {
    kind: 'outline',
    emphasis: 'medium',
    palette: 'graphite',
    surface: 'lined',
    radius: '10px',
    focus: 'ring',
  })

  assert.deepEqual(resolveControlChrome('ghost'), {
    kind: 'ghost',
    emphasis: 'low',
    palette: 'graphite',
    surface: 'subtle',
    radius: '10px',
    focus: 'ring',
  })
})

test('resolveTableChrome keeps toolbar, header, and row surfaces closer to structured workbars than decorated trays', () => {
  assert.deepEqual(resolveTableChrome('toolbar'), {
    kind: 'toolbar',
    surface: 'workbar',
    border: 'divider',
    emphasis: 'low',
  })

  assert.deepEqual(resolveTableChrome('header'), {
    kind: 'header',
    surface: 'rule-strip',
    border: 'divider',
    emphasis: 'low',
  })

  assert.deepEqual(resolveTableChrome('row'), {
    kind: 'row',
    surface: 'quiet-row',
    border: 'quiet',
    emphasis: 'low',
  })
})
