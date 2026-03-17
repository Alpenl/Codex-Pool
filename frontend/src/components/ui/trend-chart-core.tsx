import { useEffect, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatDateTime } from '@/lib/i18n-format'

import { coerceTrendChartViewport } from './trend-chart-viewport'

export interface TrendChartProps {
  data: Array<{ timestamp: string | number; [key: string]: unknown }>
  lines: Array<{ dataKey: string; stroke: string; name?: string }>
  height?: number
  locale?: string
  xAxisFormatter?: (val: string | number) => string
  valueFormatter?: (value: number) => string
}

function safeFormatDateTime(
  value: string | number,
  fallbackFormat: 'time' | 'datetime',
  locale?: string,
): string {
  const preset = fallbackFormat === 'time' ? 'time' : 'datetime'
  const directFormatted = formatDateTime(value, { locale, preset, fallback: '' })
  if (directFormatted) {
    return directFormatted
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      const numericFormatted = formatDateTime(numeric, { locale, preset, fallback: '' })
      if (numericFormatted) {
        return numericFormatted
      }
    }
  }

  return String(value)
}

export default function TrendChartCore({
  data,
  lines,
  height = 300,
  locale,
  xAxisFormatter,
  valueFormatter,
}: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => coerceTrendChartViewport(0, height))

  const defaultFormatter = (val: string | number) => safeFormatDateTime(val, 'time', locale)
  const formatValue = (value: unknown) => {
    if (typeof value === 'number') {
      return valueFormatter ? valueFormatter(value) : String(value)
    }

    if (typeof value === 'string') {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && valueFormatter) {
        return valueFormatter(numeric)
      }
    }

    return String(value ?? '')
  }

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    let frameId: number | null = null

    const measure = () => {
      const rect = node.getBoundingClientRect()
      const next = coerceTrendChartViewport(rect.width, rect.height)
      setViewport((current) => {
        if (
          current?.width === next?.width
          && current?.height === next?.height
        ) {
          return current
        }
        return next
      })
    }

    const scheduleMeasure = () => {
      if (typeof window === 'undefined') {
        measure()
        return
      }

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        measure()
      })
    }

    scheduleMeasure()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        scheduleMeasure()
      })
      observer.observe(node)

      return () => {
        observer.disconnect()
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleMeasure)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleMeasure)
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
        }
      }
    }
  }, [height])

  return (
    <div ref={containerRef} style={{ width: '100%', minWidth: 0, minHeight: 1, height }}>
      {viewport ? (
        <LineChart
          width={viewport.width}
          height={viewport.height}
          data={data}
          margin={{
            top: 5,
            right: 10,
            left: 10,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={xAxisFormatter || defaultFormatter}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickFormatter={formatValue}
            tickLine={false}
            axisLine={false}
            dx={-10}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--popover)',
              borderColor: 'var(--border)',
              color: 'var(--popover-foreground)',
              borderRadius: '8px',
              fontSize: '14px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            }}
            labelFormatter={(label) => safeFormatDateTime(label, 'datetime', locale)}
            formatter={(value) => formatValue(value)}
          />
          {lines.map((line, idx) => (
            <Line
              key={idx}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name || line.dataKey}
              stroke={line.stroke}
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 0 }}
              dot={false}
            />
          ))}
        </LineChart>
      ) : null}
    </div>
  )
}
