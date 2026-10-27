import { useMemo, useState } from 'react'
import { ArrowRight, Check, CircleCheck, CircleX, RotateCcw } from 'lucide-react'
import { Metrics, Notice, NumberField } from './LabUI.jsx'
import { clamp, solveDesignConstraints } from '../lib/filterMath.js'
import { formatFrequency, formatPercent, formatSeconds } from '../lib/format.js'

const EXAMPLE = { settlingSeconds: 1, passFrequencyHz: 1, passPercent: 90, stopFrequencyHz: 10, stopPercent: 30 }
const ISSUE_COPY = {
  'settling-faster-than-sample': '响应预算至少需要一个采样周期。',
  'passband-outside-baseband': '通带频率必须严格低于 fs/2。',
  'stopband-outside-baseband': '数字阻带频率必须严格低于 fs/2；更高频率要在 ADC 前处理。',
  'passband-not-below-stopband': '通带频率必须低于阻带频率。',
}
const bound = (value) => Number.isFinite(value) && value > 0 ? formatFrequency(value) : '不可满足'

export default function DesignAssistant({ cutoffHz, sampleRateHz, method, onApplyCutoff }) {
  const [goals, setGoals] = useState(EXAMPLE)
  const [appliedKey, setAppliedKey] = useState('')
  const result = useMemo(() => solveDesignConstraints({ ...goals, passMagnitude: goals.passPercent / 100, stopMagnitude: goals.stopPercent / 100, sampleRateHz, method }), [goals, sampleRateHz, method])
  const resultKey = `${sampleRateHz}-${method}-${result.suggested}`
  const applied = appliedKey === resultKey && cutoffHz === result.suggested
  const field = (key, label, min, max, unit, hint) => <NumberField label={label} value={goals[key]} min={min} max={max} unit={unit} hint={hint} onChange={(value) => setGoals((previous) => ({ ...previous, [key]: value }))} />
  const values = [result.timeLower, result.passLower, result.stopUpper].filter((v) => Number.isFinite(v) && v > 0)
  const low = values.length ? Math.min(...values) / 1.8 : 0.001
  const high = values.length ? Math.max(...values) * 1.8 : 1
  const position = (value) => clamp((Math.log(value / low) / Math.log(high / low)) * 100, 0, 100)
  return <div className="result-stack">
    <article className="panel design-goals">
      <header className="panel-title"><h2>目标约束</h2><button type="button" className="text-button" onClick={() => { setGoals(EXAMPLE); setAppliedKey('') }}><RotateCcw size={14} />恢复示例</button></header>
      <div className="goal-grid">
        <div className="goal-group"><span className="goal-number">01</span><h3>响应速度</h3>{field('settlingSeconds', '达到 95% 的更新预算', 1e-9, 1_000_000, 's', '按整数次更新计算 N·Ts')}</div>
        <div className="goal-group"><span className="goal-number">02</span><h3>通带指标</h3>{field('passFrequencyHz', '通带频率', 0.001, 200_000_000, 'Hz')}{field('passPercent', '至少保留幅值', 0.1, 99.99, '%')}</div>
        <div className="goal-group"><span className="goal-number">03</span><h3>阻带指标</h3>{field('stopFrequencyHz', '阻带频率', 0.001, 200_000_000, 'Hz')}{field('stopPercent', '最多剩余幅值', 0.01, 99.99, '%')}</div>
      </div>
    </article>
    <article className={`panel solution-panel ${result.feasible ? 'is-feasible' : ''}`} aria-live="polite">
      <header className="solution-heading">{result.feasible ? <CircleCheck size={24} /> : <CircleX size={24} />}<div><p className="eyebrow">{result.feasible ? '有可行解' : '无可行解'}</p><h2>{result.feasible ? '可行截止参数区间' : '约束无交集'}</h2></div></header>
      {result.feasible ? <div className="solution-range">{formatFrequency(result.lower)}<span>至</span>{formatFrequency(result.upper)}</div> : <p className="solution-explanation">{result.issues.length ? result.issues.map((issue) => ISSUE_COPY[issue]).join(' ') : '响应与保真要求的下限，已经高于干扰抑制允许的上限。放宽目标或提高滤波阶数后再试。'}</p>}
      <div className="constraint-bounds">
        <div><span>响应速度</span><strong>fc ≥ {bound(result.timeLower)}</strong></div>
        <div><span>通带保留</span><strong>fc ≥ {bound(result.passLower)}</strong></div>
        <div><span>阻带抑制</span><strong>fc ≤ {bound(result.stopUpper)}</strong></div>
      </div>
      {result.issues.length === 0 && values.length === 3 ? <div className="constraint-visual" role="img" aria-label={result.feasible ? '三个约束存在截止参数交集' : '截止参数下限和上限冲突'}>
        {[['响应', result.timeLower, false], ['通带', result.passLower, false], ['阻带', result.stopUpper, true]].map(([label, value, upper]) => <div key={label}><span>{label}</span><div className="constraint-track"><i style={upper ? { left: 0, width: `${position(value)}%` } : { left: `${position(value)}%`, right: 0 }} /></div></div>)}
        <p><span>{formatFrequency(low)}</span><span>fc · 对数刻度</span><span>{formatFrequency(high)}</span></p>
      </div> : null}
      {result.feasible ? <div className="suggestion"><div><span>建议截止参数（几何中点）</span><strong>{formatFrequency(result.suggested)}</strong></div><button type="button" className="button button-blue" onClick={() => { onApplyCutoff(result.suggested); setAppliedKey(resultKey) }}>{applied ? '已应用到共享参数' : '采用建议值'}{applied ? <Check size={16} /> : <ArrowRight size={16} />}</button></div> : null}
    </article>
    {result.verification ? <Metrics items={[
      { label: '回代 · 95% 更新预算', value: formatSeconds(result.verification.settlingSeconds), detail: `目标 ≤ ${formatSeconds(goals.settlingSeconds)}` },
      { label: '回代 · 通带幅值', value: formatPercent(result.verification.passMagnitude, 2), detail: `目标 ≥ ${goals.passPercent}%` },
      { label: '回代 · 阻带幅值', value: formatPercent(result.verification.stopMagnitude, 2), detail: `目标 ≤ ${goals.stopPercent}%` },
    ]} /> : null}
    <Notice>按当前{method === 'zoh' ? '极点匹配' : '后向欧拉'}的 H(z) 求解，fs = {formatFrequency(sampleRateHz)}。这里的 fc 是系数映射参数；实际数字截止由传递函数另行计算。更新预算从初始状态 y[−1] 计 N·Ts。</Notice>
  </div>
}
