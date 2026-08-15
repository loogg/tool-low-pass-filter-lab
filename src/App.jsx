import { useCallback, useState } from 'react'
import {
  ArrowDown,
  BookOpenCheck,
  FlaskConical,
  Github,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react'
import CodePanel from './components/CodePanel.jsx'
import ConceptBridge from './components/ConceptBridge.jsx'
import DesignAssistant from './components/DesignAssistant.jsx'
import ParameterDeck from './components/ParameterDeck.jsx'
import ResponseLab from './components/ResponseLab.jsx'
import SimulatorLab from './components/SimulatorLab.jsx'
import {
  alphaForMethod,
  CUTOFF_FREQUENCY_RANGE,
  clamp,
  SAMPLE_RATE_RANGE,
  tauFromCutoff,
} from './lib/filterMath.js'
import { formatFrequency, formatNumber, formatSeconds } from './lib/format.js'

const APP_VERSION = import.meta.env.APP_VERSION ?? '0.1.0'

export default function App() {
  const [cutoffHz, setCutoffHz] = useState(2.5)
  const [sampleRateHz, setSampleRateHz] = useState(100)
  const [method, setMethod] = useState('zoh')

  const handleCutoffChange = useCallback(
    (nextCutoff) => {
      if (!Number.isFinite(nextCutoff)) return
      setCutoffHz(clamp(
        nextCutoff,
        CUTOFF_FREQUENCY_RANGE.minimum,
        CUTOFF_FREQUENCY_RANGE.maximum,
      ))
    },
    [],
  )

  const handleSampleRateChange = useCallback((nextSampleRate) => {
    if (!Number.isFinite(nextSampleRate)) return
    setSampleRateHz(clamp(
      nextSampleRate,
      SAMPLE_RATE_RANGE.minimum,
      SAMPLE_RATE_RANGE.maximum,
    ))
  }, [])

  const handlePreset = useCallback((preset) => {
    setSampleRateHz(preset.sampleRateHz)
    setCutoffHz(preset.cutoffHz)
  }, [])

  const tau = tauFromCutoff(cutoffHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="返回页面顶部">
          <span className="brand-mark"><Waves size={21} /></span>
          <span><strong>LPF·LAB</strong><small>一阶低通交互实验室</small></span>
        </a>
        <nav aria-label="主要导航">
          <a href="#concept">直觉</a>
          <a href="#response">响应</a>
          <a href="#simulator">模拟</a>
          <a href="#designer">选型</a>
          <a href="#code">代码</a>
        </nav>
        <div className="header-meta"><span>纯前端</span><code>v{APP_VERSION}</code></div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-badge"><FlaskConical size={17} />从直觉到 MCU 代码</div>
            <h1>只调一个极点，<br /><em>看懂 τ、fc 与 α。</em></h1>
            <p className="hero-lead">一阶低通没有三套独立参数。它只是把同一个“快慢”分别翻译成时间、频率和代码。</p>
            <div className="hero-actions">
              <a className="hero-primary" href="#concept">从阶跃开始 <ArrowDown size={18} /></a>
              <a className="hero-secondary" href="#simulator">直接看滤波效果</a>
            </div>
            <div className="hero-trust-row">
              <span><BookOpenCheck size={16} />初学者引导</span>
              <span><Sparkles size={16} />实时可视化</span>
              <span><ShieldCheck size={16} />工程公式校验</span>
            </div>
          </div>

          <div className="hero-instrument" aria-label="当前滤波参数概览">
            <div className="instrument-topbar"><span><i />FILTER ONLINE</span><code>ZOH / BE</code></div>
            <div className="instrument-display">
              <svg viewBox="0 0 620 270" role="img" aria-label="输入阶跃与滤波输出示意图">
                <defs>
                  <linearGradient id="scopeGlow" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#0aa39a" stopOpacity="0.25" />
                    <stop offset="1" stopColor="#d7f56d" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                {Array.from({ length: 10 }, (_, index) => <line key={`v-${index}`} x1={20 + index * 65} x2={20 + index * 65} y1="18" y2="250" className="hero-grid-line" />)}
                {Array.from({ length: 5 }, (_, index) => <line key={`h-${index}`} x1="20" x2="600" y1={22 + index * 56} y2={22 + index * 56} className="hero-grid-line" />)}
                <path d="M20 225 L125 225 L125 45 L600 45" className="hero-input-path" />
                <path d="M20 225 L125 225 C170 225 177 118 235 78 C305 30 412 46 600 45" className="hero-output-shadow" />
                <path d="M20 225 L125 225 C170 225 177 118 235 78 C305 30 412 46 600 45" className="hero-output-path" />
                <circle cx="235" cy="78" r="7" className="hero-marker" />
                <text x="247" y="98" className="hero-chart-label">≈ 1τ · 63.2%</text>
              </svg>
              <div className="instrument-readouts">
                <div><span>τ</span><strong>{formatSeconds(tau)}</strong><small>time constant</small></div>
                <div><span>fc</span><strong>{formatFrequency(cutoffHz)}</strong><small>cutoff</small></div>
                <div><span>α</span><strong>{formatNumber(alpha, 5)}</strong><small>sample step</small></div>
              </div>
            </div>
            <div className="instrument-caption"><span>一句话</span><p>α 决定每次走多大一步，τ / fc 决定整条路走多快。</p></div>
          </div>
        </section>

        <ParameterDeck
          cutoffHz={cutoffHz}
          sampleRateHz={sampleRateHz}
          method={method}
          onCutoffChange={handleCutoffChange}
          onSampleRateChange={handleSampleRateChange}
          onMethodChange={setMethod}
          onPreset={handlePreset}
        />

        <ConceptBridge cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />
        <ResponseLab cutoffHz={cutoffHz} />
        <SimulatorLab cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />
        <DesignAssistant sampleRateHz={sampleRateHz} onApplyCutoff={handleCutoffChange} />
        <CodePanel cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />

        <section className="boundary-section">
          <div>
            <p className="eyebrow">最后别忘了</p>
            <h2>一阶低通很实用，但它不是万能橡皮擦</h2>
          </div>
          <div className="boundary-grid">
            <article><span>01</span><h3>不能替代模拟抗混叠</h3><p>超过 fs/2 的模拟分量会按 f_alias = min(r, fs − r) 折回。数字低通只看到折回后的频率，无法恢复它原来来自哪里。</p></article>
            <article><span>02</span><h3>滚降只有 −20 dB/dec</h3><p>有效频带和干扰靠得太近时，应考虑二阶、高阶 IIR 或 FIR。</p></article>
            <article><span>03</span><h3>孤立尖峰仍会拉动输出</h3><p>离群值明显时，可先做限幅、中值滤波或异常值处理。</p></article>
          </div>
        </section>
      </main>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><Waves size={19} /></span><span><strong>LPF·LAB</strong><small>让公式变成可以拖动的直觉</small></span></div>
        <p>一阶低通 = 单极点 IIR = 指数移动平均（EMA）</p>
        <a href="https://github.com/loogg/tool-low-pass-filter-lab" target="_blank" rel="noreferrer">
          <Github size={16} />v{APP_VERSION}
        </a>
      </footer>
    </div>
  )
}
