import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  BookOpenCheck,
  FlaskConical,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import AppSidebar from './components/AppSidebar.jsx'
import CodePanel from './components/CodePanel.jsx'
import ConceptBridge from './components/ConceptBridge.jsx'
import DesignAssistant from './components/DesignAssistant.jsx'
import GlobalParameterRail from './components/GlobalParameterRail.jsx'
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
import { WORKSPACE_ITEMS } from './lib/workspaces.js'

const APP_VERSION = import.meta.env.APP_VERSION ?? '0.1.0'
const WORKSPACE_IDS = new Set(WORKSPACE_ITEMS.map((item) => item.id))

function initialWorkspace() {
  if (typeof window === 'undefined') return 'concept'
  const hash = window.location.hash.slice(1)
  return WORKSPACE_IDS.has(hash) ? hash : 'concept'
}

function WorkspacePanel({ id, activeWorkspace, children, className = '' }) {
  return (
    <div
      id={`workspace-panel-${id}`}
      className={`workspace-page is-${id} ${className}`}
      role="tabpanel"
      aria-labelledby={`workspace-tab-${id}`}
      hidden={activeWorkspace !== id}
    >
      {children}
    </div>
  )
}

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState(initialWorkspace)
  const [cutoffHz, setCutoffHz] = useState(2.5)
  const [sampleRateHz, setSampleRateHz] = useState(100)
  const [method, setMethod] = useState('zoh')

  const handleCutoffChange = useCallback((nextCutoff) => {
    if (!Number.isFinite(nextCutoff)) return
    setCutoffHz(clamp(
      nextCutoff,
      CUTOFF_FREQUENCY_RANGE.minimum,
      CUTOFF_FREQUENCY_RANGE.maximum,
    ))
  }, [])

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

  const selectWorkspace = useCallback((workspaceId) => {
    if (!WORKSPACE_IDS.has(workspaceId)) return
    setActiveWorkspace(workspaceId)
    if (typeof window === 'undefined') return
    const nextHash = `#${workspaceId}`
    if (window.location.hash !== nextHash) window.history.pushState(null, '', nextHash)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }, [])

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    window.scrollTo({ top: 0, left: 0 })

    function syncWorkspaceFromLocation() {
      const hash = window.location.hash.slice(1)
      if (WORKSPACE_IDS.has(hash)) {
        setActiveWorkspace(hash)
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }))
      }
    }

    if (!WORKSPACE_IDS.has(window.location.hash.slice(1))) {
      window.history.replaceState(null, '', '#concept')
    }
    window.addEventListener('popstate', syncWorkspaceFromLocation)
    window.addEventListener('hashchange', syncWorkspaceFromLocation)
    return () => {
      window.history.scrollRestoration = previousScrollRestoration
      window.removeEventListener('popstate', syncWorkspaceFromLocation)
      window.removeEventListener('hashchange', syncWorkspaceFromLocation)
    }
  }, [])

  const tau = tauFromCutoff(cutoffHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const activeWorkspaceMeta = WORKSPACE_ITEMS.find((item) => item.id === activeWorkspace)
  const sharedParameterProps = {
    cutoffHz,
    sampleRateHz,
    method,
    onCutoffChange: handleCutoffChange,
    onSampleRateChange: handleSampleRateChange,
    onMethodChange: setMethod,
    onPreset: handlePreset,
  }

  return (
    <div className="app-shell workspace-shell">
      <AppSidebar
        activeWorkspace={activeWorkspace}
        cutoffHz={cutoffHz}
        sampleRateHz={sampleRateHz}
        method={method}
        version={APP_VERSION}
        onSelect={selectWorkspace}
      />

      <div className="workspace-stage" data-workspace={activeWorkspace}>
        <header className="workspace-toolbar">
          <div>
            <span>{activeWorkspaceMeta.index} / {activeWorkspaceMeta.eyebrow}</span>
            <strong>{activeWorkspaceMeta.label}工作区</strong>
            <small>{activeWorkspaceMeta.description}</small>
          </div>
          <dl aria-label="全局参数快照">
            <div><dt>fc</dt><dd>{formatFrequency(cutoffHz)}</dd></div>
            <div><dt>fs</dt><dd>{formatFrequency(sampleRateHz)}</dd></div>
            <div><dt>method</dt><dd>{method === 'zoh' ? 'ZOH 精确' : '后向欧拉'}</dd></div>
          </dl>
        </header>

        <main id="top" className="workspace-main">
          <WorkspacePanel id="concept" activeWorkspace={activeWorkspace}>
            <section className="hero-section">
              <div className="hero-copy">
                <div className="hero-badge"><FlaskConical size={17} />从直觉到 MCU 代码</div>
                <h1>只调一个极点，<br /><em>看懂 τ、fc 与 α。</em></h1>
                <p className="hero-lead">一阶低通没有三套独立参数。它只是把同一个“快慢”分别翻译成时间、频率和代码。</p>
                <div className="hero-actions">
                  <button className="hero-primary" type="button" onClick={() => selectWorkspace('response')}>从阶跃开始 <ArrowDown size={18} /></button>
                  <button className="hero-secondary" type="button" onClick={() => selectWorkspace('simulator')}>直接看滤波效果</button>
                </div>
                <div className="hero-trust-row">
                  <span><BookOpenCheck size={16} />初学者引导</span>
                  <span><Sparkles size={16} />可计算可模拟</span>
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
                <div className="instrument-caption"><span>一句话</span><p>α 决定每次修正差值的比例，τ / fc 决定整体响应快慢。</p></div>
              </div>
            </section>

            <ParameterDeck {...sharedParameterProps} />
            <ConceptBridge cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />

            <section className="boundary-section">
              <div>
                <p className="eyebrow">最后别忘了</p>
                <h2>一阶低通很实用，但它不是万能橡皮擦</h2>
              </div>
              <div className="boundary-grid">
                <article><span>01</span><h3>不能替代模拟抗混叠</h3><p>超过 fs/2 的模拟分量会按 f_alias = min(r, fs − r) 折回。数字低通只看到折回后的频率，无法恢复来源。</p></article>
                <article><span>02</span><h3>滚降只有 −20 dB/dec</h3><p>有效频带和干扰靠得太近时，应考虑二阶、高阶 IIR 或 FIR。</p></article>
                <article><span>03</span><h3>孤立尖峰仍会拉动输出</h3><p>离群值明显时，可先做限幅、中值滤波或异常值处理。</p></article>
              </div>
            </section>
          </WorkspacePanel>

          <WorkspacePanel id="response" activeWorkspace={activeWorkspace} className="workspace-split">
            <GlobalParameterRail
              {...sharedParameterProps}
              title="响应曲线参数"
              description="左侧设置 fc、fs 与离散方法；右侧专注观察时域、幅频和相频。"
            />
            <div className="workspace-result-pane"><ResponseLab cutoffHz={cutoffHz} /></div>
          </WorkspacePanel>

          <WorkspacePanel id="simulator" activeWorkspace={activeWorkspace}>
            <SimulatorLab cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />
          </WorkspacePanel>

          <WorkspacePanel id="designer" activeWorkspace={activeWorkspace}>
            <DesignAssistant sampleRateHz={sampleRateHz} onApplyCutoff={handleCutoffChange} />
          </WorkspacePanel>

          <WorkspacePanel id="code" activeWorkspace={activeWorkspace} className="workspace-split is-code-layout">
            <GlobalParameterRail
              {...sharedParameterProps}
              title="代码生成参数"
              description="调整参数后，右侧系数、实现代码和边界提示同步更新。"
            />
            <div className="workspace-result-pane"><CodePanel cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} /></div>
          </WorkspacePanel>
        </main>
      </div>
    </div>
  )
}
