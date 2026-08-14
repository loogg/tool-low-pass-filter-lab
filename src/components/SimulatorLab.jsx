import { useMemo, useState } from 'react'
import { AudioWaveform, Pause, Play, RotateCcw, Square, StepForward } from 'lucide-react'
import {
  clamp,
  createSimulation,
  magnitudeAt,
  phaseDegreesAt,
  phaseDelaySeconds,
  settlingTime,
  simulationFrequencyLimits,
  tauFromCutoff,
} from '../lib/filterMath.js'
import { formatFrequency, formatNumber, formatPercent, formatSeconds } from '../lib/format.js'
import LineChart from './LineChart.jsx'
import SectionIntro from './SectionIntro.jsx'

const INPUT_TYPES = [
  { id: 'noise', label: '正弦 + 噪声', icon: AudioWaveform },
  { id: 'step', label: '阶跃', icon: StepForward },
  { id: 'square', label: '方波', icon: Square },
]

function seriesDomain(input, output) {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const data of [input, output]) {
    for (const point of data) {
      minimum = Math.min(minimum, point.y)
      maximum = Math.max(maximum, point.y)
    }
  }
  const span = Math.max(0.2, maximum - minimum)
  return [minimum - span * 0.12, maximum + span * 0.12]
}

function describeFrequencyZone(ratio) {
  if (ratio < 0.3) return '远低于 fc，主信号几乎完整保留'
  if (ratio < 0.8) return '正在接近 fc，衰减开始变得可见'
  if (ratio < 1.5) return '就在截止点附近，幅值和相位变化最直观'
  if (ratio < 5) return '已经越过 fc，输出会明显变小并滞后'
  return '远高于 fc，主要观察强衰减效果'
}

function normalizeFrequencyPresets(candidates, minimum, maximum) {
  const seen = new Set()
  return candidates.flatMap((candidate) => {
    const value = clamp(candidate.value, minimum, maximum)
    const key = value.toPrecision(8)
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
  presets,
  accent = 'accent-orange',
}) {
  const safeValue = clamp(value, minimum, maximum)

  function commit(nextValue) {
    if (!Number.isFinite(nextValue)) return
    onChange(clamp(nextValue, minimum, maximum))
  }

  return (
    <div className="control-group frequency-control-group">
      <div className="control-label-row">
        <label htmlFor={`${id}-range`}>{label}</label>
        <label className="compact-number-input">
          <input
            type="number"
            value={Number(safeValue.toPrecision(5))}
            min={minimum}
            max={maximum}
            step={0.1}
            aria-label={`${label}数值`}
            onChange={(event) => commit(Number(event.target.value))}
          />
          <span>Hz</span>
        </label>
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
      <div className="range-scale"><span>{formatFrequency(minimum)}</span><span>上限 {formatFrequency(maximum)}</span></div>
      <div className="frequency-presets" role="group" aria-label={`${label}快捷值`}>
        {presets.map((preset) => (
          <button key={preset.id} type="button" onClick={() => commit(preset.value)}>
            <span>{preset.label}</span>
            <small>{formatFrequency(preset.value)}</small>
          </button>
        ))}
      </div>
      <p>{hint}</p>
    </div>
  )
}

function RangeField({
  id,
  label,
  value,
  valueLabel,
  minimum,
  maximum,
  step,
  onChange,
  minimumLabel,
  maximumLabel,
  accent = 'accent-lime',
}) {
  return (
    <div className="range-field">
      <div className="control-label-row">
        <label htmlFor={id}>{label}</label>
        <strong>{valueLabel}</strong>
      </div>
      <input
        id={id}
        className={`range-control ${accent}`}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="range-scale"><span>{minimumLabel}</span><span>{maximumLabel}</span></div>
    </div>
  )
}

export default function SimulatorLab({ cutoffHz, sampleRateHz, method }) {
  const [inputType, setInputType] = useState('noise')
  const [signalFrequencyHz, setSignalFrequencyHz] = useState(1)
  const [signalAmplitude, setSignalAmplitude] = useState(1)
  const [noiseLevel, setNoiseLevel] = useState(0.35)
  const [interferenceFrequencyHz, setInterferenceFrequencyHz] = useState(9)
  const [squareDutyCycle, setSquareDutyCycle] = useState(0.5)
  const [stepTimeRatio, setStepTimeRatio] = useState(0.12)
  const [cyclesToShow, setCyclesToShow] = useState(4)
  const [playing, setPlaying] = useState(true)
  const [replayNonce, setReplayNonce] = useState(0)
  const frequencyLimits = simulationFrequencyLimits(sampleRateHz)
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

  const signalPresets = normalizeFrequencyPresets([
    { id: 'slow', label: '0.2×fc', value: cutoffHz * 0.2 },
    { id: 'cutoff', label: '1×fc', value: cutoffHz },
    { id: 'fast', label: '5×fc', value: cutoffHz * 5 },
    { id: 'sample-edge', label: '0.4×fs', value: sampleRateHz * 0.4 },
  ], frequencyLimits.minimum, frequencyLimits.maximum)
  const interferencePresets = normalizeFrequencyPresets([
    { id: 'interference-cutoff', label: '1×fc', value: cutoffHz },
    { id: 'interference-five', label: '5×fc', value: cutoffHz * 5 },
    { id: 'interference-ten', label: '10×fc', value: cutoffHz * 10 },
    { id: 'interference-edge', label: '0.4×fs', value: sampleRateHz * 0.4 },
  ], frequencyLimits.minimum, frequencyLimits.maximum)

  const simulation = useMemo(
    () =>
      createSimulation({
        cutoffHz,
        sampleRateHz,
        method,
        inputType,
        signalFrequencyHz: activeSignalFrequency,
        signalAmplitude,
        noiseLevel,
        interferenceFrequencyHz: activeInterferenceFrequency,
        squareDutyCycle,
        stepTimeRatio,
        cyclesToShow,
      }),
    [
      cutoffHz,
      sampleRateHz,
      method,
      inputType,
      activeSignalFrequency,
      signalAmplitude,
      noiseLevel,
      activeInterferenceFrequency,
      squareDutyCycle,
      stepTimeRatio,
      cyclesToShow,
    ],
  )
  const yDomain = useMemo(() => seriesDomain(simulation.input, simulation.output), [simulation])
  const gain = magnitudeAt(activeSignalFrequency, cutoffHz)
  const phase = phaseDegreesAt(activeSignalFrequency, cutoffHz)
  const delay = phaseDelaySeconds(activeSignalFrequency, cutoffHz)
  const interferenceGain = magnitudeAt(activeInterferenceFrequency, cutoffHz)
  const tau = tauFromCutoff(cutoffHz)
  const time95 = settlingTime(tau, 0.95)
  const time99 = settlingTime(tau, 0.99)
  const rmsRatio = simulation.inputRms > 0 ? simulation.outputRms / simulation.inputRms : 0
  const frequencyRatio = activeSignalFrequency / cutoffHz
  const animationKey = [
    cutoffHz,
    sampleRateHz,
    method,
    inputType,
    activeSignalFrequency,
    signalAmplitude,
    noiseLevel,
    activeInterferenceFrequency,
    squareDutyCycle,
    stepTimeRatio,
    cyclesToShow,
    replayNonce,
  ].join('-')

  const metrics = inputType === 'step'
    ? [
        { label: '达到 95%', value: formatSeconds(time95), detail: '严格值约 2.996τ' },
        { label: '达到 99%', value: formatSeconds(time99), detail: '严格值约 4.605τ' },
        { label: '整体 RMS', value: formatPercent(rmsRatio, 1), detail: '输出 / 输入' },
        { label: '单步追近', value: formatPercent(simulation.alpha, 2), detail: '每个采样点' },
      ]
    : [
        {
          label: inputType === 'square' ? '基波保留' : '主信号保留',
          value: formatPercent(gain, 1),
          detail: `${formatNumber(20 * Math.log10(gain), 2)} dB`,
        },
        inputType === 'noise'
          ? {
              label: '周期干扰保留',
              value: formatPercent(interferenceGain, 1),
              detail: `@ ${formatFrequency(activeInterferenceFrequency)}`,
            }
          : {
              label: '相位变化',
              value: `${formatNumber(phase, 1)}°`,
              detail: `${formatSeconds(delay)} 等效偏移`,
            },
        { label: '整体 RMS', value: formatPercent(rmsRatio, 1), detail: '输出 / 输入' },
        { label: '单步追近', value: formatPercent(simulation.alpha, 2), detail: '每个采样点' },
      ]

  function replay() {
    setReplayNonce((current) => current + 1)
    setPlaying(true)
  }

  return (
    <section id="simulator" className="content-section simulator-section">
      <SectionIntro
        eyebrow="03 · 动手模拟"
        title="把信号送进去，亲眼看输出怎么“追”"
        description="选择输入类型，再调频率、幅值、观察窗口和波形细节。曲线使用真实离散递推 y[n] = y[n−1] + α(x[n]−y[n−1]) 逐点计算。"
        aside={<><span className="pulse-ring" />真实采样递推</>}
      />

      <div className="simulator-layout">
        <aside className="simulator-controls">
          <div className="control-group">
            <label>输入信号</label>
            <div className="stacked-options">
              {INPUT_TYPES.map((type) => {
                const Icon = type.icon
                return (
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
                    <Icon size={18} />
                    {type.label}
                  </button>
                )
              })}
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
              hint={`当前 f / fc = ${formatNumber(frequencyRatio, 2)}：${describeFrequencyZone(frequencyRatio)}。`}
            />
          ) : null}

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
              {sampleRateHz} samples/s · {inputType === 'step' ? `窗口 ${formatSeconds(simulation.duration)}` : `${formatFrequency(activeSignalFrequency)} · ${formatSeconds(simulation.duration)}`} · α {formatNumber(simulation.alpha, 5)}
            </span>
          </div>
          <LineChart
            key={animationKey}
            series={[
              { label: '输入 x[n]', color: '#f29a4a', data: simulation.input, dash: '7 6' },
              { label: '输出 y[n]', color: '#d7f56d', data: simulation.output },
            ]}
            xDomain={[0, simulation.duration]}
            yDomain={yDomain}
            xTicks={[0, simulation.duration * 0.25, simulation.duration * 0.5, simulation.duration * 0.75, simulation.duration]}
            yTicks={Array.from({ length: 5 }, (_, index) => yDomain[0] + ((yDomain[1] - yDomain[0]) * index) / 4)}
            formatX={formatSeconds}
            formatY={(value) => formatNumber(value, 2)}
            ariaLabel="输入信号与一阶低通滤波输出的离散时域模拟"
            showPlayhead
            playing={playing}
          />

          <div className="scope-readouts" aria-live="polite">
            {metrics.map((metric) => (
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
            <div className="control-group-heading">
              <span>信号细节</span>
              <small>{inputType === 'step' ? '幅值 · 跳变时刻' : '幅值 · 观察窗口 · 波形'}</small>
            </div>
            <RangeField
              id="signal-amplitude"
              label={inputType === 'step' ? '阶跃高度' : '信号幅值'}
              value={signalAmplitude}
              valueLabel={`${formatNumber(signalAmplitude, 2)}×`}
              minimum={0.1}
              maximum={2}
              step={0.05}
              onChange={setSignalAmplitude}
              minimumLabel="0.1×"
              maximumLabel="2×"
              accent="accent-orange"
            />

            {inputType !== 'step' ? (
              <RangeField
                id="cycles-to-show"
                label="目标观察周期"
                value={cyclesToShow}
                valueLabel={`${cyclesToShow} 个`}
                minimum={2}
                maximum={12}
                step={1}
                onChange={setCyclesToShow}
                minimumLabel="近看 2 周期"
                maximumLabel="全局 12 周期"
              />
            ) : (
              <RangeField
                id="step-time"
                label="跳变时刻"
                value={stepTimeRatio}
                valueLabel={formatPercent(stepTimeRatio, 0)}
                minimum={0.05}
                maximum={0.45}
                step={0.01}
                onChange={setStepTimeRatio}
                minimumLabel="窗口 5%"
                maximumLabel="窗口 45%"
              />
            )}

            {inputType === 'noise' ? (
              <RangeField
                id="noise-level"
                label="噪声强度"
                value={noiseLevel}
                valueLabel={formatPercent(noiseLevel, 0)}
                minimum={0}
                maximum={1.5}
                step={0.01}
                onChange={setNoiseLevel}
                minimumLabel="干净 0%"
                maximumLabel="强噪声 150%"
              />
            ) : null}

            {inputType === 'square' ? (
              <RangeField
                id="square-duty-cycle"
                label="方波占空比"
                value={squareDutyCycle}
                valueLabel={formatPercent(squareDutyCycle, 0)}
                minimum={0.1}
                maximum={0.9}
                step={0.01}
                onChange={setSquareDutyCycle}
                minimumLabel="10%"
                maximumLabel="90%"
              />
            ) : null}
          </div>

          {inputType === 'noise' ? (
            <FrequencyControl
              id="interference-frequency"
              label="周期干扰频率"
              value={activeInterferenceFrequency}
              minimum={frequencyLimits.minimum}
              maximum={frequencyLimits.maximum}
              onChange={setInterferenceFrequencyHz}
              presets={interferencePresets}
              accent="accent-lime"
              hint={`当前干扰位于 ${formatNumber(activeInterferenceFrequency / cutoffHz, 2)}×fc，理论上约保留 ${formatPercent(interferenceGain, 1)}。`}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
