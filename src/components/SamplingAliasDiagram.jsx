import { formatFrequency, formatNumber } from '../lib/format.js'

function clampPercent(value) {
  return `${Math.min(98, Math.max(2, value))}%`
}

function FrequencyMarker({ position, tone, eyebrow, value }) {
  return (
    <span
      className={`alias-process-marker is-${tone}`}
      style={{ '--marker-position': clampPercent(position) }}
    >
      <i aria-hidden="true" />
      <span>{eyebrow}</span>
      <strong>{value}</strong>
    </span>
  )
}

export default function SamplingAliasDiagram({
  inputType,
  signalFrequencyHz,
  signalInfo,
  sampleRateHz,
  presets,
  onSelectPreset,
}) {
  const nyquist = sampleRateHz / 2
  const remainderPercent = (signalInfo.remainder / sampleRateHz) * 100
  const aliasPercent = nyquist > 0 ? (signalInfo.aliasFrequency / nyquist) * 100 : 0
  const reflected = signalInfo.remainder > nyquist
  const nearestMultipleIndex = signalInfo.nearestSampleMultiple
  const nearestMultipleHz = nearestMultipleIndex * sampleRateHz

  if (inputType === 'step') {
    return (
      <div className="sampling-explainer is-step">
        <div className="sampling-conclusion">
          <span>STEP INPUT</span>
          <strong>阶跃没有唯一的折回频率</strong>
          <p>阶跃包含一整段连续频谱。采样前要用模拟抗混叠滤波器，把高于 {formatFrequency(nyquist)} 的能量先压低；采样以后无法逐项判断它原来来自哪里。</p>
        </div>
        <div className="sampling-step-spectrum" aria-label="阶跃宽频谱经抗混叠滤波和 ADC 的过程">
          <div><span>01</span><strong>阶跃边沿</strong><small>宽频谱</small></div>
          <b aria-hidden="true">→</b>
          <div><span>02</span><strong>模拟限带</strong><small>ADC 前</small></div>
          <b aria-hidden="true">→</b>
          <div><span>03</span><strong>ADC 采样</strong><small>fs = {formatFrequency(sampleRateHz)}</small></div>
        </div>
        <p className="aliasing-core-warning"><strong>工程结论：</strong>数字低通可以平滑采样后的阶跃，但不能撤销已经发生的混叠。</p>
      </div>
    )
  }

  return (
    <div className={`sampling-explainer ${signalInfo.ambiguous ? 'is-aliasing' : 'is-safe'}`}>
      <div className="sampling-conclusion" aria-live="polite">
        <span>{signalInfo.atNyquist ? 'NYQUIST EDGE' : signalInfo.aliased ? 'ALIAS DETECTED' : 'NO ALIAS'}</span>
        <div className="sampling-conclusion-flow">
          <div><small>模拟输入 fin</small><strong>{formatFrequency(signalFrequencyHz)}</strong></div>
          <b aria-hidden="true">→</b>
          <div><small>ADC 以 fs 采样</small><strong>{formatFrequency(sampleRateHz)}</strong></div>
          <b aria-hidden="true">→</b>
          <div className="is-result"><small>数字序列看起来像</small><strong>{formatFrequency(signalInfo.aliasFrequency)}</strong></div>
        </div>
        <p>{signalInfo.atNyquist
          ? `输入正好落在 fN = ${formatFrequency(nyquist)}；频率位于数字边界，但正弦的完整幅值和相位无法唯一表达。`
          : signalInfo.aliased
            ? `ADC 后的任何数字算法都只能看到 ${formatFrequency(signalInfo.aliasFrequency)}，无法知道它原本是 ${formatFrequency(signalFrequencyHz)}。`
            : `输入严格低于 fN = ${formatFrequency(nyquist)}，采样前后对应同一个频率。`}</p>
      </div>

      <ol className="sampling-process-steps">
        <li><span>01</span><div><strong>寻找最近的 fs 整数倍</strong><small>k = round(fin / fs) = {nearestMultipleIndex}</small></div></li>
        <li><span>02</span><div><strong>算出最近频率</strong><small>k·fs = {formatFrequency(nearestMultipleHz)}</small></div></li>
        <li><span>03</span><div><strong>两者距离就是折回频率</strong><small>|fin − k·fs| = {formatFrequency(signalInfo.aliasFrequency)}</small></div></li>
      </ol>

      <div className="alias-process-board">
        <div className="alias-process-row">
          <header><span>程序等价过程：取余后的频率 r</span><strong>一个采样周期：0 ～ fs</strong></header>
          <div className="alias-process-track is-sample-period">
            <span className="alias-track-half" aria-hidden="true" />
            <FrequencyMarker
              position={remainderPercent}
              tone="orange"
              eyebrow="r"
              value={formatFrequency(signalInfo.remainder)}
            />
          </div>
          <div className="alias-track-labels"><span>0</span><span>fN = {formatFrequency(nyquist)}</span><span>fs = {formatFrequency(sampleRateHz)}</span></div>
        </div>

        <div className={`alias-reflection-note ${reflected ? 'is-reflected' : ''}`}>
          <span aria-hidden="true">↓</span>
          <strong>{reflected ? '右半区向左镜像' : '已经位于左半区'}</strong>
          <small>{reflected ? `${formatFrequency(sampleRateHz)} − ${formatFrequency(signalInfo.remainder)}` : '无需再次镜像'}</small>
        </div>

        <div className="alias-process-row is-output">
          <header><span>ADC 能表达的频率 f_alias</span><strong>完整幅相频带：0 ≤ f &lt; fN</strong></header>
          <div className="alias-process-track is-nyquist-band">
            <FrequencyMarker
              position={aliasPercent}
              tone="lime"
              eyebrow="f_alias"
              value={formatFrequency(signalInfo.aliasFrequency)}
            />
          </div>
          <div className="alias-track-labels"><span>0</span><span>fN / 2</span><span>fN = {formatFrequency(nyquist)}</span></div>
        </div>
      </div>

      <div className="alias-zone-key" aria-label="前四个 Nyquist 区的方向规律">
        <div><span>第 1 区</span><strong>0 → fN</strong><small>正向</small></div>
        <div><span>第 2 区</span><strong>fN → 0</strong><small>镜像</small></div>
        <div><span>第 3 区</span><strong>0 → fN</strong><small>正向</small></div>
        <div><span>第 4 区</span><strong>fN → 0</strong><small>镜像</small></div>
      </div>

      <div className="alias-example-presets" role="group" aria-label="一键查看混叠示例">
        <header><span>一键例题</span><small>保持 fs 不变，只改 fin</small></header>
        <div>
          {presets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => onSelectPreset(preset.value)}>
              <span>{formatNumber(preset.ratio, 2)}fs</span>
              <strong>{formatFrequency(preset.value)} → {formatFrequency(preset.alias)}</strong>
            </button>
          ))}
        </div>
      </div>

      <p className="aliasing-core-warning"><strong>注意：</strong>这里是 ADC 采样造成的频率等价，不是数字低通的衰减曲线。要阻止折回，必须在 ADC 前限制高于 fN 的模拟频率。</p>
    </div>
  )
}
