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

  it('maps each decade above cutoff to roughly one tenth amplitude', () => {
    expect(magnitudeAt(100, 10)).toBeCloseTo(0.1, 2)
    expect(gainDbAt(100, 10)).toBeCloseTo(-20.043, 2)
    expect(magnitudeAt(1000, 10)).toBeCloseTo(0.01, 3)
    expect(gainDbAt(1000, 10)).toBeCloseTo(-40, 2)
  })

  it('calculates both discrete coefficients', () => {
    expect(alphaZoh(2.5, 100)).toBeCloseTo(0.14536, 4)
    expect(alphaBackwardEuler(2.5, 100)).toBeCloseTo(0.13576, 4)
  })

  it('keeps the simulator frequency range below Nyquist without an arbitrary cap', () => {
    expect(simulationFrequencyLimits(100)).toEqual({ minimum: 0.001, maximum: 45 })
    expect(simulationFrequencyLimits(10000)).toEqual({ minimum: 0.001, maximum: 4500 })
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

  it('bounds integration work for MHz sampling while preserving real sample statistics', () => {
    const result = createSimulation({
      cutoffHz: 1_000_000,
      sampleRateHz: 100_000_000,
      signalFrequencyHz: 500_000,
      durationSeconds: 4,
      maxRenderedPoints: 600,
      maxIntegrationSteps: 2_000,
    })

    expect(result.sampleCount).toBe(400_000_001)
    expect(result.simulatedSteps).toBeLessThanOrEqual(2_000)
    expect(result.renderedPoints).toBeLessThanOrEqual(601)
    expect(result.integrationStride).toBeGreaterThan(1)
    expect(result.approximated).toBe(true)
  })

  it('applies signal offset, phase, and deterministic noise seed', () => {
    const options = {
      cutoffHz: 200,
      sampleRateHz: 1_000,
      signalFrequencyHz: 10,
      signalAmplitude: 2,
      signalOffset: 3,
      signalPhaseDegrees: 90,
      noiseLevel: 0.2,
      noiseSeed: 42,
      durationSeconds: 0.02,
      maxRenderedPoints: 100,
    }
    const first = createSimulation(options)
    const second = createSimulation(options)
    const withoutNoise = createSimulation({ ...options, noiseLevel: 0 })

    expect(first.input).toEqual(second.input)
    expect(first.input[0].y).not.toBe(withoutNoise.input[0].y)
    expect(withoutNoise.input[0].y).toBeCloseTo(5, 8)
  })

  it('uses configurable step levels and the recurrence initial state', () => {
    const result = createSimulation({
      cutoffHz: 2,
      sampleRateHz: 100,
      inputType: 'step',
      stepInitialValue: -2,
      stepFinalValue: 3,
      stepTimeRatio: 0.5,
      initialOutput: 4,
      durationSeconds: 1,
      maxRenderedPoints: 200,
    })
    const expectedFirstOutput = 4 + result.alpha * (-2 - 4)

    expect(result.input[0].y).toBe(-2)
    expect(result.input.at(-1).y).toBe(3)
    expect(result.output[0].y).toBeCloseTo(expectedFirstOutput, 10)
  })
})
