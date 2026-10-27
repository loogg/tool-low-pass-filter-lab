import { describe, expect, it } from 'vitest'
import { alphaForMethod, tauFromCutoff } from './filterMath.js'
import { automaticStepWindow, continuousStepData, continuousStepValue, digitalStepData, digitalStepValue, stepAxis, timeUnitFor } from './responseAnalysis.js'

describe('engineering response coordinates', () => {
  it('uses a readable physical window and unit at the default cutoff', () => {
    expect(automaticStepWindow(2.5)).toBeCloseTo(0.32, 12)
    const axis = stepAxis(0.32, tauFromCutoff(2.5))
    expect(axis.label).toBe('时间 t (ms)')
    expect(axis.maximum).toBe(320)
    expect(axis.interval).toBe(50)
    expect(axis.fromSeconds(0.05)).toBe(50)
    expect(axis.toSeconds(50)).toBe(0.05)
  })

  it('changes the coordinate representation without changing physical time', () => {
    const tau = tauFromCutoff(2.5)
    const axis = stepAxis(0.32, tau, true)
    expect(axis.label).toContain('无量纲')
    expect(axis.fromSeconds(tau)).toBe(1)
    expect(axis.toSeconds(axis.maximum)).toBeCloseTo(0.32, 12)
    expect(timeUnitFor(1e-8).label).toBe('ns')
    expect(timeUnitFor(5e-5).label).toBe('μs')
    expect(timeUnitFor(800).label).toBe('s')
  })

  it('keeps a fixed time domain while changed cutoff changes the measured response', () => {
    const duration = 0.32
    const slow = continuousStepData(2.5, duration)
    const fast = continuousStepData(10, duration)
    expect(slow.at(-1).x).toBe(duration)
    expect(fast.at(-1).x).toBe(duration)
    expect(continuousStepValue(0.05, 10)).toBeGreaterThan(continuousStepValue(0.05, 2.5))
    expect(continuousStepValue(tauFromCutoff(2.5), 2.5)).toBeCloseTo(1 - Math.exp(-1), 12)
    expect(continuousStepData(1e6, 1).some((p) => p.x === tauFromCutoff(1e6))).toBe(true)
  })

  it('matches the real current-input recurrence at exact sample timestamps', () => {
    for (const method of ['zoh', 'backward-euler']) {
      const alpha = alphaForMethod(2.5, 100, method)
      const result = digitalStepData(2.5, 100, method, 0.32)
      let y = 0
      expect(result.sampleCount).toBe(33)
      for (const [n, point] of result.data.entries()) {
        y += alpha * (1 - y)
        expect(point.x).toBe(n / 100)
        expect(point.y).toBeCloseTo(y, 12)
      }
      expect(result.data[0].y).toBeCloseTo(alpha, 14)
    }
  })

  it('bounds drawing for enormous sample counts without changing sample values', () => {
    const result = digitalStepData(0.001, 200_000_000, 'zoh', 800)
    expect(result.sampleCount).toBe(160_000_000_001)
    expect(result.data.length).toBeLessThanOrEqual(1000)
    expect(result.decimated).toBe(true)
    for (const point of result.data) {
      expect(point.x).toBe(point.n / 200_000_000)
      expect(point.y).toBe(digitalStepValue(point.n, alphaForMethod(0.001, 200_000_000)))
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('shows only the actual initial sample when the window is shorter than Ts', () => {
    const result = digitalStepData(50_000_000, 1, 'zoh', 1e-8)
    expect(result.data).toEqual([{ x: 0, y: 1, n: 0 }])
    expect(digitalStepValue(0, 1)).toBe(1)
  })
})
