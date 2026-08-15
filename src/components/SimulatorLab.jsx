import { useMemo, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import EngineeringFrequencyInput from './EngineeringFrequencyInput.jsx'
import LineChart from './LineChart.jsx'
import SamplingAliasDiagram from './SamplingAliasDiagram.jsx'
import SectionIntro from './SectionIntro.jsx'
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

const WORKSPACE_TABS = [
  {
    id: 'signal',
    index: '01',
    eyebrow: 'SOURCE',
    label: '模拟信号',
    title: '定义采样前的原始信号',
    description: '选择波形，再设置频率、幅值、偏置和相位。右侧始终显示模拟波形、ADC 样本与数字输出。',
  },
  {
    id: 'filter',
    index: '02',
    eyebrow: 'FILTER',
    label: '滤波器',
    title: '设置独立的数字滤波器',
    description: '本区 fc、fs 与离散方法完全独立于页面顶部，适合对比不同实现的时域、增益与相位。',
  },
  {
    id: 'disturbance',
    index: '03',
    eyebrow: 'NOISE',
    label: '噪声干扰',
    title: '叠加随机噪声与周期干扰',
    description: '分别控制随机噪声和窄带干扰，并观察它们经过采样与数字低通后的剩余量。',
  },
  {
    id: 'sampling',
    index: '04',
    eyebrow: 'SAMPLING',
    label: '采样与混叠',
    title: '看懂 Nyquist 与频率折回',
    description: '从 fin、fs 和 fN 出发，逐步计算 ADC 最终看到的 f_alias，并用时域采样点验证。',
  },
  {
    id: 'numerical',
    index: '05',
    eyebrow: 'RUNTIME',
    label: '观察与计算',
    title: '控制窗口、初值和计算预算',
    description: '调整观察时长、递推初值与绘图预算，同时查看真实采样数、运算速率和可视化分块。',
  },
]

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

function SimulationScope({
  animationKey,
  inputType,
  simulation,
  yDomain,
  signalFrequencyHz,
  signalAliasing,
  sampleRateHz,
  playing,
  metrics,
  compact = false,
}) {
  return (
    <article className={`simulator-screen is-workbench ${compact ? 'is-compact' : ''}`}>
      <div className="screen-topline">
        <div><span className="screen-light" />LIVE SCOPE</div>
        <span>
          fs {formatFrequency(sampleRateHz)} · 窗口 {formatSeconds(simulation.duration)} · {simulation.approximated ? `每步合并 ${formatInteger(simulation.integrationStride)} samples` : '逐采样递推'}
        </span>
      </div>
      {inputType === 'step' ? null : (
        <div className={`scope-sampling-status ${signalAliasing.aliased ? 'is-aliasing' : 'is-safe'}`}>
          <span>{signalAliasing.aliased ? 'ALIAS DETECTED' : 'BAND-LIMITED'}</span>
          <p>
            {signalAliasing.aliased
              ? <>橙线是采样前的 <strong>{formatFrequency(signalFrequencyHz)}</strong> 模拟波；青色采样点组成的序列等价于 <strong>{formatFrequency(signalAliasing.aliasFrequency)}</strong>。</>
              : <>主信号低于 fN；模拟波形与 ADC 样本对应同一频率 <strong>{formatFrequency(signalFrequencyHz)}</strong>。</>}
            {simulation.analogTraceCompressed ? ' 橙色参考线已按绘图预算压缩，仅用于观察形状。' : null}
          </p>
        </div>
      )}
      <LineChart
        key={animationKey}
        series={inputType === 'step' ? [
          { label: 'ADC 输入 x[n]', color: '#f29a4a', data: simulation.input, dash: '7 6', showPoints: true, pointRadius: 2 },
          { label: '数字输出 y[n]', color: '#d7f56d', data: simulation.output },
        ] : [
          { label: '采样前模拟参考', color: '#f29a4a', data: simulation.analogInput, dash: '6 5', width: 1.45, opacity: 0.62 },
          { label: 'ADC 样本 x[n]', color: '#0aa39a', data: simulation.input, width: 1.5, showPoints: true, pointRadius: 2.3 },
          { label: '数字输出 y[n]', color: '#d7f56d', data: simulation.output, width: 2.7 },
        ]}
        xDomain={[0, simulation.duration]}
        yDomain={yDomain}
        xTicks={[0, simulation.duration * 0.25, simulation.duration * 0.5, simulation.duration * 0.75, simulation.duration]}
        yTicks={Array.from({ length: 5 }, (_, index) => yDomain[0] + ((yDomain[1] - yDomain[0]) * index) / 4)}
        formatX={formatSeconds}
        formatY={(value) => formatNumber(value, 3)}
        ariaLabel="采样前模拟信号、ADC 离散样本与一阶低通滤波输出的时域对照"
        showPlayhead
        playing={playing}
      />
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
  const [activeTab, setActiveTab] = useState('signal')
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
    { id: 'global-fc', label: '顶部 fc', value: cutoffHz },
    { id: 'fc-one', label: '1 Hz', value: 1 },
    { id: 'fc-kilo', label: '1 kHz', value: 1_000 },
    { id: 'fc-mega', label: '1 MHz', value: 1_000_000 },
  ], CUTOFF_FREQUENCY_RANGE.minimum, CUTOFF_FREQUENCY_RANGE.maximum)
  const sampleRatePresets = normalizeFrequencyPresets([
    { id: 'global-fs', label: '顶部 fs', value: sampleRateHz },
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
    () => seriesDomain(simulation.analogInput, simulation.input, simulation.output),
    [simulation],
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

  const scopeMetrics = activeTab === 'filter'
    ? filterMetrics
    : activeTab === 'disturbance'
      ? disturbanceMetrics
      : activeTab === 'numerical'
        ? numericalMetrics
        : primaryMetrics
  const activeWorkspaceTab = WORKSPACE_TABS.find((tab) => tab.id === activeTab) ?? WORKSPACE_TABS[0]

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

  function handleTabKeyDown(event, index) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const lastIndex = WORKSPACE_TABS.length - 1
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : ['ArrowDown', 'ArrowRight'].includes(event.key)
          ? (index + 1) % WORKSPACE_TABS.length
          : (index - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length
    const nextTab = WORKSPACE_TABS[nextIndex]
    setActiveTab(nextTab.id)
    requestAnimationFrame(() => document.getElementById(`simulator-tab-${nextTab.id}`)?.focus())
  }

  return (
    <section id="simulator" className="content-section simulator-section">
      <SectionIntro
        eyebrow="03 · 专业仿真工作台"
        title="一次只调一组参数，右侧始终看到结果"
        description="五个功能页把信号源、滤波器、干扰、采样与计算预算分开。参数仍全部开放，但不再同时铺满页面；切换左侧 Tab，右侧的波形、折回过程和计算结果会进入对应视角。"
      />

      <div className="simulator-workbench">
        <nav className="simulator-tab-rail" role="tablist" aria-label="仿真工作台功能" aria-orientation="vertical">
          <div className="simulator-rail-brand" aria-hidden="true">
            <span>LPF</span>
            <small>LAB</small>
          </div>
          <div className="simulator-tab-list">
            {WORKSPACE_TABS.map((tab, index) => (
              <button
                id={'simulator-tab-' + tab.id}
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="simulator-active-panel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? 'is-active' : ''}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span>{tab.index}</span>
                <strong>{tab.label}</strong>
                <small>{tab.eyebrow}</small>
              </button>
            ))}
          </div>
          <div className={'simulator-rail-health ' + (samplingSafe ? 'is-safe' : 'is-warning')}>
            <span>{samplingSafe ? 'MODEL OK' : 'CHECK fs'}</span>
            <strong>fN {formatFrequency(nyquistFrequency(simSampleRateHz))}</strong>
          </div>
        </nav>

        <aside
          id="simulator-active-panel"
          className="simulator-parameter-pane"
          role="tabpanel"
          aria-labelledby={'simulator-tab-' + activeTab}
        >
          <header className="simulator-editor-heading">
            <div>
              <span>{activeWorkspaceTab.index} / {activeWorkspaceTab.eyebrow}</span>
              <h3>{activeWorkspaceTab.title}</h3>
              <p>{activeWorkspaceTab.description}</p>
            </div>
            {activeTab === 'filter' ? (
              <button className="simulator-sync-button" type="button" onClick={loadGlobalParameters}>
                载入顶部参数
              </button>
            ) : null}
          </header>

          <div className="simulator-parameter-body">
            {activeTab === 'signal' ? (
              <>
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
              </>
            ) : null}

            {activeTab === 'filter' ? (
              <>
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
                  <div className="control-group-heading"><span>离散方法</span><small>独立于顶部</small></div>
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
              </>
            ) : null}

            {activeTab === 'disturbance' ? (
              <>
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
              </>
            ) : null}

            {activeTab === 'sampling' ? (
              <>
                <div className={'sampling-editor-summary ' + (inputType !== 'step' && signalAliasing.aliased ? 'is-aliasing' : 'is-safe')}>
                  <span>当前 Nyquist 边界</span>
                  <strong>{formatFrequency(nyquistFrequency(simSampleRateHz))}</strong>
                  <small>fN = fs / 2；只有 0 ～ fN 是无歧义数字频带。</small>
                </div>
                <FrequencyControl
                  id="sampling-rate"
                  label="ADC 采样频率 fs"
                  value={simSampleRateHz}
                  minimum={SAMPLE_RATE_RANGE.minimum}
                  maximum={SAMPLE_RATE_RANGE.maximum}
                  onChange={setSimSampleRateHz}
                  presets={sampleRatePresets}
                  accent="accent-lime"
                  hint={'采样周期 Ts = ' + formatSeconds(samplePeriodSeconds(simSampleRateHz)) + '。'}
                />
                {inputType === 'step' ? (
                  <div className="control-group sampling-step-switch">
                    <span>阶跃没有单一载波频率</span>
                    <p>可继续学习宽带采样，也可以切换为正弦波，直接观察一个频率如何折回。</p>
                    <button type="button" onClick={() => setInputType('sine')}>切换为正弦波例题</button>
                  </div>
                ) : (
                  <FrequencyControl
                    id="sampling-signal-frequency"
                    label="模拟输入频率 fin"
                    value={activeSignalFrequency}
                    minimum={frequencyLimits.minimum}
                    maximum={frequencyLimits.maximum}
                    onChange={setSignalFrequencyHz}
                    presets={signalPresets}
                    accent="accent-orange"
                    hint={describeAliasing(signalAliasing) + '；ADC 最终看到 ' + formatFrequency(signalAliasing.aliasFrequency) + '。'}
                  />
                )}
                <div className="sampling-formula-card">
                  <span>通用算法</span>
                  <code>r = fin mod fs</code>
                  <code>f_alias = min(r, fs − r)</code>
                  <p>先取余，再判断是否需要从 fs 向左镜像。</p>
                </div>
              </>
            ) : null}

            {activeTab === 'numerical' ? (
              <>
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
              </>
            ) : null}
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

        <section className={'simulator-visual-pane ' + (activeTab === 'sampling' ? 'is-sampling' : '')}>
          <header className="simulator-visual-heading">
            <div>
              <span>{activeTab === 'sampling' ? 'SAMPLING EXPLAINER' : 'TIME-DOMAIN SCOPE'}</span>
              <h3>{activeTab === 'sampling' ? '从模拟频率到 ADC 看到的频率' : '采样前、采样点与数字输出'}</h3>
              <p>{activeTab === 'sampling'
                ? '先按公式走完折回过程，再在下方波形中核对青色 ADC 采样点。'
                : '橙色虚线是采样前参考，青色点是 ADC 数据，黄绿色实线是一阶低通输出。'}</p>
            </div>
            <div className="visual-heading-chips">
              <span>fc <strong>{formatFrequency(simCutoffHz)}</strong></span>
              <span>fs <strong>{formatFrequency(simSampleRateHz)}</strong></span>
              <span>α <strong>{formatNumber(simulation.alpha, 6)}</strong></span>
            </div>
          </header>

          {activeTab === 'sampling' ? (
            <div className="sampling-visual-stack">
              <SamplingAliasDiagram
                inputType={inputType}
                signalFrequencyHz={activeSignalFrequency}
                signalInfo={signalAliasing}
                sampleRateHz={simSampleRateHz}
                presets={aliasingPresets}
                onSelectPreset={selectAliasingPreset}
              />
              <section className="sampling-wave-proof">
                <header>
                  <div><span>TIME-DOMAIN PROOF</span><h3>看青色采样点，而不是只看橙色模拟曲线</h3></div>
                  <p>{inputType === 'step'
                    ? '阶跃用于观察宽带瞬态。'
                    : '当 fin > fN 时，青色点按时间连接后会以 f_alias 的节奏重复。'}</p>
                </header>
                <SimulationScope
                  animationKey={animationKey + '-sampling'}
                  inputType={inputType}
                  simulation={simulation}
                  yDomain={yDomain}
                  signalFrequencyHz={activeSignalFrequency}
                  signalAliasing={signalAliasing}
                  sampleRateHz={simSampleRateHz}
                  playing={playing}
                  metrics={samplingMetrics}
                  compact
                />
              </section>
            </div>
          ) : (
            <SimulationScope
              animationKey={animationKey + '-' + activeTab}
              inputType={inputType}
              simulation={simulation}
              yDomain={yDomain}
              signalFrequencyHz={activeSignalFrequency}
              signalAliasing={signalAliasing}
              sampleRateHz={simSampleRateHz}
              playing={playing}
              metrics={scopeMetrics}
            />
          )}
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
