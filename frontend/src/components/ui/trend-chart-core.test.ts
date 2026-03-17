/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import { coerceTrendChartViewport } from './trend-chart-viewport.ts'

test('coerceTrendChartViewport rejects non-positive measurements before the chart mounts', () => {
  assert.equal(coerceTrendChartViewport(-1, 300), null)
  assert.equal(coerceTrendChartViewport(0, 300), null)
  assert.equal(coerceTrendChartViewport(640, -1), null)
  assert.equal(coerceTrendChartViewport(640, 0), null)
  assert.equal(coerceTrendChartViewport(Number.NaN, 300), null)
  assert.equal(coerceTrendChartViewport(640, Number.POSITIVE_INFINITY), null)
})

test('coerceTrendChartViewport normalizes positive measurements for the chart canvas', () => {
  assert.deepEqual(coerceTrendChartViewport(640.9, 300.2), {
    width: 640,
    height: 300,
  })
})
