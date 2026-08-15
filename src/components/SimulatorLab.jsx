import { lazy, Suspense, useMemo, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import EngineeringFrequencyInput from './EngineeringFrequencyInput.jsx'
import {
  aliasingInfo,
  clamp,
  createSimulation,
  CUTOFF_FREQUENCY_RANGE,
  discreteGainDbAt,
  discreteMagnitudeAt,
  discretePhaseDegreesAt,
  gainDbAt,
  groupDelaySecondsAt,
  magnitudeAt,
  nyquistFrequency,
  SAMPLE_RATE_RANGE,
  samplePeriodSeconds,
  settlingTime,
  simulationFrequencyLimits,
  tauFromCutoff,
} from '../lib/filterMath.js'
import {
  formatEngineeringRate,
  formatFrequency,
  formatInteger,
  formatNumber,
  formatPercent,
  formatSeconds,
} from '../lib/format.js'

const INPUT_TYPES = [
  { id: 'sine', label: '正弦波' },
  { id: 'square', label: '方波' },
  { id: 'step', label: '阶跃' },
]

const SimulatorTimeChart = lazy(() => import('./SimulatorTimeChart.jsx'))
const SimulatorFrequencyChart = lazy(() => import('./SimulatorFrequencyChart.jsx'))

function seriesDomain(...dataSets) {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const data of dataSets) {
    for (const point of data) {
      minimum = Math.min(minimum, point.y)
      maximum = Math.max(maximum, point.y)
    }
  }
  const span = Math.max(0.2, maximum - minimum)
  return [minimum - span * 0.12, maximum + span * 0.12]
}

function describeAliasing(info) {
  if (!info.aliased) return '第 1 Nyquist 区 · 不折回'
  return `第 ${info.nyquistZone} Nyquist 区 · ${info.mirrored ? '镜像折回' : '平移折回'}`
}

function describeFrequencyZone(ratio) {
  if (ratio < 0.3) return '远低于 fc，稳态幅值基本保留'
  if (ratio < 0.8) return '正在接近 fc，衰减与相位滞后开始明显'
  if (ratio < 1.5) return '位于截止点附近，最适合观察 −3 dB 与相位变化'
  if (ratio < 5) return '高于 fc，输出幅值明显减小'
  return '远高于 fc，主要观察强衰减与近 −90° 相位'
}

function normalizeFrequencyPresets(candidates, minimum, maximum) {
  const seen = new Set()
  return candidates.flatMap((candidate) => {
    const value = clamp(candidate.value, minimum, maximum)
    const key = value.toPrecision(10)
    if (seen.has(key)) return []
    seen.add(key)
    return [{ ...candidate, value }]
  })
}

function FrequencyControl({
  id,
  label,
  value,
  minimum,
  maximum,
  onChange,
  hint,
  presets = [],
  accent = 'accent-orange',
  className = '',
}) {
  const safeValue = clamp(value, minimum, maximum)

  function commit(nextValue) {
    if (!Number.isFinite(nextValue)) return
    onChange(clamp(nextValue, minimum, maximum))
  }

  return (
    <div className={`control-group frequency-control-group ${className}`}>
      <div className="control-label-row">
        <label htmlFor={`${id}-range`}>{label}</label>
        <EngineeringFrequencyInput
          compact
          valueHz={safeValue}
          minimumHz={minimum}
          maximumHz={maximum}
          ariaLabel={label}
          onChange={commit}
        />
      </div>
      <input
        id={`${id}-range`}
        className={`range-control ${accent}`}
        type="range"
        min={Math.log10(minimum)}
        max={Math.log10(maximum)}
        step={0.001}
        value={Math.log10(safeValue)}
        aria-label={`以对数刻度调整${label}`}
        onChange={(event) => commit(10 ** Number(event.target.value))}
      />
      <div className="range-scale"><span>{formatFrequency(minimum)}</span><span>{formatFrequency(maximum)}</span></div>
      {presets.length ? (
        <div className="frequency-presets" role="group" aria-label={`${label}快捷值`}>
          {presets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => commit(preset.value)}>
              <span>{preset.label}</span>
              <small>{formatFrequency(preset.value)}</small>
            </button>
          ))}
        </div>
      ) : null}
      {hint ? <p>{hint}</p> : null}
    </div>
  )
}

function RangeField({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
  unit = '',
  minimumLabel,
  maximumLabel,
  accent = 'accent-lime',
  scale = 'linear',
}) {
  const safeValue = clamp(value, minimum, maximum)
  const sliderMinimum = scale === 'log' ? Math.log10(minimum) : minimum
  const sliderMaximum = scale === 'log' ? Math.log10(maximum) : maximum
  const sliderValue = scale === 'log' ? Math.log10(safeValue) : safeValue

  function commit(nextValue) {
    if (!Number.isFinite(nextValue)) return
    onChange(clamp(nextValue, minimum, maximum))
  }

  return (
    <div className="range-field">
      <div className="control-label-row">
        <label htmlFor={id}>{label}</label>
        <label className="parameter-number-input">
          <input
            type="number"
            value={Number(safeValue.toPrecision(7))}
            min={minimum}
            max={maximum}
            step={step}
            aria-label={`${label}数值`}
            onChange={(event) => commit(Number(event.target.value))}
          />
          {unit ? <span>{unit}</span> : null}
        </label>
      </div>
      <input
        id={id}
        className={`range-control ${accent}`}
        type="range"
        min={sliderMinimum}
        max={sliderMaximum}
        step={scale === 'log' ? 0.001 : step}
        value={sliderValue}
        onChange={(event) => commit(
          scale === 'log' ? 10 ** Number(event.target.value) : Number(event.target.value),
        )}
      />
      <div className="range-scale"><span>{minimumLabel}</span><span>{maximumLabel}</span></div>
    </div>
  )
}

function createDiscreteResponseData(cutoffHz, sampleRateHz, method) {
  const nyquist = sampleRateHz / 2
  const minimum = Math.max(1e-9, Math.min(cutoffHz / 100, nyquist / 1000))
  const maximum = Math.max(minimum * 10, Math.min(cutoffHz * 100, nyquist * 0.98))
  const logMinimum = Math.log10(minimum)
  const logSpan = Math.log10(maximum) - logMinimum
  const frequencies = Array.from(
    { length: 121 },
    (_, index) => 10 ** (logMinimum + (logSpan * index) / 120),
  )
  const ticks = Array.from(
    { length: 5 },
    (_, index) => 10 ** (logMinimum + (logSpan * index) / 4),
  )
  const gain = frequencies.map((frequency) => ({
    x: frequency,
    y: discreteGainDbAt(frequency, cutoffHz, sampleRateHz, method),
  }))
  const phase = frequencies.map((frequency) => ({
    x: frequency,
    y: discretePhaseDegreesAt(frequency, cutoffHz, sampleRateHz, method),
  }))
  let minimumGain = 0
  for (const point of gain) minimumGain = Math.min(minimumGain, point.y)

  return {
    domain: [minimum, maximum],
    ticks,
    gain,
    phase,
    gainDomain: [Math.max(-120, Math.floor(minimumGain / 10) * 10), 2],
  }
}

function ParameterSection({ index, eyebrow, title, description, action, children }) {
  return (
    <section className="simulator-parameter-section">
      <header>
        <div><span>{index} / {eyebrow}</span><h3>{title}</h3><p>{description}</p></div>
        {action ?? null}
      </header>
      <div className="simulator-parameter-section-body">{children}</div>
    </section>
  )
}

function MetricCluster({ eyebrow, title, metrics }) {
  return (
    <article className="simulator-result-group">
      <header><span>{eyebrow}</span><h3>{title}</h3></header>
      <div>
        {metrics.map((metric) => (
          <div className="simulator-result-metric" key={`${title}-${metric.label}`}>
            <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
          </div>
        ))}
      </div>
    </article>
  )
}

function TransferResponsePanel({
  response,
  cutoffHz,
  measurementFrequencyHz,
  inputType,
  gain,
  gainDb,
  phase,
  method,
}) {
  return (
    <section className="simulator-analysis-panel simulator-right-card" aria-label="数字滤波器幅相响应">
      <header className="simulator-card-heading">
        <div><span>02 / FREQUENCY RESPONSE</span><h3>一张图对照幅值衰减与相位滞后</h3><p>共用对数频率轴，左轴读取 dB，右轴读取相位；图例可单独开关，滚轮可缩放频段。</p></div>
        <div className="analysis-current-point">
          <span>{inputType === 'step' ? '@ fc' : '@ f_alias'}</span>
          <strong>{formatNumber(gainDb, 3)} dB</strong>
          <small>{formatPercent(gain, 2)} · {formatNumber(phase, 2)}°</small>
        </div>
      </header>
      <Suspense fallback={<ChartLoadingFallback label="正在加载专业幅相分析控件" />}>
        <SimulatorFrequencyChart
          response={response}
          cutoffHz={cutoffHz}
          measurementFrequencyHz={measurementFrequencyHz}
          gainDb={gainDb}
          phase={phase}
        />
      </Suspense>
      <footer><code>{method === 'zoh' ? 'ZOH: α = 1 − exp(−2πfc/fs)' : 'Backward Euler: α = 2πfc/(fs + 2πfc)'}</code><span>数字频率只在 0 ～ fN 内唯一</span></footer>
    </section>
  )
}

function ChartLoadingFallback({ label }) {
  return (
    <div className="echart-loading-state" role="status">
      <span className="screen-light" />
      <strong>{label}</strong>
    </div>
  )
}

function LiveAliasingStrip({
  inputType,
  signalFrequencyHz,
  signalInfo,
  sampleRateHz,
  presets,
  onSelectPreset,
}) {
  const nyquist = nyquistFrequency(sampleRateHz)

  if (inputType === 'step') {
    return (
      <div className="live-alias-console is-step">
        <div><span>NYQUIST / WIDE SPECTRUM</span><strong>阶跃没有唯一的折回频率</strong></div>
        <p>阶跃边沿包含宽频谱；ADC 前仍需用模拟抗混叠滤波器限制高于 {formatFrequency(nyquist)} 的能量。</p>
      </div>
    )
  }

  return (
    <div className={`live-alias-console ${signalInfo.aliased ? 'is-aliasing' : 'is-safe'}`}>
      <div className="live-alias-flow" aria-live="polite">
        <div>
          <span>模拟输入 fin</span>
          <strong>{formatFrequency(signalFrequencyHz)}</strong>
          <small>第 {signalInfo.nyquistZone} Nyquist 区</small>
        </div>
        <b aria-hidden="true">
          <span>ADC</span>
          <strong>fs {formatFrequency(sampleRateHz)}</strong>
          <small>fN {formatFrequency(nyquist)}</small>
        </b>
        <div className="is-result">
          <span>数字序列 f_alias</span>
          <strong>{formatFrequency(signalInfo.aliasFrequency)}</strong>
          <small>{signalInfo.aliased ? (signalInfo.mirrored ? '镜像折回' : '平移折回') : '未发生折回'}</small>
        </div>
      </div>
      <div className="live-alias-equation">
        <code>r = fin mod fs = {formatFrequency(signalInfo.remainder)}</code>
        <code>f_alias = min(r, fs − r) = {formatFrequency(signalInfo.aliasFrequency)}</code>
      </div>
      <div className="live-alias-presets" role="group" aria-label="一键切换混叠分析例题">
        <span>ALIAS PRESETS</span>
        {presets.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onSelectPreset(preset.value)}>
            <small>{formatNumber(preset.ratio, 2)}fs</small>
            <strong>{formatFrequency(preset.value)} → {formatFrequency(preset.alias)}</strong>
          </button>
        ))}
      </div>
    </div>
  )
}

function SimulationScope({
  animationKey,
  inputType,
  simulation,
  yDomain,
  signalAliasing,
  sampleRateHz,
  playing,
  metrics,
}) {
  return (
    <article className="simulator-screen is-workbench is-echarts-scope">
      <div className="screen-topline">
        <div><span className="screen-light" />LIVE SCOPE</div>
        <span>
          fs {formatFrequency(sampleRateHz)} · 窗口 {formatSeconds(simulation.duration)} · {simulation.approximated ? `每步合并 ${formatInteger(simulation.integrationStride)} samples` : '逐采样递推'}
        </span>
      </div>
      <div className="scope-chart-guidance">
        <span>点击图例即可显示或隐藏单条曲线</span>
        <small>{inputType === 'step' ? '阶跃输入使用保持线显示 ADC 电平' : signalAliasing.aliased ? '紫色虚线是与 ADC 样本等价的折回参考' : '橙色采样前曲线已提高亮度和线宽'}</small>
      </div>
      <Suspense fallback={<ChartLoadingFallback label="正在加载专业时域分析控件" />}>
        <SimulatorTimeChart
          simulation={simulation}
          yDomain={yDomain}
          inputType={inputType}
          signalAliasing={signalAliasing}
          playing={playing}
          scanKey={animationKey}
        />
      </Suspense>
      <div className="scope-readouts is-six" aria-live="polite">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
    </article>
  )
}

export default function SimulatorLab({ cutoffHz, sampleRateHz, method }) {
  const [simCutoffHz, setSimCutoffHz] = useState(cutoffHz)
  const [simSampleRateHz, setSimSampleRateHz] = useState(sampleRateHz)
  const [simMethod, setSimMethod] = useState(method)
  const [inputType, setInputType] = useState('sine')
  const [signalFrequencyHz, setSignalFrequencyHz] = useState(1)
  const [signalAmplitude, setSignalAmplitude] = useState(1)
  const [signalOffset, setSignalOffset] = useState(0)
  const [signalPhaseDegrees, setSignalPhaseDegrees] = useState(0)
  const [noiseLevel, setNoiseLevel] = useState(0.2)
  const [noiseSeed, setNoiseSeed] = useState(1)
  const [interferenceFrequencyHz, setInterferenceFrequencyHz] = useState(9)
  const [interferenceLevel, setInterferenceLevel] = useState(0.15)
  const [interferencePhaseDegrees, setInterferencePhaseDegrees] = useState(0)
  const [squareDutyCycle, setSquareDutyCycle] = useState(0.5)
  const [stepTimeRatio, setStepTimeRatio] = useState(0.15)
  const [stepInitialValue, setStepInitialValue] = useState(0)
  const [stepFinalValue, setStepFinalValue] = useState(1)
  const [initialOutput, setInitialOutput] = useState(0)
  const [windowMode, setWindowMode] = useState('auto')
  const [cyclesToShow, setCyclesToShow] = useState(4)
  const [customDurationSeconds, setCustomDurationSeconds] = useState(4)
  const [maxRenderedPoints, setMaxRenderedPoints] = useState(600)
  const [maxIntegrationSteps, setMaxIntegrationSteps] = useState(50_000)
  const [playing, setPlaying] = useState(true)
  const [replayNonce, setReplayNonce] = useState(0)

  const frequencyLimits = simulationFrequencyLimits(simSampleRateHz)
  const activeSignalFrequency = clamp(
    signalFrequencyHz,
    frequencyLimits.minimum,
    frequencyLimits.maximum,
  )
  const activeInterferenceFrequency = clamp(
    interferenceFrequencyHz,
    frequencyLimits.minimum,
    frequencyLimits.maximum,
  )
  const samplingSafe = simCutoffHz <= simSampleRateHz * 0.45
  const signalAliasing = aliasingInfo(activeSignalFrequency, simSampleRateHz)
  const interferenceAliasing = aliasingInfo(activeInterferenceFrequency, simSampleRateHz)

  const signalPresets = normalizeFrequencyPresets([
    { id: 'slow', label: '0.2×fc', value: simCutoffHz * 0.2 },
    { id: 'cutoff', label: '1×fc', value: simCutoffHz },
    { id: 'sample-edge', label: '0.4×fs', value: simSampleRateHz * 0.4 },
    { id: 'first-fold', label: '0.6×fs', value: simSampleRateHz * 0.6 },
    { id: 'above-fs', label: '1.1×fs', value: simSampleRateHz * 1.1 },
  ], frequencyLimits.minimum, frequencyLimits.maximum)
  const interferencePresets = normalizeFrequencyPresets([
    { id: 'interference-cutoff', label: '1×fc', value: simCutoffHz },
    { id: 'interference-ten', label: '10×fc', value: simCutoffHz * 10 },
    { id: 'interference-edge', label: '0.9×fs', value: simSampleRateHz * 0.9 },
    { id: 'interference-passband', label: '1.02×fs', value: simSampleRateHz * 1.02 },
  ], frequencyLimits.minimum, frequencyLimits.maximum)
  const aliasingPresets = [0.6, 0.9, 1.1, 1.6].map((ratio) => ({
    id: `alias-${ratio}`,
    ratio,
    value: simSampleRateHz * ratio,
    alias: aliasingInfo(simSampleRateHz * ratio, simSampleRateHz).aliasFrequency,
  }))
  const cutoffPresets = normalizeFrequencyPresets([
    { id: 'global-fc', label: '全局 fc', value: cutoffHz },
    { id: 'fc-one', label: '1 Hz', value: 1 },
    { id: 'fc-kilo', label: '1 kHz', value: 1_000 },
    { id: 'fc-mega', label: '1 MHz', value: 1_000_000 },
  ], CUTOFF_FREQUENCY_RANGE.minimum, CUTOFF_FREQUENCY_RANGE.maximum)
  const sampleRatePresets = normalizeFrequencyPresets([
    { id: 'global-fs', label: '全局 fs', value: sampleRateHz },
    { id: 'fs-audio', label: '48 kHz', value: 48_000 },
    { id: 'fs-mega', label: '1 MHz', value: 1_000_000 },
    { id: 'fs-fast', label: '100 MHz', value: 100_000_000 },
  ], SAMPLE_RATE_RANGE.minimum, SAMPLE_RATE_RANGE.maximum)

  const simulation = useMemo(
    () => createSimulation({
      cutoffHz: simCutoffHz,
      sampleRateHz: simSampleRateHz,
      method: simMethod,
      inputType,
      signalFrequencyHz,
      signalAmplitude,
      signalOffset,
      signalPhaseDegrees,
      noiseLevel,
      noiseSeed,
      interferenceFrequencyHz,
      interferenceLevel,
      interferencePhaseDegrees,
      squareDutyCycle,
      stepTimeRatio,
      stepInitialValue,
      stepFinalValue,
      initialOutput,
      cyclesToShow,
      durationSeconds: windowMode === 'custom' ? customDurationSeconds : undefined,
      maxRenderedPoints,
      maxIntegrationSteps,
    }),
    [
      simCutoffHz,
      simSampleRateHz,
      simMethod,
      inputType,
      signalFrequencyHz,
      signalAmplitude,
      signalOffset,
      signalPhaseDegrees,
      noiseLevel,
      noiseSeed,
      interferenceFrequencyHz,
      interferenceLevel,
      interferencePhaseDegrees,
      squareDutyCycle,
      stepTimeRatio,
      stepInitialValue,
      stepFinalValue,
      initialOutput,
      cyclesToShow,
      windowMode,
      customDurationSeconds,
      maxRenderedPoints,
      maxIntegrationSteps,
    ],
  )

  const yDomain = useMemo(
    () => seriesDomain(
      simulation.analogInput,
      simulation.aliasReference ?? [],
      simulation.input,
      simulation.output,
    ),
    [simulation],
  )
  const transferResponse = useMemo(
    () => createDiscreteResponseData(simCutoffHz, simSampleRateHz, simMethod),
    [simCutoffHz, simSampleRateHz, simMethod],
  )
  const gain = discreteMagnitudeAt(
    activeSignalFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const gainDb = discreteGainDbAt(
    activeSignalFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const analogGain = magnitudeAt(activeSignalFrequency, simCutoffHz)
  const analogGainDb = gainDbAt(activeSignalFrequency, simCutoffHz)
  const phase = discretePhaseDegreesAt(
    activeSignalFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const responseMeasurementFrequency = inputType === 'step'
    ? simCutoffHz
    : signalAliasing.aliasFrequency
  const responseGain = discreteMagnitudeAt(
    responseMeasurementFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const responseGainDb = discreteGainDbAt(
    responseMeasurementFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const responsePhase = discretePhaseDegreesAt(
    responseMeasurementFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const delay = signalAliasing.aliasFrequency > 0
    ? Math.abs(phase) / 360 / signalAliasing.aliasFrequency
    : 0
  const groupDelay = groupDelaySecondsAt(signalAliasing.aliasFrequency, simCutoffHz)
  const interferenceGain = discreteMagnitudeAt(
    activeInterferenceFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const interferenceAnalogGain = magnitudeAt(activeInterferenceFrequency, simCutoffHz)
  const interferencePhase = discretePhaseDegreesAt(
    activeInterferenceFrequency,
    simCutoffHz,
    simSampleRateHz,
    simMethod,
  )
  const tau = tauFromCutoff(simCutoffHz)
  const time95 = settlingTime(tau, 0.95)
  const time99 = settlingTime(tau, 0.99)
  const rmsRatio = simulation.inputRms > 0 ? simulation.outputRms / simulation.inputRms : 0
  const frequencyRatio = signalAliasing.aliasFrequency / simCutoffHz
  const samplesPerCycle = simSampleRateHz / activeSignalFrequency
  const fundamentalInputAmplitude = inputType === 'square'
    ? (4 * signalAmplitude * Math.sin(Math.PI * squareDutyCycle)) / Math.PI
    : signalAmplitude
  const squareDcLevel = signalOffset + signalAmplitude * (2 * squareDutyCycle - 1)
  const outputAmplitude = fundamentalInputAmplitude * gain
  const interferenceOutputAmplitude = signalAmplitude * interferenceLevel * interferenceGain
  const animationKey = [
    simCutoffHz,
    simSampleRateHz,
    simMethod,
    inputType,
    activeSignalFrequency,
    signalAmplitude,
    signalOffset,
    signalPhaseDegrees,
    noiseLevel,
    noiseSeed,
    activeInterferenceFrequency,
    interferenceLevel,
    interferencePhaseDegrees,
    squareDutyCycle,
    stepTimeRatio,
    stepInitialValue,
    stepFinalValue,
    initialOutput,
    windowMode,
    cyclesToShow,
    customDurationSeconds,
    maxRenderedPoints,
    maxIntegrationSteps,
    replayNonce,
  ].join('-')

  const primaryMetrics = inputType === 'step'
    ? [
        { label: '数字系数 α', value: formatNumber(simulation.alpha, 7), detail: simMethod === 'zoh' ? 'ZOH' : '后向欧拉' },
        { label: '时间常数 τ', value: formatSeconds(tau), detail: '达到 63.2%' },
        { label: '达到 95%', value: formatSeconds(time95), detail: '2.996τ' },
        { label: '达到 99%', value: formatSeconds(time99), detail: '4.605τ' },
        { label: '整体 RMS', value: formatPercent(rmsRatio, 1), detail: '输出 / 输入' },
        { label: '仿真窗口', value: formatSeconds(simulation.duration), detail: `${formatEngineeringRate(simulation.sampleCount, 'samples')}` },
      ]
    : [
        { label: 'ADC 看到的频率', value: formatFrequency(signalAliasing.aliasFrequency), detail: signalAliasing.aliased ? `${formatFrequency(activeSignalFrequency)} 已折回` : '未发生折回' },
        { label: inputType === 'square' ? '数字基波增益' : '数字实际增益', value: formatPercent(gain, 2), detail: `${formatNumber(gainDb, 3)} dB · 按 f_alias` },
        { label: inputType === 'square' ? '输出基波幅值' : '理论输出幅值', value: formatNumber(outputAmplitude, 4), detail: inputType === 'square' ? `基波 × |H| · DC ${formatNumber(squareDcLevel, 3)}` : '输入幅值 × |H|' },
        { label: '模拟原型 @ fin', value: formatPercent(analogGain, 2), detail: `${formatNumber(analogGainDb, 3)} dB · 若滤波在 ADC 前` },
        { label: '原频率采样点', value: formatEngineeringRate(samplesPerCycle, 'samples/cycle'), detail: samplesPerCycle < 2 ? '少于 2 点 / 周期，必然混叠' : 'fs / fin' },
        { label: '整体 RMS', value: formatPercent(rmsRatio, 1), detail: '输出 / 输入' },
      ]

  const filterMetrics = [
    { label: '截止频率 fc', value: formatFrequency(simCutoffHz), detail: `fc / fs = ${formatNumber(simCutoffHz / simSampleRateHz, 6)}` },
    { label: '采样率 / Nyquist', value: formatFrequency(simSampleRateHz), detail: `fN ${formatFrequency(nyquistFrequency(simSampleRateHz))}` },
    { label: '数字系数 α', value: formatNumber(simulation.alpha, 8), detail: simMethod === 'zoh' ? 'ZOH 精确映射' : '后向欧拉' },
    { label: '时间常数 τ', value: formatSeconds(tau), detail: `t95 ${formatSeconds(time95)}` },
    inputType === 'step'
      ? { label: '达到 99%', value: formatSeconds(time99), detail: '从阶跃时刻开始' }
      : { label: '数字增益', value: formatPercent(gain, 3), detail: `${formatNumber(gainDb, 3)} dB · @ f_alias` },
    inputType === 'step'
      ? { label: '递推初值', value: formatNumber(initialOutput, 4), detail: '处理 x[0] 前的 y[−1]' }
      : { label: '数字相位', value: `${formatNumber(phase, 3)}°`, detail: `${formatSeconds(delay)} 等效偏移` },
  ]

  const disturbanceMetrics = [
    { label: '随机噪声比例', value: formatNumber(noiseLevel, 3), detail: `seed ${noiseSeed}` },
    { label: '模拟干扰频率', value: formatFrequency(activeInterferenceFrequency), detail: `${formatNumber(activeInterferenceFrequency / simCutoffHz, 3)}×fc` },
    { label: '干扰折回频率', value: formatFrequency(interferenceAliasing.aliasFrequency), detail: describeAliasing(interferenceAliasing) },
    { label: '数字滤波后保留', value: formatPercent(interferenceGain, 3), detail: `${formatNumber(20 * Math.log10(Math.max(interferenceGain, 1e-12)), 3)} dB` },
    { label: 'ADC 前模拟原型', value: formatPercent(interferenceAnalogGain, 3), detail: '若滤波器安装在 ADC 前' },
    { label: '干扰输出幅值', value: formatNumber(interferenceOutputAmplitude, 5), detail: `数字相位 ${formatNumber(interferencePhase, 2)}°` },
  ]

  const numericalMetrics = [
    { label: '观察窗口', value: formatSeconds(simulation.duration), detail: windowMode === 'auto' ? '自动窗口' : '自定义时长' },
    { label: '真实采样点', value: formatEngineeringRate(simulation.sampleCount, 'samples'), detail: 'duration × fs' },
    { label: '实际递推步数', value: formatEngineeringRate(simulation.simulatedSteps, 'steps'), detail: simulation.approximated ? `每步合并 ${formatInteger(simulation.integrationStride)} samples` : '逐采样计算' },
    { label: '绘图点数', value: formatNumber(simulation.renderedPoints, 0), detail: `目标上限 ${maxRenderedPoints}` },
    { label: '实时算术速率', value: formatEngineeringRate(simSampleRateHz * 3, 'ops/s'), detail: '每 sample：1 乘 + 2 加减' },
    { label: 'RMS 输出 / 输入', value: formatPercent(rmsRatio, 3), detail: `${formatNumber(simulation.outputRms, 4)} / ${formatNumber(simulation.inputRms, 4)}` },
  ]

  const samplingMetrics = inputType === 'step'
    ? primaryMetrics
    : [
        { label: '模拟输入 fin', value: formatFrequency(activeSignalFrequency), detail: `第 ${signalAliasing.nyquistZone} Nyquist 区` },
        { label: '无歧义上限 fN', value: formatFrequency(nyquistFrequency(simSampleRateHz)), detail: 'fs / 2' },
        { label: 'ADC 看到 f_alias', value: formatFrequency(signalAliasing.aliasFrequency), detail: signalAliasing.aliased ? '已折回' : '与 fin 相同' },
        { label: '余数 r', value: formatFrequency(signalAliasing.remainder), detail: 'fin mod fs' },
        { label: '原频率采样密度', value: formatEngineeringRate(samplesPerCycle, 'samples/cycle'), detail: samplesPerCycle < 2 ? '低于 Nyquist 要求' : 'fs / fin' },
        { label: '数字低通增益', value: formatPercent(gain, 3), detail: `按 f_alias · ${formatNumber(gainDb, 3)} dB` },
      ]

  function replay() {
    setReplayNonce((current) => current + 1)
    setPlaying(true)
  }

  function loadGlobalParameters() {
    setSimCutoffHz(cutoffHz)
    setSimSampleRateHz(sampleRateHz)
    setSimMethod(method)
    replay()
  }

  function selectAliasingPreset(value) {
    setInputType('sine')
    setSignalFrequencyHz(value)
    setNoiseLevel(0)
    setInterferenceLevel(0)
    setWindowMode('auto')
    replay()
  }

  return (
    <section className="content-section simulator-section">
      <div className="simulator-workbench is-unified">
        <aside className="simulator-parameter-pane simulator-all-parameters" aria-label="全部仿真参数">
          <header className="simulator-editor-heading">
            <div>
              <span>PARAMETER RACK</span>
              <h3>全部可调参数</h3>
              <p>从上到下按信号链排列；参数变化会立即重算右侧全部视图。</p>
            </div>
            <strong className={samplingSafe ? 'parameter-rack-status is-safe' : 'parameter-rack-status is-warning'}>
              {samplingSafe ? 'MODEL OK' : 'CHECK fs'}
            </strong>
          </header>

          <div className="simulator-parameter-body">
            <ParameterSection
              index="01"
              eyebrow="SOURCE"
              title="模拟信号源"
              description="波形、频率、电平和相位"
            >
                <div className="control-group editor-control-card">
                  <div className="control-group-heading"><span>输入信号类型</span><small>采样前波形</small></div>
                  <div className="stacked-options is-horizontal">
                    {INPUT_TYPES.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        className={inputType === type.id ? 'is-active' : ''}
                        aria-pressed={inputType === type.id}
                        onClick={() => {
                          setInputType(type.id)
                          replay()
                        }}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {inputType !== 'step' ? (
                  <FrequencyControl
                    id="signal-frequency"
                    label="主信号频率 fin"
                    value={activeSignalFrequency}
                    minimum={frequencyLimits.minimum}
                    maximum={frequencyLimits.maximum}
                    onChange={setSignalFrequencyHz}
                    presets={signalPresets}
                    hint={signalAliasing.aliased
                      ? formatFrequency(activeSignalFrequency) + ' 经 ADC 折回为 ' + formatFrequency(signalAliasing.aliasFrequency) + '。'
                      : 'ADC 仍看到 ' + formatFrequency(signalAliasing.aliasFrequency) + '；' + describeFrequencyZone(frequencyRatio) + '。'}
                  />
                ) : (
                  <div className="control-group step-summary-card">
                    <span>自动观察窗口</span>
                    <strong>{formatSeconds(6 * tau)}</strong>
                    <small>默认显示 6τ；可在“观察与计算”中切换为自定义时长。</small>
                  </div>
                )}

                <div className="control-group editor-control-card">
                  <div className="control-group-heading">
                    <span>{inputType === 'step' ? '阶跃电平与时刻' : '幅值、偏置与相位'}</span>
                    <small>模拟信号源</small>
                  </div>
                  {inputType === 'step' ? (
                    <>
                      <RangeField id="step-initial" label="阶跃前电平" value={stepInitialValue} minimum={-10} maximum={10} step={0.1} onChange={setStepInitialValue} minimumLabel="−10" maximumLabel="10" />
                      <RangeField id="step-final" label="阶跃后电平" value={stepFinalValue} minimum={-10} maximum={10} step={0.1} onChange={setStepFinalValue} minimumLabel="−10" maximumLabel="10" accent="accent-orange" />
                      <RangeField id="step-time" label="跳变时刻" value={stepTimeRatio} minimum={0.02} maximum={0.8} step={0.01} onChange={setStepTimeRatio} unit="窗口比例" minimumLabel="2%" maximumLabel="80%" />
                    </>
                  ) : (
                    <>
                      <RangeField id="signal-amplitude" label="信号峰值幅度" value={signalAmplitude} minimum={0} maximum={10} step={0.05} onChange={setSignalAmplitude} minimumLabel="0" maximumLabel="10" accent="accent-orange" />
                      <RangeField id="signal-offset" label="直流偏置" value={signalOffset} minimum={-10} maximum={10} step={0.1} onChange={setSignalOffset} minimumLabel="−10" maximumLabel="10" />
                      <RangeField id="signal-phase" label="初始相位" value={signalPhaseDegrees} minimum={-180} maximum={180} step={1} onChange={setSignalPhaseDegrees} unit="°" minimumLabel="−180°" maximumLabel="180°" />
                      {inputType === 'square' ? (
                        <RangeField id="square-duty-cycle" label="方波占空比" value={squareDutyCycle} minimum={0.05} maximum={0.95} step={0.01} onChange={setSquareDutyCycle} minimumLabel="5%" maximumLabel="95%" />
                      ) : null}
                    </>
                  )}
                </div>
            </ParameterSection>

            <ParameterSection
              index="02"
              eyebrow="FILTER + ADC"
              title="滤波器与采样"
              description="独立 fc、fs、离散方法与 Nyquist 边界"
              action={(
                <button className="simulator-sync-button" type="button" onClick={loadGlobalParameters}>
                  载入全局
                </button>
              )}
            >
                <FrequencyControl
                  id="sim-cutoff"
                  label="仿真截止频率 fc"
                  value={simCutoffHz}
                  minimum={CUTOFF_FREQUENCY_RANGE.minimum}
                  maximum={CUTOFF_FREQUENCY_RANGE.maximum}
                  onChange={setSimCutoffHz}
                  presets={cutoffPresets}
                  hint={'fc / fs = ' + formatNumber(simCutoffHz / simSampleRateHz, 6) + '；τ = ' + formatSeconds(tau) + '。'}
                />
                <FrequencyControl
                  id="sim-sample-rate"
                  label="仿真采样频率 fs"
                  value={simSampleRateHz}
                  minimum={SAMPLE_RATE_RANGE.minimum}
                  maximum={SAMPLE_RATE_RANGE.maximum}
                  onChange={setSimSampleRateHz}
                  presets={sampleRatePresets}
                  accent="accent-lime"
                  hint={'Ts = ' + formatSeconds(samplePeriodSeconds(simSampleRateHz)) + '；fN = ' + formatFrequency(nyquistFrequency(simSampleRateHz)) + '。'}
                />
                <div className="control-group simulator-method-group editor-control-card">
                  <div className="control-group-heading"><span>离散方法</span><small>独立于全局</small></div>
                  <div className="segmented-control" role="group" aria-label="仿真离散方法">
                    <button type="button" className={simMethod === 'zoh' ? 'is-active' : ''} onClick={() => setSimMethod('zoh')}>ZOH 精确</button>
                    <button type="button" className={simMethod === 'backward-euler' ? 'is-active' : ''} onClick={() => setSimMethod('backward-euler')}>后向欧拉</button>
                  </div>
                  <p className="method-formula">{simMethod === 'zoh' ? 'α = 1 − exp(−2πfc/fs)' : 'α = 2πfc/(fs + 2πfc)'}</p>
                  <p className={samplingSafe ? 'simulator-validity is-safe' : 'simulator-validity is-warning'}>
                    {samplingSafe ? '模型比例合理：fc ≤ 0.45fs。' : 'fc 已超过 0.45fs；这里保留输入值，但连续原型的数字近似会明显失真。'}
                  </p>
                </div>
                <div className="editor-theory-card">
                  <span>当前测量点</span>
                  {inputType === 'step' ? (
                    <p><strong>阶跃时域</strong><small>τ {formatSeconds(tau)} · t95 {formatSeconds(time95)} · t99 {formatSeconds(time99)}</small></p>
                  ) : (
                    <>
                      <p><strong>幅频 |H|</strong><small>{formatPercent(gain, 3)} · {formatNumber(gainDb, 3)} dB</small></p>
                      <p><strong>相频 ∠H</strong><small>{formatNumber(phase, 3)}° · 群时延 {formatSeconds(groupDelay)}</small></p>
                    </>
                  )}
                </div>
                <div className={'sampling-editor-summary ' + (inputType !== 'step' && signalAliasing.aliased ? 'is-aliasing' : 'is-safe')}>
                  <span>当前 Nyquist 边界</span>
                  <strong>{formatFrequency(nyquistFrequency(simSampleRateHz))}</strong>
                  <small>fN = fs / 2；只有 0 ～ fN 是无歧义数字频带。</small>
                </div>
                <div className="sampling-formula-card">
                  <span>混叠计算</span>
                  <code>r = fin mod fs</code>
                  <code>f_alias = min(r, fs − r)</code>
                  <p>{inputType === 'step' ? '阶跃没有单一载波频率；右侧按宽频谱说明。' : `${describeAliasing(signalAliasing)}；当前得到 ${formatFrequency(signalAliasing.aliasFrequency)}。`}</p>
                </div>
            </ParameterSection>

            <ParameterSection
              index="03"
              eyebrow="NOISE"
              title="噪声与周期干扰"
              description="随机噪声、窄带干扰及其相位"
            >
                <div className="control-group editor-control-card">
                  <div className="control-group-heading"><span>随机噪声</span><small>设为 0 即关闭</small></div>
                  <RangeField id="noise-level" label="噪声峰值 / 信号幅值" value={noiseLevel} minimum={0} maximum={3} step={0.01} onChange={setNoiseLevel} minimumLabel="0" maximumLabel="3×" />
                  <RangeField id="noise-seed" label="随机噪声种子" value={noiseSeed} minimum={0} maximum={9999} step={1} onChange={setNoiseSeed} minimumLabel="0" maximumLabel="9999" />
                </div>
                <div className="control-group editor-control-card">
                  <div className="control-group-heading"><span>周期干扰</span><small>窄带正弦</small></div>
                  <RangeField id="interference-level" label="干扰幅值 / 信号幅值" value={interferenceLevel} minimum={0} maximum={3} step={0.01} onChange={setInterferenceLevel} minimumLabel="0" maximumLabel="3×" accent="accent-orange" />
                  <FrequencyControl
                    id="interference-frequency"
                    label="周期干扰频率"
                    value={activeInterferenceFrequency}
                    minimum={frequencyLimits.minimum}
                    maximum={frequencyLimits.maximum}
                    onChange={setInterferenceFrequencyHz}
                    presets={interferencePresets}
                    accent="accent-lime"
                    className="nested-frequency-control"
                    hint={interferenceAliasing.aliased
                      ? formatFrequency(activeInterferenceFrequency) + ' 折回 ' + formatFrequency(interferenceAliasing.aliasFrequency) + '；数字滤波后保留 ' + formatPercent(interferenceGain, 2) + '。'
                      : '未折回；数字滤波后保留 ' + formatPercent(interferenceGain, 2) + '。'}
                  />
                  <RangeField id="interference-phase" label="周期干扰相位" value={interferencePhaseDegrees} minimum={-180} maximum={180} step={1} onChange={setInterferencePhaseDegrees} unit="°" minimumLabel="−180°" maximumLabel="180°" />
                </div>
            </ParameterSection>

            <ParameterSection
              index="04"
              eyebrow="RUNTIME"
              title="观察窗口与计算预算"
              description="时长、初值、绘图密度和递推上限"
            >
                <div className="control-group editor-control-card">
                  <div className="control-group-heading"><span>观察窗口</span><small>时间轴范围</small></div>
                  <div className="segmented-control compact-segmented" role="group" aria-label="观察窗口模式">
                    <button type="button" className={windowMode === 'auto' ? 'is-active' : ''} onClick={() => setWindowMode('auto')}>自动窗口</button>
                    <button type="button" className={windowMode === 'custom' ? 'is-active' : ''} onClick={() => setWindowMode('custom')}>自定义时长</button>
                  </div>
                  {windowMode === 'auto' && inputType !== 'step' ? (
                    <RangeField id="cycles-to-show" label="观察周期数" value={cyclesToShow} minimum={0.5} maximum={20} step={0.5} onChange={setCyclesToShow} unit="周期" minimumLabel="0.5" maximumLabel="20" />
                  ) : null}
                  {windowMode === 'custom' ? (
                    <RangeField id="custom-duration" label="观察时长" value={customDurationSeconds} minimum={0.000001} maximum={1_000_000} step={0.000001} onChange={setCustomDurationSeconds} unit="s" minimumLabel="1 μs" maximumLabel="11.6 days" scale="log" />
                  ) : null}
                </div>
                <div className="control-group editor-control-card">
                  <div className="control-group-heading"><span>状态与计算预算</span><small>只影响可视化</small></div>
                  <RangeField id="initial-output" label="递推初始状态 y[−1]" value={initialOutput} minimum={-10} maximum={10} step={0.1} onChange={setInitialOutput} minimumLabel="−10" maximumLabel="10" accent="accent-orange" />
                  <RangeField id="render-points" label="目标绘图点数" value={maxRenderedPoints} minimum={200} maximum={1200} step={20} onChange={setMaxRenderedPoints} minimumLabel="200" maximumLabel="1200" />
                  <RangeField id="integration-steps" label="最大递推步数" value={maxIntegrationSteps} minimum={1000} maximum={100000} step={1000} onChange={setMaxIntegrationSteps} minimumLabel="1k" maximumLabel="100k" scale="log" />
                </div>
                {simulation.approximated ? (
                  <div className="simulation-approximation-note is-editor">
                    为避免 MHz 采样率造成浏览器卡顿，绘图把连续 {formatInteger(simulation.integrationStride)} 个真实采样合并为一步；理论 α、真实采样数与 ops/s 仍按真实 fs 计算。
                  </div>
                ) : (
                  <div className="simulation-exact-note">当前窗口逐采样递推，没有使用可视化分块。</div>
                )}
            </ParameterSection>
          </div>

          <footer className="simulator-editor-footer">
            <div className="simulation-actions">
              <button type="button" className="primary-icon-button" onClick={() => setPlaying((current) => !current)}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
                {playing ? '暂停扫描' : '继续扫描'}
              </button>
              <button type="button" className="secondary-icon-button" onClick={replay} aria-label="重新播放模拟">
                <RotateCcw size={18} />
              </button>
            </div>
            <p><span className="screen-light" />参数变化会立即重新计算，扫描动画可单独暂停。</p>
          </footer>
        </aside>

        <section className="simulator-visual-pane simulator-all-visuals" aria-label="全部仿真图表与结果">
          <header className="simulator-visual-heading">
            <div>
              <span>ANALYSIS WALL</span>
              <h3>集中信号分析台</h3>
              <p>先在 LIVE 图里分析采样与折回，再用一张双轴图对照幅值和相位。</p>
            </div>
            <div className="visual-heading-chips">
              <span>fc <strong>{formatFrequency(simCutoffHz)}</strong></span>
              <span>fs <strong>{formatFrequency(simSampleRateHz)}</strong></span>
              {inputType === 'step' ? null : <span>fin <strong>{formatFrequency(activeSignalFrequency)}</strong></span>}
              {inputType === 'step' ? null : <span>alias <strong>{formatFrequency(signalAliasing.aliasFrequency)}</strong></span>}
              <span>α <strong>{formatNumber(simulation.alpha, 6)}</strong></span>
            </div>
          </header>

          <div className="simulator-all-visual-stack">
            <section className="simulator-time-panel simulator-right-card">
              <header className="simulator-card-heading">
                <div><span>01 / LIVE SIGNAL ANALYSIS</span><h3>原始信号、采样折回与滤波输出同屏分析</h3><p>橙色模拟信号已强化显示；青色为 ADC 样本，紫色为折回等效参考，黄绿色为数字输出。</p></div>
                <strong>{inputType === 'step' ? 'STEP RESPONSE' : signalAliasing.aliased ? 'ALIAS ACTIVE' : 'BAND-LIMITED'}</strong>
              </header>
              <LiveAliasingStrip
                inputType={inputType}
                signalFrequencyHz={activeSignalFrequency}
                signalInfo={signalAliasing}
                sampleRateHz={simSampleRateHz}
                presets={aliasingPresets}
                onSelectPreset={selectAliasingPreset}
              />
              <SimulationScope
                animationKey={animationKey + '-unified'}
                inputType={inputType}
                simulation={simulation}
                yDomain={yDomain}
                signalAliasing={signalAliasing}
                sampleRateHz={simSampleRateHz}
                playing={playing}
                metrics={primaryMetrics}
              />
            </section>

            <TransferResponsePanel
              response={transferResponse}
              cutoffHz={simCutoffHz}
              measurementFrequencyHz={responseMeasurementFrequency}
              inputType={inputType}
              gain={responseGain}
              gainDb={responseGainDb}
              phase={responsePhase}
              method={simMethod}
            />

            <section className="simulator-results-panel simulator-all-results simulator-right-card">
              <header className="simulator-card-heading">
                <div><span>03 / CALCULATED VALUES</span><h3>全部理论量与运行预算</h3><p>按信号、滤波、干扰、采样和运行时五组集中输出。</p></div>
                <strong className={simulation.approximated ? 'is-approximate' : 'is-exact'}>
                  {simulation.approximated ? `分块 ×${formatInteger(simulation.integrationStride)}` : '逐采样精确递推'}
                </strong>
              </header>
              <div className="simulator-result-groups">
                <MetricCluster eyebrow="SOURCE" title="信号结果" metrics={primaryMetrics} />
                <MetricCluster eyebrow="FILTER" title="滤波器" metrics={filterMetrics} />
                <MetricCluster eyebrow="NOISE" title="干扰" metrics={disturbanceMetrics} />
                <MetricCluster eyebrow="SAMPLING" title="采样与混叠" metrics={samplingMetrics} />
                <MetricCluster eyebrow="RUNTIME" title="计算预算" metrics={numericalMetrics} />
              </div>
              {simulation.approximated ? (
                <p className="simulation-approximation-note">绘图使用等效分块递推；理论 α、真实采样点数与 ops/s 仍按设置的 fs 计算。</p>
              ) : null}
            </section>
          </div>
        </section>
      </div>

      <div className="simulator-status-strip" aria-label="仿真器实时摘要">
        <div><span>独立 fc</span><strong>{formatFrequency(simCutoffHz)}</strong></div>
        <div><span>独立 fs</span><strong>{formatFrequency(simSampleRateHz)}</strong></div>
        <div><span>Nyquist fN</span><strong>{formatFrequency(nyquistFrequency(simSampleRateHz))}</strong></div>
        <div><span>离散系数 α</span><strong>{formatNumber(simulation.alpha, 7)}</strong></div>
        <div><span>实时计算量</span><strong>{formatEngineeringRate(simSampleRateHz * 3, 'ops/s')}</strong></div>
        <div><span>可视化执行</span><strong>{simulation.approximated ? '分块 ×' + formatInteger(simulation.integrationStride) : '逐采样'}</strong></div>
      </div>
    </section>
  )
}
