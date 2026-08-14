import { CircleCheckBig, CircleX, Gauge, MoveRight, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { solveDesignConstraints } from '../lib/filterMath.js'
import { formatFrequency, formatNumber } from '../lib/format.js'
import SectionIntro from './SectionIntro.jsx'

function ConstraintInput({ label, symbol, value, onChange, suffix, min, max, step, hint }) {
  return (
    <label className="constraint-input">
      <span><strong>{label}</strong><code>{symbol}</code></span>
      <div><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /><em>{suffix}</em></div>
      <small>{hint}</small>
    </label>
  )
}

export default function DesignAssistant({ sampleRateHz, onApplyCutoff }) {
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
      }),
    [settlingSeconds, passFrequencyHz, passPercent, stopFrequencyHz, stopPercent, sampleRateHz],
  )

  const values = [result.timeLower, result.passLower, result.stopUpper, result.samplingUpper].filter((value) => value > 0)
  const scaleMinimum = Math.min(...values) / 1.8
  const scaleMaximum = Math.max(...values) * 1.8
  const logMinimum = Math.log10(scaleMinimum)
  const logSpan = Math.max(0.001, Math.log10(scaleMaximum) - logMinimum)
  const position = (value) => `${((Math.log10(value) - logMinimum) / logSpan) * 100}%`

  return (
    <section id="designer" className="content-section">
      <SectionIntro
        eyebrow="04 · 工程选型"
        title="别凭感觉拧旋钮，让三类约束自己求交集"
        description="响应速度和有效信号会给出 fc 下限，干扰抑制会给出 fc 上限。上下限有交集，一阶滤波才真正可行。"
        aside={<><Gauge size={18} />当前 fs = {formatFrequency(sampleRateHz)}</>}
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
              <span>{result.feasible ? '一阶低通可以满足' : '这些要求没有交集'}</span>
              <h3>{result.feasible ? `${formatFrequency(result.lower)} ～ ${formatFrequency(result.upper)}` : '下限已经高于上限'}</h3>
            </div>
          </div>

          <div className="constraint-results">
            <div><span>响应速度下限</span><strong>fc ≥ {formatFrequency(result.timeLower)}</strong></div>
            <div><span>有效信号下限</span><strong>fc ≥ {formatFrequency(result.passLower)}</strong></div>
            <div><span>干扰抑制上限</span><strong>fc ≤ {formatFrequency(result.stopUpper)}</strong></div>
            <div><span>采样安全上限</span><strong>fc ≤ {formatFrequency(result.samplingUpper)}</strong></div>
          </div>

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

          {result.feasible ? (
            <div className="suggestion-box">
              <Sparkles size={20} />
              <div><span>建议从几何中点开始</span><strong>fc = {formatFrequency(result.suggested)}</strong></div>
              <button type="button" onClick={() => onApplyCutoff(result.suggested)}>采用建议值 <MoveRight size={17} /></button>
            </div>
          ) : (
            <div className="suggestion-box warning">
              <CircleX size={20} />
              <div><span>继续调 τ / fc 也无法同时满足</span><strong>放宽指标，或考虑二阶 / 更高阶滤波器</strong></div>
            </div>
          )}
        </article>
      </div>
      <p className="formula-footnote">计算采用严格 95% 响应式，而不是把 3τ 当成完全精确值；当前下限取 max({formatNumber(result.timeLower, 3)}, {formatNumber(result.passLower, 3)}) Hz。</p>
    </section>
  )
}
