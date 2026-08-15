const TWO_PI = 2 * Math.PI
const EPSILON = 1e-9

export const CUTOFF_FREQUENCY_RANGE = Object.freeze({
  minimum: 0.001,
  maximum: 50_000_000,
})

export const SAMPLE_RATE_RANGE = Object.freeze({
  minimum: 1,
  maximum: 200_000_000,
})

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function positive(value, fallback = EPSILON) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function tauFromCutoff(cutoffHz) {
  return 1 / (TWO_PI * positive(cutoffHz))
}

export function samplePeriodSeconds(sampleRateHz) {
  return 1 / positive(sampleRateHz)
}

export function nyquistFrequency(sampleRateHz) {
  return positive(sampleRateHz) / 2
}

export function aliasingInfo(frequencyHz, sampleRateHz) {
  const sampleRate = positive(sampleRateHz)
  const inputFrequency = Math.abs(Number.isFinite(frequencyHz) ? frequencyHz : 0)
  const nyquist = sampleRate / 2
  const remainder = inputFrequency % sampleRate
  const alias = remainder <= nyquist ? remainder : sampleRate - remainder
  const nyquistZone = Math.max(1, Math.ceil(inputFrequency / nyquist))
  const mirrored = nyquistZone % 2 === 0
  const tolerance = Math.max(EPSILON, sampleRate * 1e-12)
  const aliasFrequency = Math.abs(alias) <= tolerance ? 0 : alias
  const atNyquist = Math.abs(aliasFrequency - nyquist) <= tolerance
  const aliased = inputFrequency > nyquist + tolerance

  return {
    inputFrequency,
    sampleRate,
    nyquistFrequency: nyquist,
    remainder,
    aliasFrequency,
    nearestSampleMultiple: Math.round(inputFrequency / sampleRate),
    nyquistZone,
    mirrored,
    atNyquist,
    aliased,
    ambiguous: atNyquist || aliased,
  }
}

export function aliasFrequency(frequencyHz, sampleRateHz) {
  return aliasingInfo(frequencyHz, sampleRateHz).aliasFrequency
}

export function cutoffFromTau(tauSeconds) {
  return 1 / (TWO_PI * positive(tauSeconds))
}

export function alphaZoh(cutoffHz, sampleRateHz) {
  const cutoff = positive(cutoffHz)
  const sampleRate = positive(sampleRateHz)
  return clamp(-Math.expm1((-TWO_PI * cutoff) / sampleRate), 0, 1)
}

export function alphaBackwardEuler(cutoffHz, sampleRateHz) {
  const cutoff = positive(cutoffHz)
  const sampleRate = positive(sampleRateHz)
  const omega = TWO_PI * cutoff
  return clamp(omega / (sampleRate + omega), 0, 1)
}

export function alphaForMethod(cutoffHz, sampleRateHz, method = 'zoh') {
  return method === 'backward-euler'
    ? alphaBackwardEuler(cutoffHz, sampleRateHz)
    : alphaZoh(cutoffHz, sampleRateHz)
}

export function magnitudeAt(frequencyHz, cutoffHz) {
  const ratio = Math.max(0, frequencyHz) / positive(cutoffHz)
  return 1 / Math.sqrt(1 + ratio * ratio)
}

export function gainDbAt(frequencyHz, cutoffHz) {
  return 20 * Math.log10(Math.max(magnitudeAt(frequencyHz, cutoffHz), EPSILON))
}

export function phaseDegreesAt(frequencyHz, cutoffHz) {
  const ratio = Math.max(0, frequencyHz) / positive(cutoffHz)
  return (-Math.atan(ratio) * 180) / Math.PI
}

export function discreteMagnitudeAt(frequencyHz, cutoffHz, sampleRateHz, method = 'zoh') {
  const sampleRate = positive(sampleRateHz)
  const alpha = alphaForMethod(cutoffHz, sampleRate, method)
  const pole = 1 - alpha
  const omega = (TWO_PI * aliasFrequency(frequencyHz, sampleRate)) / sampleRate
  const halfAngleSine = Math.sin(omega / 2)
  const denominator = Math.sqrt(
    alpha * alpha + 4 * pole * halfAngleSine * halfAngleSine,
  )
  return denominator <= Number.EPSILON ? 1 : alpha / denominator
}

export function discreteGainDbAt(frequencyHz, cutoffHz, sampleRateHz, method = 'zoh') {
  return 20 * Math.log10(Math.max(
    discreteMagnitudeAt(frequencyHz, cutoffHz, sampleRateHz, method),
    EPSILON,
  ))
}

export function discretePhaseDegreesAt(frequencyHz, cutoffHz, sampleRateHz, method = 'zoh') {
  const sampleRate = positive(sampleRateHz)
  const alpha = alphaForMethod(cutoffHz, sampleRate, method)
  const pole = 1 - alpha
  const omega = (TWO_PI * aliasFrequency(frequencyHz, sampleRate)) / sampleRate
  const halfAngleSine = Math.sin(omega / 2)
  const phase = -Math.atan2(
    pole * Math.sin(omega),
    alpha + 2 * pole * halfAngleSine * halfAngleSine,
  )
  const phaseDegrees = (phase * 180) / Math.PI
  return Math.abs(phaseDegrees) <= 1e-12 ? 0 : phaseDegrees
}

export function discreteGroupDelaySecondsAt(
  frequencyHz,
  cutoffHz,
  sampleRateHz,
  method = 'zoh',
) {
  const sampleRate = positive(sampleRateHz)
  const alpha = alphaForMethod(cutoffHz, sampleRate, method)
  const pole = 1 - alpha
  const omega = (TWO_PI * aliasFrequency(frequencyHz, sampleRate)) / sampleRate
  const halfAngleSine = Math.sin(omega / 2)
  const oneMinusCosine = 2 * halfAngleSine * halfAngleSine
  const denominator = alpha * alpha + 2 * pole * oneMinusCosine

  if (denominator <= Number.EPSILON) return 0

  const delaySamples = (pole * (alpha - oneMinusCosine)) / denominator
  return delaySamples / sampleRate
}

export function discreteTimeConstantSeconds(cutoffHz, sampleRateHz, method = 'zoh') {
  const sampleRate = positive(sampleRateHz)
  const alpha = alphaForMethod(cutoffHz, sampleRate, method)

  if (alpha >= 1) return 0
  return -1 / (sampleRate * Math.log1p(-alpha))
}

export function discreteSettlingTime(
  cutoffHz,
  sampleRateHz,
  method = 'zoh',
  fraction = 0.95,
) {
  const safeFraction = clamp(fraction, EPSILON, 1 - EPSILON)
  return -discreteTimeConstantSeconds(cutoffHz, sampleRateHz, method) * Math.log(1 - safeFraction)
}

export function digitalMappingDiagnostics(cutoffHz, sampleRateHz, method = 'zoh') {
  const cutoff = positive(cutoffHz)
  const sampleRate = positive(sampleRateHz)
  const nyquist = sampleRate / 2
  const tolerance = Math.max(EPSILON, sampleRate * 1e-12)
  const cutoffInBaseband = cutoff < nyquist - tolerance

  if (!cutoffInBaseband) {
    return {
      cutoffInBaseband,
      closeToAnalog: false,
      magnitude: null,
      gainDb: null,
      phaseDegrees: null,
      gainErrorDb: null,
      phaseErrorDegrees: null,
    }
  }

  const magnitude = discreteMagnitudeAt(cutoff, cutoff, sampleRate, method)
  const gainDb = 20 * Math.log10(Math.max(magnitude, EPSILON))
  const phaseDegrees = discretePhaseDegreesAt(cutoff, cutoff, sampleRate, method)
  const gainErrorDb = gainDb - (-10 * Math.log10(2))
  const phaseErrorDegrees = phaseDegrees - (-45)

  return {
    cutoffInBaseband,
    closeToAnalog: Math.abs(gainErrorDb) <= 0.5 && Math.abs(phaseErrorDegrees) <= 5,
    magnitude,
    gainDb,
    phaseDegrees,
    gainErrorDb,
    phaseErrorDegrees,
  }
}

export function phaseDelaySeconds(frequencyHz, cutoffHz) {
  if (frequencyHz <= 0) return 0
  return Math.abs(phaseDegreesAt(frequencyHz, cutoffHz)) / 360 / frequencyHz
}

export function groupDelaySecondsAt(frequencyHz, cutoffHz) {
  const ratio = Math.max(0, frequencyHz) / positive(cutoffHz)
  return tauFromCutoff(cutoffHz) / (1 + ratio * ratio)
}

export function simulationFrequencyLimits(sampleRateHz) {
  const minimum = 0.001
  return {
    minimum,
    maximum: Math.max(minimum, positive(sampleRateHz) * 2),
  }
}

export function createAliasingFoldResponse(sampleRateHz, pointCount = 321) {
  const sampleRate = positive(sampleRateHz)
  const safePointCount = Math.max(5, Math.round(pointCount))
  const maximumFrequency = sampleRate * 2

  return Array.from({ length: safePointCount }, (_, index) => {
    const frequency = (index / (safePointCount - 1)) * maximumFrequency
    return { x: frequency, y: aliasFrequency(frequency, sampleRate) }
  })
}

export function settlingTime(tauSeconds, fraction = 0.95) {
  const safeFraction = clamp(fraction, EPSILON, 1 - EPSILON)
  return -positive(tauSeconds) * Math.log(1 - safeFraction)
}

export function cutoffForSettlingTime(timeSeconds, fraction = 0.95) {
  const tauMaximum = positive(timeSeconds) / -Math.log(1 - clamp(fraction, EPSILON, 1 - EPSILON))
  return cutoffFromTau(tauMaximum)
}

export function cutoffForPassband(frequencyHz, minimumMagnitude) {
  const gain = clamp(minimumMagnitude, EPSILON, 1 - EPSILON)
  return positive(frequencyHz) / Math.sqrt(1 / (gain * gain) - 1)
}

export function cutoffForStopband(frequencyHz, maximumMagnitude) {
  const gain = clamp(maximumMagnitude, EPSILON, 1 - EPSILON)
  return positive(frequencyHz) / Math.sqrt(1 / (gain * gain) - 1)
}

function findLogCutoffThreshold(predicate) {
  const minimum = CUTOFF_FREQUENCY_RANGE.minimum
  const maximum = CUTOFF_FREQUENCY_RANGE.maximum

  if (predicate(minimum)) return minimum
  if (!predicate(maximum)) return Number.POSITIVE_INFINITY

  let lowerLog = Math.log(minimum)
  let upperLog = Math.log(maximum)
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middleLog = (lowerLog + upperLog) / 2
    if (predicate(Math.exp(middleLog))) upperLog = middleLog
    else lowerLog = middleLog
  }
  return Math.exp(upperLog)
}

function cutoffForDiscretePassband(frequencyHz, minimumMagnitude, sampleRateHz, method) {
  const gain = clamp(minimumMagnitude, EPSILON, 1 - EPSILON)
  return findLogCutoffThreshold(
    (cutoffHz) => discreteMagnitudeAt(frequencyHz, cutoffHz, sampleRateHz, method) >= gain,
  )
}

function cutoffForDiscreteStopband(frequencyHz, maximumMagnitude, sampleRateHz, method) {
  const gain = clamp(maximumMagnitude, EPSILON, 1 - EPSILON)
  const minimum = CUTOFF_FREQUENCY_RANGE.minimum
  const maximum = CUTOFF_FREQUENCY_RANGE.maximum
  const gainAtMinimum = discreteMagnitudeAt(frequencyHz, minimum, sampleRateHz, method)
  const gainAtMaximum = discreteMagnitudeAt(frequencyHz, maximum, sampleRateHz, method)

  if (gainAtMinimum > gain) return 0
  if (gainAtMaximum <= gain) return maximum

  let lowerLog = Math.log(minimum)
  let upperLog = Math.log(maximum)
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middleLog = (lowerLog + upperLog) / 2
    const middleCutoff = Math.exp(middleLog)
    if (discreteMagnitudeAt(frequencyHz, middleCutoff, sampleRateHz, method) <= gain) {
      lowerLog = middleLog
    } else {
      upperLog = middleLog
    }
  }
  return Math.exp(lowerLog)
}

function cutoffForDiscreteSettlingTime(
  timeSeconds,
  fraction,
  sampleRateHz,
  method,
) {
  const maximumTime = positive(timeSeconds)
  return findLogCutoffThreshold(
    (cutoffHz) => discreteSettlingTime(
      cutoffHz,
      sampleRateHz,
      method,
      fraction,
    ) <= maximumTime,
  )
}

export function solveDesignConstraints({
  settlingSeconds,
  settlingFraction = 0.95,
  passFrequencyHz,
  passMagnitude,
  stopFrequencyHz,
  stopMagnitude,
  sampleRateHz,
  method = 'zoh',
}) {
  const sampleRate = positive(sampleRateHz)
  const nyquist = sampleRate / 2
  const tolerance = Math.max(EPSILON, sampleRate * 1e-12)
  const passFrequencyValid = Number.isFinite(passFrequencyHz)
    && passFrequencyHz > 0
    && passFrequencyHz < nyquist - tolerance
  const stopFrequencyValid = Number.isFinite(stopFrequencyHz)
    && stopFrequencyHz > 0
    && stopFrequencyHz < nyquist - tolerance
  const frequencyOrderValid = passFrequencyValid
    && stopFrequencyValid
    && passFrequencyHz < stopFrequencyHz
  const settlingTimeValid = Number.isFinite(settlingSeconds)
    && settlingSeconds >= 1 / sampleRate - tolerance / sampleRate
  const issues = []

  if (!settlingTimeValid) issues.push('settling-faster-than-sample')
  if (!passFrequencyValid) issues.push('passband-outside-baseband')
  if (!stopFrequencyValid) issues.push('stopband-outside-baseband')
  if (passFrequencyValid && stopFrequencyValid && !frequencyOrderValid) {
    issues.push('passband-not-below-stopband')
  }

  const timeLower = cutoffForDiscreteSettlingTime(
    settlingSeconds,
    settlingFraction,
    sampleRate,
    method,
  )
  const passLower = passFrequencyValid
    ? cutoffForDiscretePassband(passFrequencyHz, passMagnitude, sampleRate, method)
    : Number.POSITIVE_INFINITY
  const stopUpper = stopFrequencyValid
    ? cutoffForDiscreteStopband(stopFrequencyHz, stopMagnitude, sampleRate, method)
    : 0
  const lower = Math.max(timeLower, passLower)
  const upper = Math.min(stopUpper, CUTOFF_FREQUENCY_RANGE.maximum)
  const feasible = issues.length === 0
    && Number.isFinite(lower)
    && lower <= upper
  const suggested = feasible ? Math.sqrt(lower * upper) : null
  const verification = suggested === null ? null : {
    settlingSeconds: discreteSettlingTime(
      suggested,
      sampleRate,
      method,
      settlingFraction,
    ),
    passMagnitude: discreteMagnitudeAt(
      passFrequencyHz,
      suggested,
      sampleRate,
      method,
    ),
    stopMagnitude: discreteMagnitudeAt(
      stopFrequencyHz,
      suggested,
      sampleRate,
      method,
    ),
  }

  return {
    timeLower,
    passLower,
    stopUpper,
    nyquistFrequency: nyquist,
    method,
    issues,
    lower,
    upper,
    feasible,
    suggested,
    verification,
  }
}

export function createStepResponse(cutoffHz, pointCount = 181) {
  const tau = tauFromCutoff(cutoffHz)
  const maxTime = tau * 5
  return Array.from({ length: pointCount }, (_, index) => {
    const time = (index / (pointCount - 1)) * maxTime
    return { x: time, y: 1 - Math.exp(-time / tau) }
  })
}

export function createFrequencyResponse(cutoffHz, pointCount = 241) {
  const cutoff = positive(cutoffHz)
  const minimum = cutoff / 100
  const maximum = cutoff * 100
  const logMinimum = Math.log10(minimum)
  const logSpan = Math.log10(maximum) - logMinimum

  return Array.from({ length: pointCount }, (_, index) => {
    const frequency = 10 ** (logMinimum + (index / (pointCount - 1)) * logSpan)
    return {
      x: frequency,
      magnitude: magnitudeAt(frequency, cutoff),
      gainDb: gainDbAt(frequency, cutoff),
      phase: phaseDegreesAt(frequency, cutoff),
    }
  })
}

function deterministicNoise(index, seed = 1) {
  const raw = Math.sin((index + seed * 101.37) * 12.9898 + 78.233) * 43758.5453
  return (raw - Math.floor(raw)) * 2 - 1
}

function inputSample({
  type,
  time,
  duration,
  signalFrequency,
  signalAmplitude,
  signalOffset,
  signalPhaseDegrees,
  noiseLevel,
  noiseSeed,
  interferenceFrequency,
  interferenceLevel,
  interferencePhaseDegrees,
  squareDutyCycle,
  stepTimeRatio,
  stepInitialValue,
  stepFinalValue,
  index,
}) {
  let baseSample
  let referenceAmplitude

  if (type === 'step') {
    baseSample = time >= duration * stepTimeRatio ? stepFinalValue : stepInitialValue
    referenceAmplitude = Math.max(Math.abs(stepFinalValue - stepInitialValue), EPSILON)
  } else if (type === 'square') {
    const rawCyclePosition = signalFrequency * time + signalPhaseDegrees / 360
    const cyclePosition = ((rawCyclePosition % 1) + 1) % 1
    baseSample = signalOffset + (
      cyclePosition < squareDutyCycle ? signalAmplitude : -signalAmplitude
    )
    referenceAmplitude = Math.max(signalAmplitude, EPSILON)
  } else {
    const phaseRadians = (signalPhaseDegrees * Math.PI) / 180
    baseSample = signalOffset + (
      Math.sin(TWO_PI * signalFrequency * time + phaseRadians) * signalAmplitude
    )
    referenceAmplitude = Math.max(signalAmplitude, EPSILON)
  }

  const noise = deterministicNoise(index, noiseSeed) * referenceAmplitude * noiseLevel
  const interferencePhase = (interferencePhaseDegrees * Math.PI) / 180
  const interference = Math.sin(
    TWO_PI * interferenceFrequency * time + interferencePhase,
  ) * referenceAmplitude * interferenceLevel
  return baseSample + noise + interference
}

export function createSimulation({
  cutoffHz,
  sampleRateHz,
  method = 'zoh',
  inputType = 'sine',
  signalFrequencyHz = 1,
  signalAmplitude = 1,
  signalOffset = 0,
  signalPhaseDegrees = 0,
  noiseLevel = 0,
  noiseSeed = 1,
  interferenceFrequencyHz = 9,
  interferenceLevel = 0,
  interferencePhaseDegrees = 0,
  squareDutyCycle = 0.5,
  stepTimeRatio = 0.12,
  stepInitialValue = 0,
  stepFinalValue = 1,
  initialOutput = 0,
  cyclesToShow = 4,
  durationSeconds,
  maxRenderedPoints = 520,
  maxIntegrationSteps = 50_000,
}) {
  const cutoff = positive(cutoffHz)
  const sampleRate = positive(sampleRateHz)
  const frequencyLimits = simulationFrequencyLimits(sampleRate)
  const signalFrequency = clamp(
    positive(signalFrequencyHz),
    frequencyLimits.minimum,
    frequencyLimits.maximum,
  )
  const amplitude = clamp(Number.isFinite(signalAmplitude) ? Math.abs(signalAmplitude) : 1, 0, 1_000_000)
  const offset = clamp(Number.isFinite(signalOffset) ? signalOffset : 0, -1_000_000, 1_000_000)
  const signalPhase = clamp(Number.isFinite(signalPhaseDegrees) ? signalPhaseDegrees : 0, -3600, 3600)
  const noise = clamp(Number.isFinite(noiseLevel) ? noiseLevel : 0, 0, 10)
  const safeNoiseSeed = Math.round(clamp(Number.isFinite(noiseSeed) ? noiseSeed : 1, 0, 1_000_000))
  const interferenceFrequency = clamp(
    positive(interferenceFrequencyHz),
    frequencyLimits.minimum,
    frequencyLimits.maximum,
  )
  const interference = clamp(
    Number.isFinite(interferenceLevel) ? interferenceLevel : 0,
    0,
    10,
  )
  const interferencePhase = clamp(
    Number.isFinite(interferencePhaseDegrees) ? interferencePhaseDegrees : 0,
    -3600,
    3600,
  )
  const dutyCycle = clamp(squareDutyCycle, 0.05, 0.95)
  const stepStart = clamp(stepTimeRatio, 0.02, 0.8)
  const stepInitial = clamp(Number.isFinite(stepInitialValue) ? stepInitialValue : 0, -1_000_000, 1_000_000)
  const stepFinal = clamp(Number.isFinite(stepFinalValue) ? stepFinalValue : 1, -1_000_000, 1_000_000)
  const initialState = clamp(Number.isFinite(initialOutput) ? initialOutput : 0, -1_000_000, 1_000_000)
  const visibleCycles = clamp(cyclesToShow, 0.25, 100)
  const signalAliasing = aliasingInfo(signalFrequency, sampleRate)
  const interferenceAliasing = aliasingInfo(interferenceFrequency, sampleRate)
  const minimumDuration = 24 / sampleRate
  const visibleSignalFrequency = positive(signalAliasing.aliasFrequency, sampleRate)
  const naturalDuration = inputType === 'step'
    ? 6 * tauFromCutoff(cutoff)
    : visibleCycles / visibleSignalFrequency
  const duration = durationSeconds === undefined
    ? clamp(Math.max(naturalDuration, minimumDuration), minimumDuration, 1_000_000)
    : clamp(positive(durationSeconds), minimumDuration, 1_000_000)
  const sampleCount = Math.max(
    2,
    Math.ceil(Math.min(duration * sampleRate, Number.MAX_SAFE_INTEGER - 1)) + 1,
  )
  const alpha = alphaForMethod(cutoff, sampleRate, method)
  const integrationLimit = Math.max(32, Math.round(maxIntegrationSteps))
  const integrationStride = Math.max(1, Math.ceil(sampleCount / integrationLimit))
  const simulatedSteps = Math.ceil(sampleCount / integrationStride)
  const renderStride = Math.max(1, Math.ceil(simulatedSteps / maxRenderedPoints))
  const input = []
  const output = []
  let filtered = initialState
  let inputEnergy = 0
  let outputEnergy = 0
  let simulatedIndex = 0

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += integrationStride) {
    const blockSize = Math.min(integrationStride, sampleCount - sampleIndex)
    const endSampleIndex = sampleIndex + blockSize - 1
    const time = Math.min(endSampleIndex / sampleRate, duration)
    const sample = inputSample({
      type: inputType,
      time,
      duration,
      signalFrequency,
      signalAmplitude: amplitude,
      signalOffset: offset,
      signalPhaseDegrees: signalPhase,
      noiseLevel: noise,
      noiseSeed: safeNoiseSeed,
      interferenceFrequency,
      interferenceLevel: interference,
      interferencePhaseDegrees: interferencePhase,
      squareDutyCycle: dutyCycle,
      stepTimeRatio: stepStart,
      stepInitialValue: stepInitial,
      stepFinalValue: stepFinal,
      index: simulatedIndex,
    })
    const blockAlpha = 1 - (1 - alpha) ** blockSize
    filtered += blockAlpha * (sample - filtered)
    inputEnergy += sample * sample * blockSize
    outputEnergy += filtered * filtered * blockSize

    if (simulatedIndex % renderStride === 0 || endSampleIndex === sampleCount - 1) {
      input.push({ x: time, y: sample })
      output.push({ x: time, y: filtered })
    }
    simulatedIndex += 1
  }

  const analogInput = []
  let analogTraceCompressed = false
  if (inputType !== 'step') {
    const highestAnalogFrequency = Math.max(
      signalFrequency,
      interference > 0 ? interferenceFrequency : 0,
    )
    const analogPointBudget = Math.round(clamp(maxRenderedPoints * 6, 720, 4_800))
    const desiredAnalogPoints = Math.ceil(duration * highestAnalogFrequency * 12) + 1
    analogTraceCompressed = desiredAnalogPoints > analogPointBudget
    const analogPointCount = Math.round(clamp(
      desiredAnalogPoints,
      Math.min(240, analogPointBudget),
      analogPointBudget,
    ))

    for (let index = 0; index < analogPointCount; index += 1) {
      const time = (index / (analogPointCount - 1)) * duration
      analogInput.push({
        x: time,
        y: inputSample({
          type: inputType,
          time,
          duration,
          signalFrequency,
          signalAmplitude: amplitude,
          signalOffset: offset,
          signalPhaseDegrees: signalPhase,
          noiseLevel: 0,
          noiseSeed: safeNoiseSeed,
          interferenceFrequency,
          interferenceLevel: interference,
          interferencePhaseDegrees: interferencePhase,
          squareDutyCycle: dutyCycle,
          stepTimeRatio: stepStart,
          stepInitialValue: stepInitial,
          stepFinalValue: stepFinal,
          index,
        }),
      })
    }
  }

  const aliasReference = []
  const aliasReferencePhaseDegrees = signalAliasing.mirrored
    ? 180 - signalPhase
    : signalPhase
  if (inputType === 'sine') {
    const aliasPointBudget = Math.round(clamp(maxRenderedPoints * 3, 360, 2_400))
    const visibleAliasCycles = duration * Math.max(signalAliasing.aliasFrequency, 1 / duration)
    const aliasPointCount = Math.round(clamp(
      Math.ceil(visibleAliasCycles * 24) + 1,
      Math.min(240, aliasPointBudget),
      aliasPointBudget,
    ))
    const aliasPhaseRadians = (aliasReferencePhaseDegrees * Math.PI) / 180

    for (let index = 0; index < aliasPointCount; index += 1) {
      const time = (index / (aliasPointCount - 1)) * duration
      aliasReference.push({
        x: time,
        y: offset + amplitude * Math.sin(
          TWO_PI * signalAliasing.aliasFrequency * time + aliasPhaseRadians,
        ),
      })
    }
  }

  return {
    analogInput,
    analogTraceCompressed,
    aliasReference,
    aliasReferencePhaseDegrees,
    input,
    output,
    duration,
    alpha,
    signalFrequency,
    signalAliasFrequency: signalAliasing.aliasFrequency,
    signalAliasing,
    interferenceFrequency,
    interferenceAliasFrequency: interferenceAliasing.aliasFrequency,
    interferenceAliasing,
    sampleCount,
    simulatedSteps,
    integrationStride,
    renderedPoints: input.length,
    approximated: integrationStride > 1,
    inputRms: Math.sqrt(inputEnergy / sampleCount),
    outputRms: Math.sqrt(outputEnergy / sampleCount),
  }
}
