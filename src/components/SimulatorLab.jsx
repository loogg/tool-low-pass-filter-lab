import { useMemo, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import EngineeringFrequencyInput from './EngineeringFrequencyInput.jsx'
import LineChart from './LineChart.jsx'
import SectionIntro from './SectionIntro.jsx'
import {
  aliasingInfo,
  clamp,
  createAliasingFoldResponse,
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

function formatFoldAxis(value, sampleRateHz) {
  const nyquist = sampleRateHz / 2
  const ratio = value / nyquist
  if (ratio < 0.01) return '0'
  if (Math.abs(ratio - 1) < 0.01) return 'fN'
  if (Math.abs(ratio - 2) < 0.01) return 'fs'
  if (Math.abs(ratio - 3) < 0.01) return '3fN'
  if (Math.abs(ratio - 4) < 0.01) return '2fs'
  return formatFrequency(value)
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

function ResultMetric({ label, value, detail }) {
  return (
    <div className="simulator-result-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function ResultGroup({ eyebrow, title, children }) {
  return (
    <article className="simulator-result-group">
      <header><span>{eyebrow}</span><h3>{title}</h3></header>
      <div>{children}</div>
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

  const foldResponse = useMemo(
    () => createAliasingFoldResponse(simSampleRateHz),
    [simSampleRateHz],
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
        { label: inputType === 'square' ? '输出基波幅值' : '理论输出幅值', value: formatNumber(outputAmplitude, 4), detail: inputType === 'square' ? '方波基波峰值 × |H|' : '输入幅值 × |H|' },
        { label: '模拟原型 @ fin', value: formatPercent(analogGain, 2), detail: `${formatNumber(analogGainDb, 3)} dB · 若滤波在 ADC 前` },
        { label: '原频率采样点', value: formatEngineeringRate(samplesPerCycle, 'samples/cycle'), detail: samplesPerCycle < 2 ? '少于 2 点 / 周期，必然混叠' : 'fs / fin' },
        { label: '整体 RMS', value: formatPercent(rmsRatio, 1), detail: '输出 / 输入' },
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

  return (
    <section id="simulator" className="content-section simulator-section">
      <SectionIntro
        eyebrow="03 · 独立仿真"
        title="把滤波器、采样器与模拟信号源全部展开"
        description="本区拥有独立的 fc、fs 与离散方法。信号源可跨越 4 个 Nyquist 区；示波器会同时画出采样前模拟波形、ADC 样本与数字滤波输出，让折回不只停留在公式里。"
      />

      <section className="simulator-filter-panel" aria-label="仿真器独立滤波参数">
        <header>
          <div><span>FILTER MODEL</span><h3>仿真器独立参数</h3><p>当前设置只作用于本区示波器与计算结果。</p></div>
          <button type="button" onClick={loadGlobalParameters}>载入顶部 fc / fs / 方法</button>
        </header>
        <div className="simulator-filter-grid">
          <FrequencyControl
            id="sim-cutoff"
            label="仿真截止频率 fc"
            value={simCutoffHz}
            minimum={CUTOFF_FREQUENCY_RANGE.minimum}
            maximum={CUTOFF_FREQUENCY_RANGE.maximum}
            onChange={setSimCutoffHz}
            presets={cutoffPresets}
            hint={`当前 fc / fs = ${formatNumber(simCutoffHz / simSampleRateHz, 6)}。`}
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
            hint={`Ts = ${formatSeconds(samplePeriodSeconds(simSampleRateHz))}，fN = fs/2 = ${formatFrequency(nyquistFrequency(simSampleRateHz))}。`}
          />
          <div className="control-group simulator-method-group">
            <div className="control-group-heading"><span>离散方法</span><small>独立于顶部</small></div>
            <div className="segmented-control" role="group" aria-label="仿真离散方法">
              <button type="button" className={simMethod === 'zoh' ? 'is-active' : ''} onClick={() => setSimMethod('zoh')}>ZOH 精确</button>
              <button type="button" className={simMethod === 'backward-euler' ? 'is-active' : ''} onClick={() => setSimMethod('backward-euler')}>后向欧拉</button>
            </div>
            <p className="method-formula">{simMethod === 'zoh' ? 'α = 1 − exp(−2πfc/fs)' : 'α = 2πfc/(fs + 2πfc)'}</p>
            <p className={samplingSafe ? 'simulator-validity is-safe' : 'simulator-validity is-warning'}>
              {samplingSafe ? '采样配置合理：fc ≤ 0.45fs。' : '采样风险：fc 已超过 0.45fs，数字结果不再可靠代表目标连续系统。'}
            </p>
          </div>
        </div>
      </section>

      <section className={`aliasing-lab-panel ${inputType !== 'step' && signalAliasing.aliased ? 'is-aliasing' : 'is-safe'}`} aria-label="Nyquist 与混叠折返计算">
        <header>
          <div>
            <span>SAMPLING / ALIASING</span>
            <h3>频率不是越过 fN 就消失，而是折回 0 ～ fN</h3>
            <p>横轴是采样前的模拟频率 fin，纵轴是 ADC 样本表现出的频率 f_alias；相邻 Nyquist 区交替镜像。</p>
          </div>
          <strong>{inputType === 'step' ? '阶跃无单一载波' : describeAliasing(signalAliasing)}</strong>
        </header>

        <div className="aliasing-lab-layout">
          <article className="aliasing-fold-chart">
            <LineChart
              series={[
                { label: '折返轨迹', color: '#d7f56d', data: foldResponse, width: 2.4 },
                ...(inputType === 'step' ? [] : [{
                  label: '主信号 fin',
                  color: '#f29a4a',
                  data: [{ x: activeSignalFrequency, y: signalAliasing.aliasFrequency }],
                  showLine: false,
                  showPoints: true,
                  pointRadius: 5,
                }]),
                ...(interferenceLevel <= 0 ? [] : [{
                  label: '周期干扰',
                  color: '#0aa39a',
                  data: [{ x: activeInterferenceFrequency, y: interferenceAliasing.aliasFrequency }],
                  showLine: false,
                  showPoints: true,
                  pointRadius: 4,
                }]),
              ]}
              xDomain={[0, simSampleRateHz * 2]}
              yDomain={[0, nyquistFrequency(simSampleRateHz) * 1.08]}
              xTicks={[
                0,
                nyquistFrequency(simSampleRateHz),
                simSampleRateHz,
                nyquistFrequency(simSampleRateHz) * 3,
                simSampleRateHz * 2,
              ]}
              yTicks={[0, nyquistFrequency(simSampleRateHz) / 2, nyquistFrequency(simSampleRateHz)]}
              formatX={(value) => formatFoldAxis(value, simSampleRateHz)}
              formatY={formatFrequency}
              referenceLines={[
                { axis: 'x', value: nyquistFrequency(simSampleRateHz), label: '第 1 次折线 · fN', color: '#f29a4a' },
                { axis: 'x', value: simSampleRateHz, label: 'fs', color: '#0aa39a' },
              ]}
              ariaLabel="模拟输入频率经过采样后反复折回第一 Nyquist 区的曲线"
            />
            <div className="nyquist-zone-strip" aria-hidden="true">
              <span>第 1 区 · 正向</span><span>第 2 区 · 镜像</span><span>第 3 区 · 正向</span><span>第 4 区 · 镜像</span>
            </div>
          </article>

          <aside className="aliasing-calculation-card">
            <div className="aliasing-formula-block">
              <span>程序计算</span>
              <code>r = f<sub>in</sub> mod f<sub>s</sub></code>
              <code>f<sub>alias</sub> = min(r, f<sub>s</sub> − r)</code>
            </div>
            {inputType === 'step' ? (
              <p className="aliasing-step-note">阶跃不是单一正弦频率；它包含从低频到高频的宽频谱。采样前仍需限制高频能量，但这里不为它指定唯一的 f_alias。</p>
            ) : (
              <dl className="aliasing-live-calculation">
                <div><dt>模拟输入 fin</dt><dd>{formatFrequency(activeSignalFrequency)}</dd></div>
                <div><dt>奈奎斯特 fN</dt><dd>{formatFrequency(signalAliasing.nyquistFrequency)}</dd></div>
                <div><dt>余数 r</dt><dd>{formatFrequency(signalAliasing.remainder)}</dd></div>
                <div className="is-result"><dt>ADC 看到 f_alias</dt><dd>{formatFrequency(signalAliasing.aliasFrequency)}</dd></div>
                <div><dt>心算</dt><dd>|fin − {signalAliasing.nearestSampleMultiple}fs|</dd></div>
              </dl>
            )}
            <div className="aliasing-presets" role="group" aria-label="混叠折回示例">
              {aliasingPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setInputType('sine')
                    setSignalFrequencyHz(preset.value)
                    setNoiseLevel(0)
                    setInterferenceLevel(0)
                    setWindowMode('auto')
                    replay()
                  }}
                >
                  <span>{formatNumber(preset.ratio, 2)}fs</span>
                  <strong>→ {formatFrequency(preset.alias)}</strong>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <p className="aliasing-core-warning"><strong>关键区别：</strong>ADC 后的数字低通只会收到 {inputType === 'step' ? '已经采样的宽带序列' : <><b>{formatFrequency(signalAliasing.aliasFrequency)}</b> 这条离散序列</>}，它不知道原来是 {inputType === 'step' ? '哪些模拟频率叠加而来' : <b>{formatFrequency(activeSignalFrequency)}</b>}；要阻止混叠，必须在 ADC 前使用模拟抗混叠滤波器。</p>
      </section>

      <div className="simulator-layout">
        <aside className="simulator-controls">
          <div className="control-group">
            <div className="control-group-heading"><span>输入信号类型</span><small>基础波形</small></div>
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
              label="主信号频率"
              value={activeSignalFrequency}
              minimum={frequencyLimits.minimum}
              maximum={frequencyLimits.maximum}
              onChange={setSignalFrequencyHz}
              presets={signalPresets}
              hint={signalAliasing.aliased
                ? `${formatFrequency(activeSignalFrequency)} 折回为 ${formatFrequency(signalAliasing.aliasFrequency)}；${describeAliasing(signalAliasing)}。`
                : `ADC 看到 ${formatFrequency(signalAliasing.aliasFrequency)}；f_alias / fc = ${formatNumber(frequencyRatio, 4)}：${describeFrequencyZone(frequencyRatio)}。`}
            />
          ) : (
            <div className="control-group step-summary-card">
              <span>阶跃自动窗口</span>
              <strong>{formatSeconds(6 * tau)}</strong>
              <small>默认显示 6τ；可在“观察与数值仿真”中改为自定义时长。</small>
            </div>
          )}

          <div className="simulation-actions">
            <button type="button" className="primary-icon-button" onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
              {playing ? '暂停扫描' : '继续扫描'}
            </button>
            <button type="button" className="secondary-icon-button" onClick={replay} aria-label="重新播放模拟">
              <RotateCcw size={18} />
            </button>
          </div>
        </aside>

        <article className="simulator-screen">
          <div className="screen-topline">
            <div><span className="screen-light" />LIVE SCOPE</div>
            <span>
              fs {formatFrequency(simSampleRateHz)} · 窗口 {formatSeconds(simulation.duration)} · {simulation.approximated ? `每步合并 ${formatInteger(simulation.integrationStride)} samples` : '逐采样递推'}
            </span>
          </div>
          {inputType === 'step' ? null : (
            <div className={`scope-sampling-status ${signalAliasing.aliased ? 'is-aliasing' : 'is-safe'}`}>
              <span>{signalAliasing.aliased ? 'ALIAS DETECTED' : 'BAND-LIMITED'}</span>
              <p>
                {signalAliasing.aliased
                  ? <>模拟输入 <strong>{formatFrequency(activeSignalFrequency)}</strong> 越过 fN，橙线仍显示原波形；青色采样点连接后表现为 <strong>{formatFrequency(signalAliasing.aliasFrequency)}</strong>。</>
                  : <>主信号低于 fN；模拟波形与 ADC 样本对应同一频率 <strong>{formatFrequency(activeSignalFrequency)}</strong>。</>}
                {simulation.analogTraceCompressed ? ' 橙色模拟参考线受绘图点预算压缩，不用于精确读频。' : null}
              </p>
            </div>
          )}
          <LineChart
            key={animationKey}
            series={inputType === 'step' ? [
              { label: 'ADC 输入 x[n]', color: '#f29a4a', data: simulation.input, dash: '7 6', showPoints: true, pointRadius: 2 },
              { label: '数字输出 y[n]', color: '#d7f56d', data: simulation.output },
            ] : [
              { label: '采样前模拟参考（不含随机噪声）', color: '#f29a4a', data: simulation.analogInput, dash: '6 5', width: 1.45, opacity: 0.62 },
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
            {primaryMetrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            ))}
          </div>
        </article>

        <div className="simulator-tuning-grid">
          <div className="control-group signal-detail-group">
            <div className="control-group-heading"><span>信号源参数</span><small>幅值 · 偏置 · 相位 · 波形</small></div>
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

          <div className="control-group disturbance-group">
            <div className="control-group-heading"><span>噪声与周期干扰</span><small>设为 0 即关闭</small></div>
            <RangeField id="noise-level" label="随机噪声峰值 / 信号幅值" value={noiseLevel} minimum={0} maximum={3} step={0.01} onChange={setNoiseLevel} minimumLabel="0" maximumLabel="3×" />
            <RangeField id="noise-seed" label="随机噪声种子" value={noiseSeed} minimum={0} maximum={9999} step={1} onChange={setNoiseSeed} minimumLabel="0" maximumLabel="9999" />
            <RangeField id="interference-level" label="周期干扰幅值 / 信号幅值" value={interferenceLevel} minimum={0} maximum={3} step={0.01} onChange={setInterferenceLevel} minimumLabel="0" maximumLabel="3×" accent="accent-orange" />
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
                ? `模拟干扰 ${formatFrequency(activeInterferenceFrequency)} 折回 ${formatFrequency(interferenceAliasing.aliasFrequency)}；数字滤波后保留 ${formatPercent(interferenceGain, 2)}。`
                : `未折回；数字滤波后保留 ${formatPercent(interferenceGain, 2)}，相位 ${formatNumber(interferencePhase, 2)}°。`}
            />
            <RangeField id="interference-phase" label="周期干扰相位" value={interferencePhaseDegrees} minimum={-180} maximum={180} step={1} onChange={setInterferencePhaseDegrees} unit="°" minimumLabel="−180°" maximumLabel="180°" />
          </div>

          <div className="control-group numerical-group">
            <div className="control-group-heading"><span>观察与数值仿真</span><small>窗口 · 初值 · 计算预算</small></div>
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
            <RangeField id="initial-output" label="递推初始状态 y[−1]" value={initialOutput} minimum={-10} maximum={10} step={0.1} onChange={setInitialOutput} minimumLabel="−10" maximumLabel="10" accent="accent-orange" />
            <RangeField id="render-points" label="目标绘图点数" value={maxRenderedPoints} minimum={200} maximum={1200} step={20} onChange={setMaxRenderedPoints} minimumLabel="200" maximumLabel="1200" />
            <RangeField id="integration-steps" label="最大递推步数" value={maxIntegrationSteps} minimum={1000} maximum={100000} step={1000} onChange={setMaxIntegrationSteps} minimumLabel="1k" maximumLabel="100k" scale="log" />
          </div>
        </div>

        <section className="simulator-results-panel" aria-label="仿真计算结果">
          <header>
            <div><span>ANALYSIS</span><h3>理论响应、离散参数与计算负载</h3></div>
            <strong className={simulation.approximated ? 'is-approximate' : 'is-exact'}>
              {simulation.approximated ? `可视化分块 ×${formatInteger(simulation.integrationStride)}` : '逐采样递推'}
            </strong>
          </header>
          <div className="simulator-result-groups">
            <ResultGroup eyebrow="FILTER" title="滤波器与采样">
              <ResultMetric label="fc" value={formatFrequency(simCutoffHz)} detail={`fc/fs = ${formatNumber(simCutoffHz / simSampleRateHz, 6)}`} />
              <ResultMetric label="fs / Ts" value={formatFrequency(simSampleRateHz)} detail={formatSeconds(samplePeriodSeconds(simSampleRateHz))} />
              <ResultMetric label="α" value={formatNumber(simulation.alpha, 9)} detail={simMethod === 'zoh' ? 'ZOH 精确映射' : '后向欧拉'} />
              <ResultMetric label="τ" value={formatSeconds(tau)} detail={`t95 ${formatSeconds(time95)} · t99 ${formatSeconds(time99)}`} />
              <ResultMetric label="Nyquist" value={formatFrequency(nyquistFrequency(simSampleRateHz))} detail={samplingSafe ? 'fc 位于安全区间' : 'fc 超过建议上限'} />
            </ResultGroup>

            <ResultGroup eyebrow="ALIASING" title="Nyquist 与折回">
              {inputType === 'step' ? (
                <>
                  <ResultMetric label="无歧义频带" value={`0 ～ ${formatFrequency(nyquistFrequency(simSampleRateHz))}`} detail="阶跃为宽带信号，没有单一 alias" />
                  <ResultMetric label="采样前要求" value="模拟限带" detail="ADC 前抑制高于 fN 的能量" />
                  <ResultMetric label="采样后" value="无法反推" detail="不同模拟频率可能得到相同样本" />
                </>
              ) : (
                <>
                  <ResultMetric label="模拟 fin" value={formatFrequency(activeSignalFrequency)} detail={describeAliasing(signalAliasing)} />
                  <ResultMetric label="ADC 看到" value={formatFrequency(signalAliasing.aliasFrequency)} detail={`r = ${formatFrequency(signalAliasing.remainder)}`} />
                  <ResultMetric label="最近 fs 整数倍" value={`${signalAliasing.nearestSampleMultiple}fs`} detail={`|fin − ${signalAliasing.nearestSampleMultiple}fs|`} />
                  <ResultMetric label="方向" value={signalAliasing.mirrored ? '镜像' : '正向'} detail={`第 ${signalAliasing.nyquistZone} Nyquist 区`} />
                  <ResultMetric label="原频率采样密度" value={formatNumber(samplesPerCycle, 4)} detail={samplesPerCycle < 2 ? '< 2 samples/cycle' : 'samples/cycle'} />
                </>
              )}
            </ResultGroup>

            <ResultGroup eyebrow="SIGNAL" title={inputType === 'step' ? '阶跃时域结果' : '主信号稳态结果'}>
              {inputType === 'step' ? (
                <>
                  <ResultMetric label="阶跃幅度" value={formatNumber(stepFinalValue - stepInitialValue, 4)} detail={`${formatNumber(stepInitialValue, 3)} → ${formatNumber(stepFinalValue, 3)}`} />
                  <ResultMetric label="63.2% / 95%" value={`${formatSeconds(tau)} / ${formatSeconds(time95)}`} detail="从跳变时刻开始计" />
                  <ResultMetric label="99%" value={formatSeconds(time99)} detail="4.605τ" />
                  <ResultMetric label="递推初始状态" value={formatNumber(initialOutput, 4)} detail="处理 x[0] 前的 y[−1]" />
                </>
              ) : (
                <>
                  <ResultMetric label="f_alias / fc" value={formatNumber(frequencyRatio, 5)} detail={describeFrequencyZone(frequencyRatio)} />
                  <ResultMetric label="ADC 后数字增益" value={formatPercent(gain, 3)} detail={`${formatNumber(gainDb, 4)} dB · 按 f_alias`} />
                  <ResultMetric label="ADC 前模拟原型" value={formatPercent(analogGain, 3)} detail={`${formatNumber(analogGainDb, 4)} dB · 按 fin`} />
                  {inputType === 'square' ? <ResultMetric label="输入基波幅值" value={formatNumber(fundamentalInputAmplitude, 5)} detail="4A·sin(πD) / π" /> : null}
                  <ResultMetric label={inputType === 'square' ? '输出基波幅值' : '输出幅值'} value={formatNumber(outputAmplitude, 5)} detail={inputType === 'square' ? '基波峰值 × |H|' : 'Ain × |H|'} />
                  {inputType === 'square' ? <ResultMetric label="方波 DC 分量" value={formatNumber(squareDcLevel, 5)} detail="offset + A(2D − 1)，直流稳态不衰减" /> : null}
                  <ResultMetric label="数字相位" value={`${formatNumber(phase, 3)}°`} detail={`相对 f_alias · ${formatSeconds(delay)} 等效偏移`} />
                  <ResultMetric label="模拟原型群时延" value={formatSeconds(groupDelay)} detail="按 f_alias 观察" />
                  {inputType === 'square' ? <ResultMetric label="谐波混叠" value="逐次折回" detail="方波每个奇次谐波需分别计算 alias" /> : null}
                </>
              )}
            </ResultGroup>

            <ResultGroup eyebrow="DISTURBANCE" title="噪声与干扰">
              <ResultMetric label="随机噪声比例" value={formatNumber(noiseLevel, 4)} detail={`seed ${noiseSeed}`} />
              <ResultMetric label="模拟干扰频率" value={formatFrequency(activeInterferenceFrequency)} detail={`${formatNumber(activeInterferenceFrequency / simCutoffHz, 4)}×fc`} />
              <ResultMetric label="干扰折回" value={formatFrequency(interferenceAliasing.aliasFrequency)} detail={describeAliasing(interferenceAliasing)} />
              <ResultMetric label="ADC 后数字增益" value={formatPercent(interferenceGain, 3)} detail={`${formatNumber(20 * Math.log10(Math.max(interferenceGain, 1e-12)), 4)} dB`} />
              <ResultMetric label="ADC 前模拟原型" value={formatPercent(interferenceAnalogGain, 3)} detail="若滤波器位于采样前" />
              <ResultMetric label="干扰输出幅值" value={formatNumber(interferenceOutputAmplitude, 5)} detail="Ain × 干扰比例 × 数字 |H|" />
              <ResultMetric label="数字相位" value={`${formatNumber(interferencePhase, 3)}°`} detail={`源相位 ${formatNumber(interferencePhaseDegrees, 1)}°`} />
            </ResultGroup>

            <ResultGroup eyebrow="COMPUTE" title="窗口与计算负载">
              <ResultMetric label="真实采样点" value={formatEngineeringRate(simulation.sampleCount, 'samples')} detail={`窗口 ${formatSeconds(simulation.duration)}`} />
              <ResultMetric label="实际递推步数" value={formatEngineeringRate(simulation.simulatedSteps, 'steps')} detail={simulation.approximated ? `每步合并 ${formatInteger(simulation.integrationStride)} samples` : '无分块'} />
              <ResultMetric label="绘图点数" value={formatNumber(simulation.renderedPoints, 0)} detail={`目标 ${maxRenderedPoints}`} />
              <ResultMetric label="实时算术速率" value={formatEngineeringRate(simSampleRateHz * 3, 'ops/s')} detail="1 乘 + 2 加减 / sample" />
              <ResultMetric label="RMS 输出 / 输入" value={formatPercent(rmsRatio, 3)} detail={`${formatNumber(simulation.outputRms, 5)} / ${formatNumber(simulation.inputRms, 5)}`} />
            </ResultGroup>
          </div>
          {simulation.approximated ? (
            <p className="simulation-approximation-note">可视化采用分块递推：每个绘图积分步把连续 {formatInteger(simulation.integrationStride)} 个真实采样合并为等效 α。顶部 α、幅相理论值、真实采样数和每秒运算量仍按设置的真实 fs 计算。</p>
          ) : null}
        </section>
      </div>
    </section>
  )
}
