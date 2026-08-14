export function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const absolute = Math.abs(value)
  if (absolute >= 1000 || absolute < 0.001) return value.toExponential(2)
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatFrequency(value) {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return `${formatNumber(value / 1000, 2)} kHz`
  if (value < 1) return `${formatNumber(value, 3)} Hz`
  return `${formatNumber(value, 2)} Hz`
}

export function formatSeconds(value) {
  if (!Number.isFinite(value)) return '—'
  if (value < 0.001) return `${formatNumber(value * 1e6, 2)} μs`
  if (value < 1) return `${formatNumber(value * 1000, 2)} ms`
  return `${formatNumber(value, 2)} s`
}

export function formatPercent(value, digits = 1) {
  return `${formatNumber(value * 100, digits)}%`
}
