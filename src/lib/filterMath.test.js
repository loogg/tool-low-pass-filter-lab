import { describe, expect, it } from 'vitest'
import {
  aliasFrequency,
  aliasingInfo,
  alphaBackwardEuler,
  alphaZoh,
  createAliasingFoldResponse,
  createSimulation,
  cutoffFromTau,
  digitalMappingDiagnostics,
  discreteMagnitudeAt,
  digitalCutoffFrequency,
  discreteSettlingSamples,
  discreteGroupDelaySecondsAt,
  discretePhaseDegreesAt,
  discreteSettlingTime,
  discreteTimeConstantSeconds,
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

  it('finds the actual digital half-power frequency, including absent and tiny corners', () => {
    for (const method of ['zoh', 'backward-euler']) {
      const corner = digitalCutoffFrequency(10, 100, method)
      expect(corner).toBeGreaterThan(0)
      expect(corner).toBeLessThan(50)
      expect(discreteMagnitudeAt(corner, 10, 100, method)).toBeCloseTo(Math.SQRT1_2, 12)
    }
    expect(digitalCutoffFrequency(1000, 100)).toBeNull()
    expect(digitalCutoffFrequency(0.001, 200_000_000)).toBeCloseTo(0.001, 12)
    expect(gainDbAt(100_000_000, 0.001)).toBeCloseTo(-220, 10)
    expect(discretePhaseDegreesAt(0.001, 0.001, 200_000_000)).toBeCloseTo(-45, 7)
    expect(discreteGroupDelaySecondsAt(0, 0.001, 200_000_000)).toBeCloseTo(tauFromCutoff(0.001), 5)
  })

  it('counts the first integer update that actually reaches 95 percent', () => {
    for (const method of ['zoh', 'backward-euler']) {
      const alpha = method === 'zoh' ? alphaZoh(2.5, 100) : alphaBackwardEuler(2.5, 100)
      let output = 0
      let count = 0
      while (output < 0.95) { output += alpha * (1 - output); count += 1 }
      expect(discreteSettlingSamples(2.5, 100, method)).toBe(count)
    }
    expect(discreteSettlingTime(1e6, 100)).toBe(0.01)
  })

  it('opens the simulator input range across four Nyquist zones', () => {
    expect(simulationFrequencyLimits(100)).toEqual({ minimum: 0.001, maximum: 200 })
    expect(simulationFrequencyLimits(10000)).toEqual({ minimum: 0.001, maximum: 20000 })
  })

  it('folds analog frequencies into the first Nyquist zone', () => {
    expect(aliasFrequency(400, 1000)).toBe(400)
    expect(aliasFrequency(600, 1000)).toBe(400)
    expect(aliasFrequency(900, 1000)).toBe(100)
    expect(aliasFrequency(1100, 1000)).toBe(100)
    expect(aliasFrequency(1600, 1000)).toBe(400)

    expect(aliasingInfo(600, 1000)).toMatchObject({
      aliasFrequency: 400,
      nearestSampleMultiple: 1,
      nyquistZone: 2,
      mirrored: true,
      aliased: true,
    })
    expect(aliasingInfo(1100, 1000)).toMatchObject({
      aliasFrequency: 100,
      nearestSampleMultiple: 1,
      nyquistZone: 3,
      mirrored: false,
      aliased: true,
    })
    expect(aliasingInfo(1600, 1000)).toMatchObject({
      aliasFrequency: 400,
      nearestSampleMultiple: 2,
    })

    expect(aliasingInfo(500, 1000)).toMatchObject({
      aliasFrequency: 500,
      atNyquist: true,
      aliased: false,
      ambiguous: true,
    })
  })

  it('preserves tiny baseband frequencies instead of snapping them to DC at high fs', () => {
    expect(aliasFrequency(0.00001, 200_000_000)).toBe(0.00001)
    expect(discreteMagnitudeAt(0.00001, 0.001, 200_000_000)).toBeCloseTo(magnitudeAt(0.00001, 0.001), 10)
    const count = discreteSettlingSamples(0.001, 200_000_000)
    const exactCount = Math.ceil(-Math.log(0.05) * 200_000_000 / (2 * Math.PI * 0.001))
    expect(count).toBe(exactCount)
  })

  it('keeps magnitude even and phase odd under a mirrored alias', () => {
    expect(discreteMagnitudeAt(600, 40, 1000)).toBeCloseTo(
      discreteMagnitudeAt(400, 40, 1000),
      12,
    )
    expect(discretePhaseDegreesAt(600, 40, 1000)).toBeCloseTo(
      -discretePhaseDegreesAt(400, 40, 1000),
      12,
    )
  })

  it('calculates digital group delay and method-specific settling envelopes', () => {
    expect(discreteGroupDelaySecondsAt(2.5, 2.5, 100, 'zoh')).toBeCloseTo(0.026962, 6)
    expect(discreteTimeConstantSeconds(2.5, 100, 'zoh')).toBeCloseTo(tauFromCutoff(2.5), 12)
    expect(discreteTimeConstantSeconds(2.5, 100, 'backward-euler')).toBeCloseTo(0.0685404, 6)
    expect(discreteSettlingTime(2.5, 100, 'backward-euler', 0.95)).toBe(0.21)
    expect(discreteSettlingSamples(2.5, 100, 'backward-euler', 0.95)).toBe(21)
  })

  it('reports actual digital mapping error instead of using a fixed fc/fs threshold', () => {
    expect(digitalMappingDiagnostics(2.5, 100, 'zoh')).toMatchObject({
      cutoffInBaseband: true,
      closeToAnalog: true,
    })
    expect(digitalMappingDiagnostics(10, 100, 'zoh')).toMatchObject({
      cutoffInBaseband: true,
      closeToAnalog: false,
    })
    expect(digitalMappingDiagnostics(50, 100, 'zoh')).toMatchObject({
      cutoffInBaseband: false,
      closeToAnalog: false,
    })
    expect(digitalMappingDiagnostics(0.001, 200_000_000, 'zoh')).toMatchObject({
      cutoffInBaseband: true,
      closeToAnalog: true,
    })
    expect(discreteMagnitudeAt(0.001, 0.001, 200_000_000, 'zoh')).toBeCloseTo(
      1 / Math.sqrt(2),
      9,
    )
  })

  it('creates the repeated triangular Nyquist folding curve', () => {
    const points = createAliasingFoldResponse(1000, 9)
    expect(points.map((point) => point.y)).toEqual([
      0, 250, 500, 250, 0, 250, 500, 250, 0,
    ])
  })
})

describe('design constraint solver', () => {
  it('honors an integer update budget for a fractional sample deadline', () => {
    const result = solveDesignConstraints({ settlingSeconds: 0.205, passFrequencyHz: 1,
      passMagnitude: 0.5, stopFrequencyHz: 40, stopMagnitude: 0.99, sampleRateHz: 100,
      method: 'backward-euler' })
    expect(result.feasible).toBe(true)
    expect(discreteSettlingSamples(result.timeLower, 100, 'backward-euler')).toBeLessThanOrEqual(20)
    expect(result.verification.settlingSeconds).toBeLessThanOrEqual(0.205)
    expect(discreteSettlingSamples(result.timeLower * 0.999, 100, 'backward-euler')).toBeGreaterThan(20)
  })
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
    expect(result.passLower).toBeCloseTo(2.063, 3)
    expect(result.stopUpper).toBeCloseTo(3.0885, 3)
    expect(result.feasible).toBe(true)
    expect(result.suggested).toBeGreaterThan(result.lower)
    expect(result.suggested).toBeLessThan(result.upper)
    expect(result.verification.passMagnitude).toBeGreaterThan(0.9)
    expect(result.verification.stopMagnitude).toBeLessThan(0.3)
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

  it('solves high normalized-frequency constraints against the digital transfer function', () => {
    const result = solveDesignConstraints({
      settlingSeconds: 10,
      passFrequencyHz: 40,
      passMagnitude: 0.7,
      stopFrequencyHz: 49,
      stopMagnitude: 0.7,
      sampleRateHz: 100,
      method: 'zoh',
    })

    expect(result.feasible).toBe(true)
    expect(result.suggested).toBeCloseTo(27.0442, 3)
    expect(result.verification.passMagnitude).toBeGreaterThanOrEqual(0.7)
    expect(result.verification.stopMagnitude).toBeLessThanOrEqual(0.7)
  })

  it('rejects passband or stopband targets on the Nyquist boundary', () => {
    const result = solveDesignConstraints({
      settlingSeconds: 1,
      passFrequencyHz: 10,
      passMagnitude: 0.9,
      stopFrequencyHz: 50,
      stopMagnitude: 0.3,
      sampleRateHz: 100,
    })

    expect(result.feasible).toBe(false)
    expect(result.issues).toContain('stopband-outside-baseband')
  })

  it('rejects a settling target shorter than one sample period', () => {
    const result = solveDesignConstraints({
      settlingSeconds: 0.001,
      passFrequencyHz: 10,
      passMagnitude: 0.9,
      stopFrequencyHz: 20,
      stopMagnitude: 0.3,
      sampleRateHz: 100,
    })

    expect(result.feasible).toBe(false)
    expect(result.issues).toContain('settling-faster-than-sample')
  })
})

describe('discrete simulation', () => {
  it('scales relative noise and interference to exact zero for a zero-amplitude source', () => {
    const result = createSimulation({ cutoffHz: 2.5, sampleRateHz: 100, signalAmplitude: 0,
      signalOffset: 3, noiseLevel: 3, interferenceLevel: 3, durationSeconds: 0.2 })
    expect(result.input.every((point) => point.y === 3)).toBe(true)
    const short = createSimulation({ cutoffHz: 2.5, sampleRateHz: 100, durationSeconds: 0.001 })
    expect(short.minimumWindowExtended).toBe(true)
    expect(short.duration).toBe(0.01)
    expect(short.sampleCount).toBe(2)
  })
  it('matches steady sine amplitude and phase to H(z), independently of the chart', () => {
    for (const method of ['zoh', 'backward-euler']) {
      const result = createSimulation({ cutoffHz: 10, sampleRateHz: 100, method,
        signalFrequencyHz: 4, durationSeconds: 10, maxRenderedPoints: 2000 })
      const steady = result.output.slice(401)
      const sine = steady.reduce((sum, p) => sum + p.y * Math.sin(2 * Math.PI * 4 * p.x), 0) * 2 / steady.length
      const cosine = steady.reduce((sum, p) => sum + p.y * Math.cos(2 * Math.PI * 4 * p.x), 0) * 2 / steady.length
      expect(Math.hypot(sine, cosine)).toBeCloseTo(discreteMagnitudeAt(4, 10, 100, method), 10)
      expect(Math.atan2(cosine, sine) * 180 / Math.PI).toBeCloseTo(discretePhaseDegreesAt(4, 10, 100, method), 10)
    }
  })

  it('never changes exact recursion or RMS when reducing the drawing budget', () => {
    const options = { cutoffHz: 5, sampleRateHz: 1000, signalFrequencyHz: 6, noiseLevel: 0.3,
      noiseSeed: 42, durationSeconds: 1, maxIntegrationSteps: 2000 }
    const full = createSimulation({ ...options, maxRenderedPoints: 2000 })
    const reduced = createSimulation({ ...options, maxRenderedPoints: 200 })
    expect(reduced.renderedPoints).toBeLessThanOrEqual(200)
    expect(reduced.inputRms).toBe(full.inputRms)
    expect(reduced.outputRms).toBe(full.outputRms)
    for (const point of reduced.output) expect(point.y).toBe(full.output[Math.round(point.x * 1000)].y)
  })

  it('uses sample-lattice timestamps and hides undersampled continuous reference curves', () => {
    const result = createSimulation({ cutoffHz: 10, sampleRateHz: 100, signalFrequencyHz: 60,
      durationSeconds: 10.005, maxRenderedPoints: 200 })
    expect(result.duration).toBe(10)
    expect(result.sampleCount).toBe(1001)
    expect(result.analogTraceCompressed).toBe(true)
    expect(result.analogInput).toEqual([])
    expect(result.aliasTraceCompressed).toBe(true)
    expect(result.aliasReference).toEqual([])
  })

  it('keeps the requested step time when a simulation is shortened by its budget', () => {
    const result = createSimulation({ cutoffHz: 10, sampleRateHz: 1000, inputType: 'step',
      durationSeconds: 10, stepTimeRatio: 0.5, maxIntegrationSteps: 1000 })
    expect(result.truncated).toBe(true)
    expect(result.input.every((p) => p.y === 0)).toBe(true)
    expect(result.output.every((p) => p.y === 0)).toBe(true)
  })
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

  it('keeps signal and interference frequencies inside the configured analog input range', () => {
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

  it('keeps out-of-band analog inputs and reports their sampled aliases', () => {
    const result = createSimulation({
      cutoffHz: 10,
      sampleRateHz: 100,
      signalFrequencyHz: 60,
      interferenceFrequencyHz: 110,
      interferenceLevel: 0.2,
      durationSeconds: 1,
      maxRenderedPoints: 300,
    })

    expect(result.signalFrequency).toBe(60)
    expect(result.signalAliasFrequency).toBe(40)
    expect(result.interferenceFrequency).toBe(110)
    expect(result.interferenceAliasFrequency).toBe(10)
    expect(result.signalAliasing.mirrored).toBe(true)
    expect(result.analogInput.length).toBeGreaterThan(result.input.length)
  })

  it('builds a phase-correct continuous reference for a mirrored alias', () => {
    const result = createSimulation({
      cutoffHz: 10,
      sampleRateHz: 100,
      signalFrequencyHz: 60,
      signalAmplitude: 1.7,
      signalOffset: 0.4,
      signalPhaseDegrees: 25,
      noiseLevel: 0,
      interferenceLevel: 0,
      durationSeconds: 0.2,
      maxRenderedPoints: 300,
    })
    const aliasPhase = (result.aliasReferencePhaseDegrees * Math.PI) / 180

    expect(result.signalAliasFrequency).toBe(40)
    expect(result.aliasReferencePhaseDegrees).toBe(155)
    expect(result.aliasReference.length).toBeGreaterThan(100)
    for (const point of result.input.slice(0, 12)) {
      const expected = 0.4 + 1.7 * Math.sin(2 * Math.PI * 40 * point.x + aliasPhase)
      expect(point.y).toBeCloseTo(expected, 9)
    }
  })

  it('bounds MHz work by reporting a shorter exact simulation window', () => {
    const result = createSimulation({
      cutoffHz: 1_000_000,
      sampleRateHz: 100_000_000,
      signalFrequencyHz: 500_000,
      durationSeconds: 4,
      maxRenderedPoints: 600,
      maxIntegrationSteps: 2_000,
    })

    expect(result.requestedSampleCount).toBe(400_000_001)
    expect(result.sampleCount).toBe(2000)
    expect(result.simulatedSteps).toBeLessThanOrEqual(2_000)
    expect(result.renderedPoints).toBeLessThanOrEqual(601)
    expect(result.integrationStride).toBe(1)
    expect(result.approximated).toBe(false)
    expect(result.truncated).toBe(true)
    expect(result.duration).toBe(1999 / 100_000_000)
    const reference = createSimulation({ cutoffHz: 1_000_000, sampleRateHz: 100_000_000,
      signalFrequencyHz: 500_000, durationSeconds: result.duration,
      maxRenderedPoints: 600, maxIntegrationSteps: 2000 })
    expect(result.output).toEqual(reference.output)
    expect(result.inputRms).toBe(reference.inputRms)
    expect(result.outputRms).toBe(reference.outputRms)
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
