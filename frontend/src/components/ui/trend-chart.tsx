import { lazy, Suspense } from 'react'

import type { TrendChartProps } from './trend-chart-core'

const TrendChartCore = lazy(() => import('./trend-chart-core'))

export function TrendChart(props: TrendChartProps) {
  return (
    <Suspense fallback={<div className="w-full rounded-md bg-muted/40" style={{ height: props.height ?? 300 }} />}>
      <TrendChartCore {...props} />
    </Suspense>
  )
}
