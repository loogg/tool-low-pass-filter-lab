import { useMemo, useState } from 'react'
import { AudioWaveform, Pause, Play, RotateCcw, Square, StepForward } from 'lucide-react'
import {
  createSimulation,
  magnitudeAt,
  phaseDegreesAt,
  phaseDelaySeconds,
} from '../lib/filterMath.js'
import { formatNumber, formatPercent, formatSeconds } from '../lib/format.js'
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
  for (const point of [...input, ...output]) {
    minimum = Math.min(minimum, point.y)
    maximum = Math.max(maximum, point.y)
  }
  const span = Math.max(0.2, maximum - minimum)
  return [minimum - span * 0.12, maximum + span * 0.12]
}

export default function SimulatorLab({ cutoffHz, sampleRateHz, method }) {
  const [inputType, setInputType] = useState('noise')
  const [signalFrequencyHz, setSignalFrequencyHz] = useState(1)
  const [noiseLevel, setNoiseLevel] = useState(0.35)
  const [playing, setPlaying] = useState(true)
  const [replayNonce, setReplayNonce] = useState(0)
  const maximumSignalFrequency = Math.max(0.1, Math.min(100, sampleRateHz / 5))
  const activeSignalFrequency = Math.min(signalFrequencyHz, maximumSignalFrequency)

  const simulation = useMemo(
    () =>
      createSimulation({
        cutoffHz,
        sampleRateHz,
        method,
        inputType,
        signalFrequencyHz: activeSignalFrequency,
        noiseLevel,
      }),
    [cutoffHz, sampleRateHz, method, inputType, activeSignalFrequency, noiseLevel],
  )
  const yDomain = useMemo(() => seriesDomain(simulation.input, simulation.output), [simulation])
  const gain = magnitudeAt(activeSignalFrequency, cutoffHz)
  const phase = phaseDegreesAt(activeSignalFrequency, cutoffHz)
  const delay = phaseDelaySeconds(activeSignalFrequency, cutoffHz)
  const rmsRatio = simulation.inputRms > 0 ? simulation.outputRms / simulation.inputRms : 0
  const animationKey = `${cutoffHz}-${sampleRateHz}-${method}-${inputType}-${activeSignalFrequency}-${noiseLevel}-${replayNonce}`

  function replay() {
    setReplayNonce((current) => current + 1)
    setPlaying(true)
  }

  return (
    <section id="simulator" className="content-section simulator-section">
      <SectionIntro
        eyebrow="03 · 动手模拟"
        title="把信号送进去，亲眼看输出怎么“追”"
        description="选择输入类型，再调信号频率和噪声。曲线使用真实离散递推 y[n] = y[n−1] + α(x[n]−y[n−1]) 逐点计算。"
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
            <div className="control-group">
              <div className="control-label-row"><label htmlFor="signal-frequency">信号频率</label><strong>{formatNumber(activeSignalFrequency, 2)} Hz</strong></div>
              <input
                id="signal-frequency"
                className="range-control accent-orange"
                type="range"
                min={0.1}
                max={maximumSignalFrequency}
                step={0.1}
                value={activeSignalFrequency}
                onChange={(event) => setSignalFrequencyHz(Number(event.target.value))}
              />
              <p>接近或超过 fc 时，幅值和相位变化会更明显。</p>
            </div>
          ) : null}

          {inputType === 'noise' ? (
            <div className="control-group">
              <div className="control-label-row"><label htmlFor="noise-level">噪声强度</label><strong>{formatPercent(noiseLevel, 0)}</strong></div>
              <input
                id="noise-level"
                className="range-control accent-lime"
                type="range"
                min={0}
                max={0.9}
                step={0.01}
                value={noiseLevel}
                onChange={(event) => setNoiseLevel(Number(event.target.value))}
              />
              <p>包含随机噪声和 9 倍频的高频纹波。</p>
            </div>
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
            <span>{sampleRateHz} samples/s · α {formatNumber(simulation.alpha, 5)}</span>
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

          <div className="scope-readouts">
            <div><span>信号保留</span><strong>{formatPercent(gain, 1)}</strong><small>{formatNumber(20 * Math.log10(gain), 2)} dB</small></div>
            <div><span>相位变化</span><strong>{formatNumber(phase, 1)}°</strong><small>{formatSeconds(delay)} 等效偏移</small></div>
            <div><span>整体 RMS</span><strong>{formatPercent(rmsRatio, 1)}</strong><small>输出 / 输入</small></div>
            <div><span>单步追近</span><strong>{formatPercent(simulation.alpha, 2)}</strong><small>每个采样点</small></div>
          </div>
        </article>
      </div>
    </section>
  )
}
