import { RotateCcw } from 'lucide-react'
import EngineeringFrequencyInput from './EngineeringFrequencyInput.jsx'
import EngineeringTimeInput from './EngineeringTimeInput.jsx'
import { Metrics, Segments } from './LabUI.jsx'
import { alphaForMethod, CUTOFF_FREQUENCY_RANGE, SAMPLE_RATE_RANGE, cutoffFromTau, digitalCutoffFrequency, tauFromCutoff } from '../lib/filterMath.js'
import { formatFrequency, formatNumber, formatSeconds } from '../lib/format.js'
import { METHODS } from '../lib/workspaces.js'

const PRESETS = [
  { id: 'sensor', label: '通用采集', cutoffHz: 2.5, sampleRateHz: 100 },
  { id: 'slow', label: '低速传感', cutoffHz: 0.5, sampleRateHz: 50 },
  { id: 'audio', label: '音频包络', cutoffHz: 2_000, sampleRateHz: 48_000 },
  { id: 'fast', label: '高速采样', cutoffHz: 1_000_000, sampleRateHz: 20_000_000 },
]

export function FrequencyField({ label, symbol, value, range, onChange, hint }) {
  return <div className="frequency-field">
    <div className="field-label"><span>{label} {symbol ? <b>{symbol}</b> : null}</span>
      <EngineeringFrequencyInput valueHz={value} minimumHz={range.minimum} maximumHz={range.maximum} ariaLabel={label} onChange={onChange} />
    </div>
    <input type="range" min={Math.log10(range.minimum)} max={Math.log10(range.maximum)} step="0.001"
      value={Math.log10(value)} aria-label={`调整${label}`} onChange={(event) => onChange(10 ** Number(event.target.value))} />
    <div className="range-scale"><span>{formatFrequency(range.minimum)}</span><span>{formatFrequency(range.maximum)}</span></div>
    {hint ? <small>{hint}</small> : null}
  </div>
}

export default function FilterControls({ cutoffHz, sampleRateHz, method, onCutoffChange, onSampleRateChange, onMethodChange, onPreset, analog = false, inline = false, resultTarget }) {
  const digitalCutoff = digitalCutoffFrequency(cutoffHz, sampleRateHz, method)
  return <aside className={`filter-controls panel ${inline ? 'is-inline' : ''}`} aria-label={analog ? '连续原型参数' : '共享滤波参数'}>
    <header className="panel-title"><h2>{analog ? '连续原型参数' : '滤波器参数'}</h2>
      <button type="button" className="icon-button" aria-label="重置滤波参数" title="恢复通用采集参数" onClick={() => { if (analog) onCutoffChange(2.5); else { onPreset(PRESETS[0]); onMethodChange('zoh') } }}><RotateCcw size={16} /></button>
    </header>
    {resultTarget ? <a className="mobile-jump" href={`#${resultTarget}`} onClick={(event) => { event.preventDefault(); document.getElementById(resultTarget)?.scrollIntoView({ block: 'start' }) }}>查看响应曲线与读数 ↓</a> : null}
    <div className="filter-control-fields">
      <FrequencyField label="截止参数" symbol="fc" value={cutoffHz} range={CUTOFF_FREQUENCY_RANGE} onChange={onCutoffChange} hint="fc 对应连续原型的截止频率" />
      <div className="frequency-field tau-field"><div className="field-label"><span>时间常数 <b>τ</b></span>
        <EngineeringTimeInput valueSeconds={tauFromCutoff(cutoffHz)} minimumSeconds={tauFromCutoff(CUTOFF_FREQUENCY_RANGE.maximum)} maximumSeconds={tauFromCutoff(CUTOFF_FREQUENCY_RANGE.minimum)} ariaLabel="时间常数" onChange={(value) => onCutoffChange(cutoffFromTau(value))} />
      </div><small>与 fc 联动：τ = 1 / (2πfc)</small></div>
      {analog ? null : <>
        <FrequencyField label="采样频率" symbol="fs" value={sampleRateHz} range={SAMPLE_RATE_RANGE} onChange={onSampleRateChange} />
        <div className="method-field"><span className="field-title">系数计算方法</span><Segments label="系数计算方法" value={method} onChange={onMethodChange} items={METHODS} />
          <code>{method === 'zoh' ? 'α = 1 − exp(−2πfc / fs)' : 'α = 2πfc / (fs + 2πfc)'}</code></div>
      </>}
    </div>
    <div className="control-presets"><span className="field-title">参数示例</span><div>{PRESETS.map((preset) => <button key={preset.id} type="button"
      className={cutoffHz === preset.cutoffHz && (analog || sampleRateHz === preset.sampleRateHz) ? 'is-selected' : ''}
      onClick={() => analog ? onCutoffChange(preset.cutoffHz) : onPreset(preset)}>{preset.label}</button>)}</div></div>
    {inline ? null : <Metrics compact items={analog ? [
      { label: '时间常数 τ', value: formatSeconds(tauFromCutoff(cutoffHz)), detail: '1 / (2πfc)' },
    ] : [
      { label: '数字系数 α', value: formatNumber(alphaForMethod(cutoffHz, sampleRateHz, method), 8) },
      { label: '实际数字截止', value: digitalCutoff === null ? '基带内未达 −3 dB' : formatFrequency(digitalCutoff), detail: '半功率点 −3.0103 dB' },
      { label: 'Nyquist 边界', value: formatFrequency(sampleRateHz / 2), detail: 'fs / 2' },
    ]} />}
  </aside>
}
