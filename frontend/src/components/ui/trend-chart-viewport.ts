export interface TrendChartViewport {
  width: number
  height: number
}

export function coerceTrendChartViewport(
  width: number,
  height: number,
): TrendChartViewport | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  }
}
