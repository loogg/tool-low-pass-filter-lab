import { Activity, Clock3, Cpu, Thermometer, Waves, Zap } from 'lucide-react'
import { alphaForMethod, tauFromCutoff } from '../lib/filterMath.js'
import { formatFrequency, formatNumber, formatSeconds } from '../lib/format.js'

const PRESETS = [
  {
    id: 'temperature',
    name: '温度采集',
    description: '慢变量，优先稳定',
    cutoffHz: 0.5,
    sampleRateHz: 50,
    icon: Thermometer,
  },
  {
    id: 'sensor',
    name: '传感器平滑',
    description: '响应与降噪折中',
    cutoffHz: 2.5,
    sampleRateHz: 100,
    icon: Activity,
  },
  {
    id: 'voltage',
    name: '电压纹波',
    description: '更快采样，观察纹波',
    cutoffHz: 20,
    sampleRateHz: 1000,
    icon: Zap,
  },
]

function NumericInput({ value, onChange, min, max, step, suffix, ariaLabel }) {
  return (
    <label className="numeric-input">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span>{suffix}</span>
    </label>
  )
}

export default function ParameterDeck({
  cutoffHz,
  sampleRateHz,
  method,
  onCutoffChange,
  onSampleRateChange,
  onMethodChange,
  onPreset,
}) {
  const tau = tauFromCutoff(cutoffHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const maxCutoff = Math.max(0.1, Math.min(200, sampleRateHz * 0.45))
  const logarithmicCutoff = Math.log10(cutoffHz)

  return (
    <section className="parameter-deck" aria-labelledby="parameter-deck-title">
      <div className="deck-heading">
        <div>
          <p className="eyebrow">全局实验参数</p>
          <h2 id="parameter-deck-title">先转动唯一的“快慢旋钮”</h2>
        </div>
        <div className="live-pill">
          <span className="status-dot" />
          图表实时联动
        </div>
      </div>

      <div className="parameter-grid">
        <div className="control-block control-block-primary">
          <div className="control-title-row">
            <div className="control-icon"><Waves size={18} /></div>
            <div>
              <span className="control-kicker">截止频率</span>
              <strong>f<sub>c</sub></strong>
            </div>
            <NumericInput
              value={Number(cutoffHz.toFixed(3))}
              min={0.1}
              max={maxCutoff}
              step={0.1}
              suffix="Hz"
              ariaLabel="截止频率"
              onChange={onCutoffChange}
            />
          </div>
          <input
            className="range-control accent-orange"
            type="range"
            min={-1}
            max={Math.log10(maxCutoff)}
            step={0.01}
            value={logarithmicCutoff}
            aria-label="以对数刻度调整截止频率"
            onChange={(event) => onCutoffChange(10 ** Number(event.target.value))}
          />
          <div className="range-scale"><span>0.1 Hz</span><span>{formatFrequency(maxCutoff)}</span></div>
          <p>越低越平滑，越高越灵敏。其他所有参数都会跟着它变化。</p>
        </div>

        <div className="control-block">
          <div className="control-title-row">
            <div className="control-icon"><Cpu size={18} /></div>
            <div>
              <span className="control-kicker">采样频率</span>
              <strong>f<sub>s</sub></strong>
            </div>
            <NumericInput
              value={sampleRateHz}
              min={10}
              max={10000}
              step={10}
              suffix="Hz"
              ariaLabel="采样频率"
              onChange={onSampleRateChange}
            />
          </div>
          <input
            className="range-control accent-lime"
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={Math.log10(sampleRateHz)}
            aria-label="以对数刻度调整采样频率"
            onChange={(event) => onSampleRateChange(Math.round(10 ** Number(event.target.value)))}
          />
          <div className="range-scale"><span>10 Hz</span><span>10 kHz</span></div>
          <p>决定每秒更新多少次，也决定数字系数 α 的实际含义。</p>
        </div>

        <div className="control-block">
          <div className="control-title-row">
            <div className="control-icon"><Clock3 size={18} /></div>
            <div>
              <span className="control-kicker">离散方法</span>
              <strong>α 计算</strong>
            </div>
          </div>
          <div className="segmented-control" role="group" aria-label="离散方法">
            <button
              type="button"
              className={method === 'zoh' ? 'is-active' : ''}
              aria-pressed={method === 'zoh'}
              onClick={() => onMethodChange('zoh')}
            >
              ZOH 精确
            </button>
            <button
              type="button"
              className={method === 'backward-euler' ? 'is-active' : ''}
              aria-pressed={method === 'backward-euler'}
              onClick={() => onMethodChange('backward-euler')}
            >
              后向欧拉
            </button>
          </div>
          <p className="method-formula">
            {method === 'zoh' ? 'α = 1 − exp(−2πfc / fs)' : 'α = 2πfc / (fs + 2πfc)'}
          </p>
          <p>{method === 'zoh' ? '准确保持一阶系统的时间常数，适合传感器平滑。' : '公式简单且稳定，和 ZOH 会有少量映射差异。'}</p>
        </div>
      </div>

      <div className="derived-strip" aria-live="polite">
        <div><Clock3 size={17} /><span>时间常数 τ</span><strong>{formatSeconds(tau)}</strong></div>
        <div><Waves size={17} /><span>截止频率 fc</span><strong>{formatFrequency(cutoffHz)}</strong></div>
        <div><Cpu size={17} /><span>数字系数 α</span><strong>{formatNumber(alpha, 6)}</strong></div>
        <p>每次采样，输出向输入靠近差值的 <strong>{formatNumber(alpha * 100, 2)}%</strong>。</p>
      </div>

      <div className="preset-row">
        <span className="preset-label">快速场景</span>
        {PRESETS.map((preset) => {
          const Icon = preset.icon
          return (
            <button key={preset.id} type="button" className="preset-button" onClick={() => onPreset(preset)}>
              <Icon size={17} />
              <span><strong>{preset.name}</strong><small>{preset.description}</small></span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
