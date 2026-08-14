const TWO_PI = 2 * Math.PI
const EPSILON = 1e-9

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function positive(value, fallback = EPSILON) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function tauFromCutoff(cutoffHz) {
  return 1 / (TWO_PI * positive(cutoffHz))
}

export function cutoffFromTau(tauSeconds) {
  return 1 / (TWO_PI * positive(tauSeconds))
}

export function alphaZoh(cutoffHz, sampleRateHz) {
  const cutoff = positive(cutoffHz)
  const sampleRate = positive(sampleRateHz)
  return clamp(1 - Math.exp((-TWO_PI * cutoff) / sampleRate), 0, 1)
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

export function phaseDelaySeconds(frequencyHz, cutoffHz) {
  if (frequencyHz <= 0) return 0
  return Math.abs(phaseDegreesAt(frequencyHz, cutoffHz)) / 360 / frequencyHz
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

export function solveDesignConstraints({
  settlingSeconds,
  settlingFraction = 0.95,
  passFrequencyHz,
  passMagnitude,
  stopFrequencyHz,
  stopMagnitude,
  sampleRateHz,
}) {
  const timeLower = cutoffForSettlingTime(settlingSeconds, settlingFraction)
  const passLower = cutoffForPassband(passFrequencyHz, passMagnitude)
  const stopUpper = cutoffForStopband(stopFrequencyHz, stopMagnitude)
  const samplingUpper = positive(sampleRateHz) * 0.45
  const lower = Math.max(timeLower, passLower)
  const upper = Math.min(stopUpper, samplingUpper)
  const feasible = lower <= upper
  const suggested = feasible ? Math.sqrt(lower * upper) : null

  return {
    timeLower,
    passLower,
    stopUpper,
    samplingUpper,
    lower,
    upper,
    feasible,
    suggested,
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

function deterministicNoise(index) {
  const raw = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return (raw - Math.floor(raw)) * 2 - 1
}

function inputSample(type, time, duration, signalFrequency, noiseLevel, index) {
  if (type === 'step') {
    return time >= duration * 0.12 ? 1 : 0
  }

  if (type === 'square') {
    return Math.sin(TWO_PI * signalFrequency * time) >= 0 ? 1 : -1
  }

  const carrier = Math.sin(TWO_PI * signalFrequency * time)
  const highFrequencyRipple = Math.sin(TWO_PI * signalFrequency * 9 * time) * noiseLevel * 0.42
  return carrier + highFrequencyRipple + deterministicNoise(index) * noiseLevel
}

export function createSimulation({
  cutoffHz,
  sampleRateHz,
  method = 'zoh',
  inputType = 'noise',
  signalFrequencyHz = 1,
  noiseLevel = 0.35,
  durationSeconds,
  maxRenderedPoints = 520,
}) {
  const cutoff = positive(cutoffHz)
  const sampleRate = positive(sampleRateHz)
  const signalFrequency = clamp(positive(signalFrequencyHz), 0.01, sampleRate * 0.45)
  const duration =
    durationSeconds ?? clamp(Math.max(5 * tauFromCutoff(cutoff), 4 / signalFrequency), 1.2, 8)
  const sampleCount = Math.max(2, Math.ceil(duration * sampleRate) + 1)
  const alpha = alphaForMethod(cutoff, sampleRate, method)
  const stride = Math.max(1, Math.ceil(sampleCount / maxRenderedPoints))
  const input = []
  const output = []
  let filtered = 0
  let inputEnergy = 0
  let outputEnergy = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const sample = inputSample(
      inputType,
      time,
      duration,
      signalFrequency,
      noiseLevel,
      index,
    )
    filtered += alpha * (sample - filtered)
    inputEnergy += sample * sample
    outputEnergy += filtered * filtered

    if (index % stride === 0 || index === sampleCount - 1) {
      input.push({ x: time, y: sample })
      output.push({ x: time, y: filtered })
    }
  }

  return {
    input,
    output,
    duration,
    alpha,
    inputRms: Math.sqrt(inputEnergy / sampleCount),
    outputRms: Math.sqrt(outputEnergy / sampleCount),
  }
}
