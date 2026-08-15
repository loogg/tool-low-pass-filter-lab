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
  {
    id: 'temperature',
    name: '温度采集',
    description: '低速传感器',
    cutoffHz: 0.5,
    sampleRateHz: 50,
  },
  {
    id: 'sensor',
    name: '通用采集',
    description: '响应与降噪折中',
    cutoffHz: 2.5,
    sampleRateHz: 100,
  },
  {
    id: 'audio',
    name: '音频包络',
    description: 'kHz 级采样',
    cutoffHz: 2_000,
    sampleRateHz: 48_000,
  },
  {
    id: 'power',
    name: '高速采样',
    description: 'MHz 级示例',
    cutoffHz: 1_000_000,
    sampleRateHz: 20_000_000,
  },
]

function Metric({ label, value, detail }) {
  return (
    <div className="calculation-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

function MetricGroup({ eyebrow, title, children }) {
  return (
    <article className="calculation-group">
      <header><span>{eyebrow}</span><h3>{title}</h3></header>
      <dl>{children}</dl>
    </article>
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
  const samplePeriod = samplePeriodSeconds(sampleRateHz)
  const nyquist = nyquistFrequency(sampleRateHz)
  const time95 = settlingTime(tau, 0.95)
  const time99 = settlingTime(tau, 0.99)
  const frequencyRatio = cutoffHz / sampleRateHz
  const mapping = digitalMappingDiagnostics(cutoffHz, sampleRateHz, method)
  const cutoffMagnitude = magnitudeAt(cutoffHz, cutoffHz)
  const cutoffPhase = phaseDegreesAt(cutoffHz, cutoffHz)
  const cutoffGroupDelay = groupDelaySecondsAt(cutoffHz, cutoffHz)

  return (
    <section className="parameter-deck" aria-labelledby="parameter-deck-title">
      <div className="deck-heading">
        <div>
          <p className="eyebrow">全局实验参数</p>
          <h2 id="parameter-deck-title">设置滤波器，再查看完整计算结果</h2>
          <p className="deck-description">fc 与 fs 独立输入；数值输入支持 Hz、kHz、MHz。fc 到达或越过 Nyquist 边界时只提示风险，不会自动改写你的参数。</p>
        </div>
      </div>

      <div className="parameter-grid">
        <div className="control-block control-block-primary">
          <div className="control-title-row is-plain">
            <div>
              <span className="control-kicker">截止频率</span>
              <strong>f<sub>c</sub></strong>
            </div>
            <EngineeringFrequencyInput
              valueHz={cutoffHz}
              minimumHz={CUTOFF_FREQUENCY_RANGE.minimum}
              maximumHz={CUTOFF_FREQUENCY_RANGE.maximum}
              ariaLabel="截止频率"
              onChange={onCutoffChange}
            />
          </div>
          <input
            className="range-control accent-orange"
            type="range"
            min={Math.log10(CUTOFF_FREQUENCY_RANGE.minimum)}
            max={Math.log10(CUTOFF_FREQUENCY_RANGE.maximum)}
            step={0.001}
            value={Math.log10(cutoffHz)}
            aria-label="以宽量程对数刻度调整截止频率"
            onChange={(event) => onCutoffChange(10 ** Number(event.target.value))}
          />
          <div className="range-scale">
            <span>{formatFrequency(CUTOFF_FREQUENCY_RANGE.minimum)}</span>
            <span>{formatFrequency(CUTOFF_FREQUENCY_RANGE.maximum)}</span>
          </div>
          <p>连续域响应由 fc 决定；数字实现是否合理还要同时检查 fc / fs。</p>
        </div>

        <div className="control-block">
          <div className="control-title-row is-plain">
            <div>
              <span className="control-kicker">采样频率</span>
              <strong>f<sub>s</sub></strong>
            </div>
            <EngineeringFrequencyInput
              valueHz={sampleRateHz}
              minimumHz={SAMPLE_RATE_RANGE.minimum}
              maximumHz={SAMPLE_RATE_RANGE.maximum}
              ariaLabel="采样频率"
              onChange={onSampleRateChange}
            />
          </div>
          <input
            className="range-control accent-lime"
            type="range"
            min={Math.log10(SAMPLE_RATE_RANGE.minimum)}
            max={Math.log10(SAMPLE_RATE_RANGE.maximum)}
            step={0.001}
            value={Math.log10(sampleRateHz)}
            aria-label="以宽量程对数刻度调整采样频率"
            onChange={(event) => onSampleRateChange(10 ** Number(event.target.value))}
          />
          <div className="range-scale">
            <span>{formatFrequency(SAMPLE_RATE_RANGE.minimum)}</span>
            <span>{formatFrequency(SAMPLE_RATE_RANGE.maximum)}</span>
          </div>
          <p>fs 决定采样周期、奈奎斯特频率、每秒计算次数和数字系数 α。</p>
        </div>

        <div className="control-block">
          <div className="control-title-row is-plain method-title-row">
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
          <p>{method === 'zoh' ? '准确保持一阶系统的时间常数。' : '计算简单且无条件稳定，但映射有少量偏差。'}</p>
        </div>
      </div>

      <section className="calculation-board" aria-live="polite" aria-label="当前参数计算结果">
        <header className="calculation-board-heading">
          <div><span>CALCULATED VALUES</span><h3>由当前 fc、fs 与离散方法直接得到</h3></div>
          <strong className={mapping.closeToAnalog ? 'is-safe' : 'is-warning'}>
            {mapping.closeToAnalog ? 'fc 点映射接近连续原型' : '请检查数字映射差异'}
          </strong>
        </header>

        <div className="calculation-groups">
          <MetricGroup eyebrow="DIGITAL" title="数字实现">
            <Metric label="采样周期 Ts" value={formatSeconds(samplePeriod)} detail="Ts = 1 / fs" />
            <Metric label="数字系数 α" value={formatNumber(alpha, 8)} detail={method === 'zoh' ? 'ZOH 映射' : '后向欧拉'} />
            <Metric
              label="频率比 fc/fs"
              value={formatNumber(frequencyRatio, 6)}
              detail={mapping.cutoffInBaseband
                ? `数字 @fc：${formatNumber(mapping.gainDb, 3)} dB / ${formatNumber(mapping.phaseDegrees, 2)}°`
                : 'fc 已不在严格数字基带内'}
            />
            <Metric label="奈奎斯特频率 fN" value={formatFrequency(nyquist)} detail="fN = fs / 2" />
            <Metric label="无歧义频带" value={`0 ≤ f < ${formatFrequency(nyquist)}`} detail="fN 是特殊边界；超过后会折回" />
          </MetricGroup>

          <MetricGroup eyebrow="TIME DOMAIN" title="时域响应">
            <Metric label="时间常数 τ" value={formatSeconds(tau)} detail="达到最终值 63.2%" />
            <Metric label="达到 95%" value={formatSeconds(time95)} detail="严格值 2.996τ" />
            <Metric label="达到 99%" value={formatSeconds(time99)} detail="严格值 4.605τ" />
            <Metric label="fc 处群时延" value={formatSeconds(cutoffGroupDelay)} detail="一阶模拟原型 τ/2" />
          </MetricGroup>

          <MetricGroup eyebrow="FREQUENCY DOMAIN" title="幅相响应">
            <Metric label="fc 处幅值" value={formatPercent(cutoffMagnitude, 2)} detail="−3.0103 dB" />
            <Metric label="fc 处相位" value={`${formatNumber(cutoffPhase, 1)}°`} detail="输出滞后四分之一象限" />
            <Metric label="高频滚降" value="−20 dB/dec" detail="频率每 ×10，幅值约 ÷10" />
            <Metric label="极点角频率" value={`${formatNumber(2 * Math.PI * cutoffHz, 4)} rad/s`} detail="ωc = 2πfc" />
          </MetricGroup>

          <MetricGroup eyebrow="COMPUTE" title="实时计算量">
            <Metric label="每个采样点" value="1 乘 + 2 加减" detail="y += α(x − y)" />
            <Metric label="算术运算速率" value={formatEngineeringRate(sampleRateHz * 3, 'ops/s')} detail="按 3 次基本运算估算" />
            <Metric label="乘法速率" value={formatEngineeringRate(sampleRateHz, 'mul/s')} detail="每采样 1 次乘法" />
            <Metric label="状态量" value="y + α" detail="float 实现通常 8 bytes" />
          </MetricGroup>
        </div>

        <section className="sampling-theory-panel" aria-label="Nyquist 与混叠折回说明">
          <div className="sampling-theory-copy">
            <span>SAMPLING BOUNDARY</span>
            <h4>奈奎斯特频率是“开始产生歧义”的边界</h4>
            <p>当前 <strong>fN = fs / 2 = {formatFrequency(nyquist)}</strong>。只有严格低于 fN 的频率才具有完整的幅相表达；fN 本身是特殊边界，高于它的模拟频率会折回。</p>
          </div>

          <div className="sampling-fold-ruler" role="img" aria-label="频率轴在每个奈奎斯特区交替正向与镜像折回">
            <div className="sampling-fold-zones">
              <span><b>第 1 区</b><i>0 → fN</i></span>
              <span><b>第 2 区</b><i>fN ← 0</i></span>
              <span><b>第 3 区</b><i>0 → fN</i></span>
              <span><b>第 4 区</b><i>fN ← 0</i></span>
            </div>
            <div className="sampling-fold-scale">
              <span>0</span>
              <span>{formatFrequency(nyquist)}</span>
              <span>{formatFrequency(sampleRateHz)}</span>
              <span>{formatFrequency(nyquist * 3)}</span>
              <span>{formatFrequency(sampleRateHz * 2)}</span>
            </div>
          </div>

          <div className="sampling-formula-card">
            <span>心算公式（推荐）</span>
            <code>k = round(f<sub>in</sub> / f<sub>s</sub>)</code>
            <code>f<sub>alias</sub> = |f<sub>in</sub> − k·f<sub>s</sub>|</code>
            <small>找到离 f<sub>in</sub> 最近的 f<sub>s</sub> 整数倍，再算两者距离。当前：{formatFrequency(sampleRateHz * 0.6)} 离 {formatFrequency(sampleRateHz)} 最近，距离为 <strong>{formatFrequency(sampleRateHz * 0.4)}</strong>。</small>
          </div>
        </section>

        <p className="alpha-explanation">
          <strong>α 到底表示什么：</strong>
          当前 α = {formatNumber(alpha, 8)}。递推式先计算差值 <code>x − y</code>，再只修正其中的 α 倍；例如差值为 1，本次输出增加 <strong>{formatNumber(alpha, 8)}</strong>，差值为 10 时增加 <strong>{formatNumber(alpha * 10, 8)}</strong>。下一次采样会基于新的差值继续逼近。
        </p>
      </section>

      <div className="preset-row">
        <span className="preset-label">参数示例</span>
        {PRESETS.map((preset) => (
          <button key={preset.id} type="button" className="preset-button is-text-only" onClick={() => onPreset(preset)}>
            <span>
              <strong>{preset.name}</strong>
              <small>{preset.description} · fc {formatFrequency(preset.cutoffHz)} · fs {formatFrequency(preset.sampleRateHz)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
