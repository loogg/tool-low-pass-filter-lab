export function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const absolute = Math.abs(value)
  if (absolute >= 1000 || absolute < 0.001) return value.toExponential(2)
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatInteger(value) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)
}

export function formatFrequency(value) {
  if (!Number.isFinite(value)) return '—'
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, 3)} MHz`
  if (absolute >= 1_000) return `${formatNumber(value / 1_000, 3)} kHz`
  if (absolute >= 1) return `${formatNumber(value, 3)} Hz`
  if (absolute >= 0.001) return `${formatNumber(value * 1_000, 3)} mHz`
  if (absolute > 0) return `${formatNumber(value * 1_000_000, 3)} μHz`
  return `${formatNumber(value, 2)} Hz`
}

export function formatEngineeringRate(value, suffix = '/s') {
  if (!Number.isFinite(value)) return '—'
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 3)} G${suffix}`
  if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, 3)} M${suffix}`
  if (absolute >= 1_000) return `${formatNumber(value / 1_000, 3)} k${suffix}`
  return `${formatNumber(value, 3)} ${suffix}`
}

export function formatSeconds(value) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0 s'
  const absolute = Math.abs(value)
  if (absolute < 1e-9) return `${formatNumber(value * 1e12, 2)} ps`
  if (absolute < 1e-6) return `${formatNumber(value * 1e9, 2)} ns`
  if (absolute < 0.001) return `${formatNumber(value * 1e6, 2)} μs`
  if (absolute < 1) return `${formatNumber(value * 1000, 2)} ms`
  return `${formatNumber(value, 2)} s`
}

export function formatPercent(value, digits = 1) {
  return `${formatNumber(value * 100, digits)}%`
}

export function formatCFloatLiteral(value, significantDigits = 9) {
  if (!Number.isFinite(value) || value === 0) return '0.0f'

  const absolute = Math.abs(value)
  if (absolute < 0.0001 || absolute >= 1_000_000) {
    return `${value.toExponential(significantDigits - 1).replace('e+', 'e')}f`
  }

  let literal = Number(value.toPrecision(significantDigits)).toString()
  if (!literal.includes('.') && !literal.includes('e')) literal += '.0'
  return `${literal}f`
}
