import EngineeringFrequencyInput from './EngineeringFrequencyInput.jsx'
import {
  alphaForMethod,
  CUTOFF_FREQUENCY_RANGE,
  digitalMappingDiagnostics,
  groupDelaySecondsAt,
  magnitudeAt,
  nyquistFrequency,
  phaseDegreesAt,
  SAMPLE_RATE_RANGE,
  samplePeriodSeconds,
  settlingTime,
  tauFromCutoff,
} from '../lib/filterMath.js'
import {
  formatEngineeringRate,
  formatFrequency,
  formatNumber,
  formatPercent,
  formatSeconds,
} from '../lib/format.js'

const PRESETS = [
  { id: 'temperature', label: '低速传感', cutoffHz: 0.5, sampleRateHz: 50 },
  { id: 'general', label: '通用采集', cutoffHz: 2.5, sampleRateHz: 100 },
  { id: 'audio', label: '音频包络', cutoffHz: 2_000, sampleRateHz: 48_000 },
  { id: 'high-speed', label: '高速采样', cutoffHz: 1_000_000, sampleRateHz: 20_000_000 },
]

function FrequencyRailControl({ label, symbol, value, range, accent, onChange }) {
  return (
    <div className="rail-control-group">
      <div className="rail-control-label">
        <div><span>{label}</span><strong>{symbol}</strong></div>
        <EngineeringFrequencyInput
          compact
          valueHz={value}
          minimumHz={range.minimum}
          maximumHz={range.maximum}
          ariaLabel={label}
          onChange={onChange}
        />
      </div>
      <input
        className={`range-control ${accent}`}
        type="range"
        min={Math.log10(range.minimum)}
        max={Math.log10(range.maximum)}
        step="0.001"
        value={Math.log10(value)}
        aria-label={`以对数刻度调整${label}`}
        onChange={(event) => onChange(10 ** Number(event.target.value))}
      />
      <div className="range-scale"><span>{formatFrequency(range.minimum)}</span><span>{formatFrequency(range.maximum)}</span></div>
    </div>
  )
}

export default function GlobalParameterRail({
  variant = 'digital',
  title = '曲线计算参数',
  description = '参数固定在左侧，右侧只负责展示结果。',
  cutoffHz,
  sampleRateHz,
  method,
  onCutoffChange,
  onSampleRateChange,
  onMethodChange,
  onPreset,
}) {
  const analogOnly = variant === 'analog'
  const tau = tauFromCutoff(cutoffHz)
  const samplePeriod = samplePeriodSeconds(sampleRateHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const nyquist = nyquistFrequency(sampleRateHz)
  const mapping = digitalMappingDiagnostics(cutoffHz, sampleRateHz, method)
  const time95 = settlingTime(tau, 0.95)

  return (
    <aside className="global-parameter-rail" aria-label={title}>
      <header>
        <span>GLOBAL CONTROLS</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>

      <FrequencyRailControl
        label="截止频率"
        symbol="fc"
        value={cutoffHz}
        range={CUTOFF_FREQUENCY_RANGE}
        accent="accent-orange"
        onChange={onCutoffChange}
      />
      {analogOnly ? null : (
        <FrequencyRailControl
          label="采样频率"
          symbol="fs"
          value={sampleRateHz}
          range={SAMPLE_RATE_RANGE}
          accent="accent-lime"
          onChange={onSampleRateChange}
        />
      )}

      {analogOnly ? null : (
        <div className="rail-control-group rail-method-group">
          <div className="rail-control-label"><div><span>离散方法</span><strong>α</strong></div></div>
          <div className="segmented-control" role="group" aria-label="全局离散方法">
            <button type="button" className={method === 'zoh' ? 'is-active' : ''} aria-pressed={method === 'zoh'} onClick={() => onMethodChange('zoh')}>ZOH</button>
            <button type="button" className={method === 'backward-euler' ? 'is-active' : ''} aria-pressed={method === 'backward-euler'} onClick={() => onMethodChange('backward-euler')}>后向欧拉</button>
          </div>
          <code>{method === 'zoh' ? 'α = 1 − e^(−2πfc/fs)' : 'α = 2πfc / (fs + 2πfc)'}</code>
        </div>
      )}

      {analogOnly ? (
        <div className="rail-validity is-safe">
          <span>ANALOG PROTOTYPE</span>
          <strong>H(s) = 1 / (1 + τs)</strong>
          <small>本页不混入 fs、α 或离散方法</small>
        </div>
      ) : (
        <div className={`rail-validity ${mapping.closeToAnalog ? 'is-safe' : 'is-warning'}`}>
          <span>{mapping.closeToAnalog ? 'MAPPING CLOSE' : 'CHECK DIGITAL RESPONSE'}</span>
          <strong>{mapping.cutoffInBaseband
            ? `@fc ${formatNumber(mapping.gainDb, 2)} dB / ${formatNumber(mapping.phaseDegrees, 1)}°`
            : 'fc ≥ fN'}</strong>
          <small>{mapping.cutoffInBaseband
            ? '以实际数字幅相判断，不再使用固定 fc/fs 门槛'
            : 'fc 不在严格数字基带内；请直接查看数字响应'}</small>
        </div>
      )}

      <dl className="rail-derived-values">
        {analogOnly ? (
          <>
            <div><dt>时间常数 τ</dt><dd>{formatSeconds(tau)}</dd><small>达到最终值 63.2%</small></div>
            <div><dt>达到 95%</dt><dd>{formatSeconds(time95)}</dd><small>严格值 2.996τ</small></div>
            <div><dt>fc 处幅值</dt><dd>{formatPercent(magnitudeAt(cutoffHz, cutoffHz), 2)}</dd><small>−3.0103 dB</small></div>
            <div><dt>fc 处相位</dt><dd>{formatNumber(phaseDegreesAt(cutoffHz, cutoffHz), 1)}°</dd><small>连续原型</small></div>
            <div><dt>fc 处群时延</dt><dd>{formatSeconds(groupDelaySecondsAt(cutoffHz, cutoffHz))}</dd><small>τ / 2</small></div>
          </>
        ) : (
          <>
            <div><dt>时间常数 τ</dt><dd>{formatSeconds(tau)}</dd><small>63.2% 响应时间</small></div>
            <div><dt>采样周期 Ts</dt><dd>{formatSeconds(samplePeriod)}</dd><small>Ts = 1 / fs</small></div>
            <div><dt>数字系数 α</dt><dd>{formatNumber(alpha, 7)}</dd><small>每次修正差值的 α 倍</small></div>
            <div><dt>Nyquist fN</dt><dd>{formatFrequency(nyquist)}</dd><small>严格低于该边界才无歧义</small></div>
            <div><dt>实时计算量</dt><dd>{formatEngineeringRate(sampleRateHz * 3, 'ops/s')}</dd><small>每点 1 乘 + 2 加减</small></div>
          </>
        )}
      </dl>

      <div className="rail-presets">
        <span>快速场景</span>
        <div>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => analogOnly ? onCutoffChange(preset.cutoffHz) : onPreset(preset)}
            >
              <strong>{preset.label}</strong>
              <small>{analogOnly
                ? `fc ${formatFrequency(preset.cutoffHz)}`
                : `${formatFrequency(preset.cutoffHz)} / ${formatFrequency(preset.sampleRateHz)}`}</small>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
