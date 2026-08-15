import { CircleCheckBig, CircleX, Gauge, MoveRight, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { clamp, solveDesignConstraints } from '../lib/filterMath.js'
import {
  formatFrequency,
  formatNumber,
  formatPercent,
  formatSeconds,
} from '../lib/format.js'
import SectionIntro from './SectionIntro.jsx'

function ConstraintInput({ label, symbol, value, onChange, suffix, min, max, step, hint }) {
  function commit(nextValue) {
    if (!Number.isFinite(nextValue)) return
    onChange(clamp(nextValue, min, max))
  }

  return (
    <label className="constraint-input">
      <span><strong>{label}</strong><code>{symbol}</code></span>
      <div><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => commit(Number(event.target.value))} /><em>{suffix}</em></div>
      <small>{hint}</small>
    </label>
  )
}

const ISSUE_COPY = {
  'settling-faster-than-sample': '目标响应时间不能短于一个采样周期',
  'passband-outside-baseband': '最高有效频率必须严格低于 Nyquist 频率',
  'stopband-outside-baseband': '数字阻带频率必须严格低于 Nyquist 频率；更高频率要在 ADC 前处理',
  'passband-not-below-stopband': '最高有效频率必须低于主要干扰频率',
}

function formatConstraintBound(value) {
  return Number.isFinite(value) && value > 0 ? formatFrequency(value) : '不可满足'
}

export default function DesignAssistant({ sampleRateHz, method, onApplyCutoff }) {
  const [settlingSeconds, setSettlingSeconds] = useState(1)
  const [passFrequencyHz, setPassFrequencyHz] = useState(1)
  const [passPercent, setPassPercent] = useState(90)
  const [stopFrequencyHz, setStopFrequencyHz] = useState(10)
  const [stopPercent, setStopPercent] = useState(30)

  const result = useMemo(
    () =>
      solveDesignConstraints({
        settlingSeconds,
        passFrequencyHz,
        passMagnitude: passPercent / 100,
        stopFrequencyHz,
        stopMagnitude: stopPercent / 100,
        sampleRateHz,
        method,
      }),
    [settlingSeconds, passFrequencyHz, passPercent, stopFrequencyHz, stopPercent, sampleRateHz, method],
  )

  const values = [result.timeLower, result.passLower, result.stopUpper]
    .filter((value) => Number.isFinite(value) && value > 0)
  const scaleMinimum = Math.min(...values) / 1.8
  const scaleMaximum = Math.max(...values) * 1.8
  const logMinimum = Math.log10(scaleMinimum)
  const logSpan = Math.max(0.001, Math.log10(scaleMaximum) - logMinimum)
  const position = (value) => {
    if (!Number.isFinite(value)) return '100%'
    if (value <= 0) return '0%'
    return `${clamp(((Math.log10(value) - logMinimum) / logSpan) * 100, 0, 100)}%`
  }
  const methodLabel = method === 'zoh' ? 'ZOH 精确映射' : '后向欧拉'
  const issueSummary = result.issues.map((issue) => ISSUE_COPY[issue]).filter(Boolean).join('；')

  return (
    <section className="content-section">
      <SectionIntro
        eyebrow="04 · 工程选型"
        title="用最终数字递推求交集，不拿模拟近似代替验证"
        description="响应速度和有效信号给出 fc 下限，干扰抑制给出 fc 上限。全部约束都按当前 α 映射后的真实数字幅频与离散包络求解。"
        aside={<><Gauge size={18} />{methodLabel} · fs {formatFrequency(sampleRateHz)}</>}
      />

      <div className="designer-layout">
        <div className="constraint-panel">
          <div className="constraint-heading">
            <div><span>输入目标</span><h3>告诉我你想保留什么、压掉什么</h3></div>
            <button
              type="button"
              onClick={() => {
                setSettlingSeconds(1)
                setPassFrequencyHz(1)
                setPassPercent(90)
                setStopFrequencyHz(10)
                setStopPercent(30)
              }}
            >
              恢复示例
            </button>
          </div>

          <div className="constraint-input-grid">
            <ConstraintInput label="95% 响应时间" symbol="t95" value={settlingSeconds} onChange={setSettlingSeconds} suffix="s" min={0.01} max={60} step={0.1} hint="希望多快基本跟上" />
            <ConstraintInput label="最高有效频率" symbol="fp" value={passFrequencyHz} onChange={setPassFrequencyHz} suffix="Hz" min={0.01} max={1000} step={0.1} hint="有用信号的频率边界" />
            <ConstraintInput label="有效信号至少保留" symbol="Gp" value={passPercent} onChange={setPassPercent} suffix="%" min={1} max={99.9} step={1} hint="越高越重视保真" />
            <ConstraintInput label="主要干扰频率" symbol="fstop" value={stopFrequencyHz} onChange={setStopFrequencyHz} suffix="Hz" min={0.01} max={5000} step={0.1} hint="希望被压制的频率" />
            <ConstraintInput label="干扰最多剩余" symbol="Gs" value={stopPercent} onChange={setStopPercent} suffix="%" min={0.1} max={99} step={1} hint="越低表示抑制越强" />
          </div>
        </div>

        <article className={`solution-card ${result.feasible ? 'is-feasible' : 'is-infeasible'}`}>
          <div className="solution-status">
            {result.feasible ? <CircleCheckBig size={26} /> : <CircleX size={26} />}
            <div>
              <span>{result.feasible ? '当前数字一阶低通可以满足' : '这些要求没有有效交集'}</span>
              <h3>{result.feasible
                ? `${formatFrequency(result.lower)} ～ ${formatFrequency(result.upper)}`
                : issueSummary || '下限已经高于上限'}</h3>
            </div>
          </div>

          <div className="constraint-results">
            <div><span>数字 t95 下限</span><strong>fc ≥ {formatConstraintBound(result.timeLower)}</strong></div>
            <div><span>数字通带下限</span><strong>fc ≥ {formatConstraintBound(result.passLower)}</strong></div>
            <div><span>数字阻带上限</span><strong>fc ≤ {formatConstraintBound(result.stopUpper)}</strong></div>
            <div><span>数字基带边界</span><strong>fp、fstop &lt; {formatFrequency(result.nyquistFrequency)}</strong></div>
          </div>

          {result.issues.length === 0 ? (
            <div className="range-visual" aria-label="截止频率约束范围图">
              <div className="range-track">
                {result.feasible ? (
                  <span className="feasible-band" style={{ left: position(result.lower), right: `calc(100% - ${position(result.upper)})` }} />
                ) : (
                  <span className="conflict-band" style={{ left: position(result.upper), right: `calc(100% - ${position(result.lower)})` }} />
                )}
                <i className="range-marker time" style={{ left: position(result.timeLower) }}><b>时间</b></i>
                <i className="range-marker pass" style={{ left: position(result.passLower) }}><b>通带</b></i>
                <i className="range-marker stop" style={{ left: position(result.stopUpper) }}><b>阻带</b></i>
              </div>
              <div className="range-labels"><span>{formatFrequency(scaleMinimum)}</span><span>fc 对数刻度</span><span>{formatFrequency(scaleMaximum)}</span></div>
            </div>
          ) : null}

          {result.feasible ? (
            <div className="suggestion-box">
              <Sparkles size={20} />
              <div>
                <span>建议从可行区间的几何中点开始</span>
                <strong>fc = {formatFrequency(result.suggested)}</strong>
                <small>
                  实算：t95 {formatSeconds(result.verification.settlingSeconds)} · 通带 {formatPercent(result.verification.passMagnitude, 2)} · 阻带 {formatPercent(result.verification.stopMagnitude, 2)}
                </small>
              </div>
              <button type="button" onClick={() => onApplyCutoff(result.suggested)}>采用建议值 <MoveRight size={17} /></button>
            </div>
          ) : (
            <div className="suggestion-box warning">
              <CircleX size={20} />
              <div>
                <span>{result.issues.length ? '先修正采样边界或目标频率' : '继续调 τ / fc 也无法同时满足'}</span>
                <strong>{result.issues.length ? issueSummary : '放宽指标，或考虑二阶 / 更高阶滤波器'}</strong>
              </div>
            </div>
          )}
        </article>
      </div>
      <p className="formula-footnote">当前使用 {methodLabel} 的数字传递函数逐项反求边界；下限取 max({formatNumber(result.timeLower, 3)}, {formatNumber(result.passLower, 3)}) Hz。Nyquist 边界必须严格留在有效信号与数字阻带之外，更高频率的能量仍要在 ADC 前抑制。</p>
    </section>
  )
}
