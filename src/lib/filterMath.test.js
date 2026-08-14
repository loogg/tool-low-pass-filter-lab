import { describe, expect, it } from 'vitest'
import {
  alphaBackwardEuler,
  alphaZoh,
  createSimulation,
  cutoffFromTau,
  gainDbAt,
  magnitudeAt,
  phaseDegreesAt,
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
})
