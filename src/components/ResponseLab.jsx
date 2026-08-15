import { Activity, CircleHelp, Gauge, MoveDownRight, Timer } from 'lucide-react'
import {
  createFrequencyResponse,
  createStepResponse,
  gainDbAt,
  magnitudeAt,
  phaseDegreesAt,
  settlingTime,
  tauFromCutoff,
} from '../lib/filterMath.js'
import { formatNumber, formatPercent, formatSeconds } from '../lib/format.js'
import LineChart from './LineChart.jsx'
import SectionIntro from './SectionIntro.jsx'

function formatTauPosition(value, tau) {
  if (value <= tau * 0.001) return '0'
  const ratio = value / tau
  const roundedRatio = Math.round(ratio)
  return `${Math.abs(ratio - roundedRatio) < 0.001 ? roundedRatio : formatNumber(ratio, 2)}τ`
}

export default function ResponseLab({ cutoffHz }) {
  const tau = tauFromCutoff(cutoffHz)
  const time95 = settlingTime(tau, 0.95)
  const time99 = settlingTime(tau, 0.99)
  const stepData = createStepResponse(cutoffHz)
  const frequencyData = createFrequencyResponse(cutoffHz)
  const gainSeries = [{
    label: '增益',
    color: '#0aa39a',
    data: frequencyData.map((point) => ({ x: point.x, y: point.gainDb })),
  }]
  const phaseSeries = [{
    label: '相位',
    color: '#f29a4a',
    data: frequencyData.map((point) => ({ x: point.x, y: point.phase })),
  }]

  const frequencyTicks = [cutoffHz / 100, cutoffHz / 10, cutoffHz, cutoffHz * 10, cutoffHz * 100]
  const magnitudeAnnotations = [
    {
      x: cutoffHz,
      y: gainDbAt(cutoffHz, cutoffHz),
      label: '≈ 0.707×',
      detail: '−3 dB',
      color: '#f29a4a',
      placement: 'below',
    },
    {
      x: cutoffHz * 10,
      y: gainDbAt(cutoffHz * 10, cutoffHz),
      label: '≈ 1/10',
      detail: '−20 dB',
      color: '#0a7772',
      align: 'left',
    },
    {
      x: cutoffHz * 100,
      y: gainDbAt(cutoffHz * 100, cutoffHz),
      label: '≈ 1/100',
      detail: '−40 dB',
      color: '#0a7772',
      align: 'left',
    },
  ]

  return (
    <section className="content-section">
      <SectionIntro
        eyebrow="02 · 看见响应"
        title="一边看它追阶跃，一边看它削频率"
        description="时域和频域不是两套滤波器，而是同一套系统的两个观察窗口。调整左侧的 fc，右侧三张图会一起变化。"
        aside={<><CircleHelp size={18} />先找橙色参考线</>}
      />

      <div className="response-summary-grid">
        <article className="summary-card">
          <Timer size={20} />
          <span>达到 95%</span>
          <strong>{formatSeconds(time95)}</strong>
          <small>严格值约 2.996τ，工程上常记 3τ</small>
        </article>
        <article className="summary-card">
          <Activity size={20} />
          <span>达到 99%</span>
          <strong>{formatSeconds(time99)}</strong>
          <small>严格值约 4.605τ，工程上常记 5τ</small>
        </article>
        <article className="summary-card">
          <Gauge size={20} />
          <span>fc 处幅值</span>
          <strong>{formatPercent(magnitudeAt(cutoffHz, cutoffHz), 1)}</strong>
          <small>也就是 −3.01 dB</small>
        </article>
        <article className="summary-card">
          <MoveDownRight size={20} />
          <span>fc 处相位</span>
          <strong>{formatNumber(phaseDegreesAt(cutoffHz, cutoffHz), 0)}°</strong>
          <small>输出相对输入向后错开</small>
        </article>
      </div>

      <article className="chart-card chart-card-featured">
        <div className="chart-card-heading">
          <div><span className="chart-index">A</span><div><h3>阶跃响应</h3><p>输入突然从 0 跳到 1，输出会按指数曲线追上去。</p></div></div>
          <code>y(t) = 1 − e<sup>−t/τ</sup></code>
        </div>
        <LineChart
          series={[{ label: '输出 y(t)', color: '#0aa39a', data: stepData }]}
          xDomain={[0, tau * 5]}
          yDomain={[0, 1.05]}
          xTicks={[0, tau, tau * 2, tau * 3, tau * 4, tau * 5]}
          yTicks={[0, 0.25, 0.5, 0.632, 0.75, 1]}
          formatX={(value) => formatTauPosition(value, tau)}
          formatY={(value) => formatPercent(value, 0)}
          referenceLines={[
            { axis: 'x', value: tau, label: '63.2%', color: '#f29a4a' },
            { axis: 'x', value: tau * 3, label: '≈ 95%', color: '#d7f56d' },
          ]}
          ariaLabel="一阶低通滤波器的单位阶跃响应曲线"
        />
        <div className="chart-takeaway">
          <span>读图结论</span>
          <p>横轴每一格都是 <strong>1τ</strong>（当前为 {formatSeconds(tau)}）；到 <strong>3τ ≈ {formatSeconds(time95)}</strong> 时，输出已经“基本跟上”。</p>
        </div>
      </article>

      <div className="chart-pair">
        <article className="chart-card magnitude-card">
          <div className="chart-card-heading compact">
            <div><span className="chart-index">B</span><div><h3>幅频响应</h3><p>每种频率最后还剩多少幅值。</p></div></div>
            <aside className="db-formula-panel" aria-label="分贝与幅值倍数换算公式">
              <span>幅值比 ↔ dB</span>
              <code>G<sub>dB</sub> = 20 log<sub>10</sub>|H|</code>
              <code>|H| = 10<sup>G<sub>dB</sub>/20</sup></code>
              <small>功率比使用 10 log<sub>10</sub>(P<sub>out</sub>/P<sub>in</sub>)</small>
            </aside>
          </div>
          <LineChart
            series={gainSeries}
            xDomain={[cutoffHz / 100, cutoffHz * 100]}
            yDomain={[-42, 1]}
            xTicks={frequencyTicks}
            yTicks={[-40, -30, -20, -10, -3.01, 0]}
            xScale="log"
            formatX={(value) => `${formatNumber(value / cutoffHz, 2)}×fc`}
            formatY={(value) => `${formatNumber(value, 1)} dB`}
            referenceLines={[{ axis: 'x', value: cutoffHz, label: 'fc', color: '#f29a4a' }]}
            pointAnnotations={magnitudeAnnotations}
            ariaLabel="一阶低通滤波器的幅频响应曲线"
          />
          <div className="db-conversion-strip" aria-label="常见分贝与倍数换算">
            <div>
              <code>−3 dB</code>
              <strong>幅值 ≈ 0.707</strong>
              <small>功率 ≈ 1/2</small>
            </div>
            <div>
              <code>−20 dB</code>
              <strong>幅值 ≈ 1/10</strong>
              <small>功率 ≈ 1/100</small>
            </div>
            <div>
              <code>−40 dB</code>
              <strong>幅值 ≈ 1/100</strong>
              <small>功率 ≈ 1/10,000</small>
            </div>
          </div>
          <p className="under-chart-note"><strong>过了 fc 以后：</strong>频率每提高 10 倍，幅值约下降 20 dB，也就是变为前一档的约 <strong>1/10</strong>；对应功率约变为 <strong>1/100</strong>。</p>
        </article>

        <article className="chart-card">
          <div className="chart-card-heading compact">
            <div><span className="chart-index">C</span><div><h3>相频响应</h3><p>输出相对输入晚了多少角度。</p></div></div>
            <code>φ = −atan(f/fc)</code>
          </div>
          <LineChart
            series={phaseSeries}
            xDomain={[cutoffHz / 100, cutoffHz * 100]}
            yDomain={[-92, 2]}
            xTicks={frequencyTicks}
            yTicks={[-90, -75, -60, -45, -30, -15, 0]}
            xScale="log"
            formatX={(value) => `${formatNumber(value / cutoffHz, 2)}×fc`}
            formatY={(value) => `${formatNumber(value, 0)}°`}
            referenceLines={[{ axis: 'x', value: cutoffHz, label: 'fc', color: '#f29a4a' }]}
            ariaLabel="一阶低通滤波器的相频响应曲线"
          />
          <p className="under-chart-note"><strong>别把它当固定延时：</strong>不同频率的相位滞后不同，只有单一正弦才能换算等效时间。</p>
        </article>
      </div>
    </section>
  )
}
