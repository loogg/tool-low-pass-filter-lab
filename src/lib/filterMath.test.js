import { describe, expect, it } from 'vitest'
import {
  alphaBackwardEuler,
  alphaZoh,
  createSimulation,
  cutoffFromTau,
  gainDbAt,
  magnitudeAt,
  phaseDegreesAt,
  simulationFrequencyLimits,
  solveDesignConstraints,
  tauFromCutoff,
} from './filterMath.js'

describe('first-order low-pass relationships', () => {
  it('converts cutoff frequency and time constant in both directions', () => {
    const tau = tauFromCutoff(10)
    expect(tau).toBeCloseTo(0.0159155, 6)
    expect(cutoffFromTau(tau)).toBeCloseTo(10, 10)
  })

  it('matches the -3 dB and -45 degree cutoff point', () => {
    expect(magnitudeAt(10, 10)).toBeCloseTo(1 / Math.sqrt(2), 8)
    expect(gainDbAt(10, 10)).toBeCloseTo(-3.0103, 3)
    expect(phaseDegreesAt(10, 10)).toBeCloseTo(-45, 8)
  })

  it('calculates both discrete coefficients', () => {
    expect(alphaZoh(2.5, 100)).toBeCloseTo(0.14536, 4)
    expect(alphaBackwardEuler(2.5, 100)).toBeCloseTo(0.13576, 4)
  })

  it('keeps the simulator frequency range below Nyquist without an arbitrary cap', () => {
    expect(simulationFrequencyLimits(100)).toEqual({ minimum: 0.1, maximum: 45 })
    expect(simulationFrequencyLimits(10000)).toEqual({ minimum: 0.1, maximum: 4500 })
  })
})

describe('design constraint solver', () => {
  it('reproduces the feasible range from the teaching example', () => {
    const result = solveDesignConstraints({
      settlingSeconds: 1,
      passFrequencyHz: 1,
      passMagnitude: 0.9,
      stopFrequencyHz: 10,
      stopMagnitude: 0.3,
      sampleRateHz: 100,
    })

    expect(result.timeLower).toBeCloseTo(0.4768, 3)
    expect(result.passLower).toBeCloseTo(2.0647, 3)
    expect(result.stopUpper).toBeCloseTo(3.1449, 3)
    expect(result.feasible).toBe(true)
    expect(result.suggested).toBeGreaterThan(result.lower)
    expect(result.suggested).toBeLessThan(result.upper)
  })

  it('detects incompatible requirements', () => {
    const result = solveDesignConstraints({
      settlingSeconds: 0.05,
      passFrequencyHz: 20,
      passMagnitude: 0.99,
      stopFrequencyHz: 25,
      stopMagnitude: 0.05,
      sampleRateHz: 200,
    })

    expect(result.feasible).toBe(false)
  })
})

describe('discrete simulation', () => {
  it('converges near one for a step input', () => {
    const result = createSimulation({
      cutoffHz: 2.5,
      sampleRateHz: 100,
      inputType: 'step',
      durationSeconds: 2,
    })

    expect(result.output.at(-1).y).toBeGreaterThan(0.999)
    expect(result.alpha).toBeCloseTo(alphaZoh(2.5, 100), 8)
  })

  it('applies configurable amplitude and square-wave duty cycle', () => {
    const result = createSimulation({
      cutoffHz: 20,
      sampleRateHz: 1000,
      inputType: 'square',
      signalFrequencyHz: 10,
      signalAmplitude: 1.5,
      squareDutyCycle: 0.25,
      durationSeconds: 1,
      maxRenderedPoints: 2000,
    })

    const positiveSamples = result.input.filter((point) => point.y > 0).length
    expect(Math.max(...result.input.map((point) => point.y))).toBe(1.5)
    expect(Math.min(...result.input.map((point) => point.y))).toBe(-1.5)
    expect(positiveSamples / result.input.length).toBeCloseTo(0.25, 1)
  })

  it('accepts signal and interference frequencies up to the sampling safety limit', () => {
    const result = createSimulation({
      cutoffHz: 2.5,
      sampleRateHz: 100,
      inputType: 'noise',
      signalFrequencyHz: 40,
      interferenceFrequencyHz: 44,
      durationSeconds: 0.5,
    })

    expect(result.signalFrequency).toBe(40)
    expect(result.interferenceFrequency).toBe(44)
  })
})
