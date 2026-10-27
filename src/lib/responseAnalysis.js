import { alphaForMethod, discreteTimeConstantSeconds, tauFromCutoff } from './filterMath.js'

export function timeUnitFor(seconds) {
  if (seconds >= 1) return { id: 's', label: 's', factor: 1 }
  if (seconds >= 1e-3) return { id: 'ms', label: 'ms', factor: 1e-3 }
  if (seconds >= 1e-6) return { id: 'us', label: 'μs', factor: 1e-6 }
  if (seconds >= 1e-9) return { id: 'ns', label: 'ns', factor: 1e-9 }
  return { id: 'ps', label: 'ps', factor: 1e-12 }
}

export function niceTickStep(span, targetIntervals = 6) {
  const desired = span / targetIntervals
  const power = 10 ** Math.floor(Math.log10(desired))
  const fraction = desired / power
  return power * (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10)
}

export function automaticStepWindow(cutoffHz) {
  const duration = 5 * tauFromCutoff(cutoffHz)
  const minor = niceTickStep(duration) / 5
  return Math.ceil(duration / minor - 1e-12) * minor
}

export function stepAxis(durationSeconds, tau, normalized = false) {
  const unit = timeUnitFor(durationSeconds)
  const divisor = normalized ? tau : unit.factor
  return {
    maximum: durationSeconds / divisor,
    interval: niceTickStep(durationSeconds / divisor),
    label: normalized ? '归一化时间 t/τ（无量纲）' : `时间 t (${unit.label})`,
    fromSeconds: (time) => time / divisor,
    toSeconds: (coordinate) => coordinate * divisor,
  }
}

export function continuousStepValue(timeSeconds, cutoffHz) {
  return -Math.expm1(-Math.max(0, timeSeconds) / tauFromCutoff(cutoffHz))
}

export function continuousStepData(cutoffHz, durationSeconds, pointCount = 321) {
  const tau = tauFromCutoff(cutoffHz)
  const activeEnd = Math.min(durationSeconds, 8 * tau)
  const times = new Set([0, durationSeconds])
  for (let i = 0; i < pointCount; i += 1) times.add(activeEnd * i / (pointCount - 1))
  for (const time of [tau, -tau * Math.log(0.05), -tau * Math.log(0.01)]) {
    if (time <= durationSeconds) times.add(time)
  }
  return [...times].sort((a, b) => a - b).map((x) => ({ x, y: continuousStepValue(x, cutoffHz) }))
}

export function digitalStepValue(sampleIndex, alpha) {
  return alpha >= 1 ? 1 : -Math.expm1((sampleIndex + 1) * Math.log1p(-alpha))
}

// Closed-form unit step, y[-1]=0, x[n]=1. Every plotted point is a real nTs.
// This does not run or claim to run a potentially enormous sample loop.
export function digitalStepData(cutoffHz, sampleRateHz, method, durationSeconds, pointBudget = 1000) {
  const rawLast = durationSeconds * sampleRateHz
  const lastIndex = Math.floor(rawLast + Number.EPSILON * 4 * Math.max(1, rawLast))
  const sampleCount = lastIndex + 1
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const indices = new Set([0, lastIndex])
  if (sampleCount <= pointBudget) {
    for (let n = 0; n <= lastIndex; n += 1) indices.add(n)
  } else {
    const activeLast = Math.min(lastIndex, Math.ceil(8 * discreteTimeConstantSeconds(cutoffHz, sampleRateHz, method) * sampleRateHz))
    const count = Math.min(activeLast + 1, pointBudget - 1)
    for (let i = 0; i < count; i += 1) indices.add(count === 1 ? 0 : Math.round(activeLast * i / (count - 1)))
  }
  const data = [...indices].sort((a, b) => a - b).map((n) => ({ x: n / sampleRateHz, y: digitalStepValue(n, alpha), n }))
  return { data, sampleCount, decimated: data.length < sampleCount }
}
