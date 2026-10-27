import { Activity, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import FilterControls from './components/FilterControls.jsx'
import AppHeader from './components/AppHeader.jsx'
import { CUTOFF_FREQUENCY_RANGE, SAMPLE_RATE_RANGE, clamp } from './lib/filterMath.js'
import { WORKSPACE_ITEMS } from './lib/workspaces.js'

const ResponseLab = lazy(() => import('./components/ResponseLab.jsx'))
const SimulatorLab = lazy(() => import('./components/SimulatorLab.jsx'))
const DesignAssistant = lazy(() => import('./components/DesignAssistant.jsx'))
const CodePanel = lazy(() => import('./components/CodePanel.jsx'))
const TheoryLab = lazy(() => import('./components/TheoryLab.jsx'))
const WORKSPACE_IDS = new Set(WORKSPACE_ITEMS.map((item) => item.id))
const APP_VERSION = import.meta.env.APP_VERSION

function initialWorkspace() {
  const hash = window.location.hash.slice(1)
  return WORKSPACE_IDS.has(hash) ? hash : 'response'
}

function Workspace({ id, active, visited, children }) {
  return <Activity mode={active === id ? 'visible' : 'hidden'}>
    <section id={`workspace-${id}`} hidden={active !== id} aria-label={WORKSPACE_ITEMS.find((item) => item.id === id).label}>
      <Suspense fallback={<div className="loading-state" role="status">正在准备实验工作区…</div>}>{visited ? children : null}</Suspense>
    </section>
  </Activity>
}

export default function App() {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [visited, setVisited] = useState(() => new Set([initialWorkspace()]))
  const [cutoffHz, setCutoffHz] = useState(2.5)
  const [sampleRateHz, setSampleRateHz] = useState(100)
  const [method, setMethod] = useState('zoh')

  const onCutoffChange = useCallback((value) => {
    if (Number.isFinite(value)) setCutoffHz(clamp(value, CUTOFF_FREQUENCY_RANGE.minimum, CUTOFF_FREQUENCY_RANGE.maximum))
  }, [])
  const onSampleRateChange = useCallback((value) => {
    if (Number.isFinite(value)) setSampleRateHz(clamp(value, SAMPLE_RATE_RANGE.minimum, SAMPLE_RATE_RANGE.maximum))
  }, [])
  const onPreset = useCallback((preset) => { setCutoffHz(preset.cutoffHz); setSampleRateHz(preset.sampleRateHz) }, [])
  const navigate = useCallback((id) => {
    if (!WORKSPACE_IDS.has(id)) return
    setWorkspace(id)
    setVisited((previous) => previous.has(id) ? previous : new Set([...previous, id]))
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => document.getElementById(`workspace-${id}`)?.querySelector('h1')?.focus({ preventScroll: true }))
  }, [])

  useEffect(() => {
    const sync = () => {
      const id = initialWorkspace()
      setWorkspace(id)
      setVisited((previous) => previous.has(id) ? previous : new Set([...previous, id]))
      if (window.location.hash !== `#${id}`) window.history.replaceState(null, '', `#${id}`)
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    if (!WORKSPACE_IDS.has(window.location.hash.slice(1))) window.history.replaceState(null, '', '#response')
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync) }
  }, [])

  const parameters = { cutoffHz, sampleRateHz, method, onCutoffChange, onSampleRateChange, onMethodChange: setMethod, onPreset }
  return <div className="app-shell">
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus() }}>跳到实验内容</a>
    <AppHeader active={workspace} onNavigate={navigate} version={APP_VERSION} />
    <main id="main" tabIndex="-1">
      <Workspace id="response" active={workspace} visited={visited.has('response')}>
        <div className="page-heading"><h1 tabIndex="-1">响应分析</h1><p>连续一阶原型 / 当前输入数字 EMA</p></div>
        <div className="workbench analysis-workbench"><FilterControls {...parameters} resultTarget="analysis-results" /><ResponseLab cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} /></div>
      </Workspace>
      <Workspace id="simulator" active={workspace} visited={visited.has('simulator')}>
        <div className="page-heading"><h1 tabIndex="-1">信号仿真</h1><p>独立实验配置，可载入分析参数</p></div>
        <SimulatorLab cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />
      </Workspace>
      <Workspace id="designer" active={workspace} visited={visited.has('designer')}>
        <div className="page-heading"><h1 tabIndex="-1">指标选型</h1><p>响应时间、通带保留与阻带抑制的约束求解</p></div>
        <div className="workbench"><FilterControls {...parameters} /><DesignAssistant cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} onApplyCutoff={onCutoffChange} /></div>
      </Workspace>
      <Workspace id="code" active={workspace} visited={visited.has('code')}>
        <div className="page-heading"><h1 tabIndex="-1">代码生成</h1><p>C99 · 固定采样周期 · 显式初始状态</p></div>
        <div className="workbench"><FilterControls {...parameters} /><CodePanel cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} /></div>
      </Workspace>
      <Workspace id="theory" active={workspace} visited={visited.has('theory')}>
        <div className="page-heading"><h1 tabIndex="-1">理论与模型</h1><p>参数关系、计算约定与参考资料</p></div>
        <TheoryLab cutoffHz={cutoffHz} sampleRateHz={sampleRateHz} method={method} />
      </Workspace>
    </main>
    <footer className="app-footer"><span>LPF LAB <i />一阶低通滤波实验室</span><span>本地计算 · 理想一阶模型 <a href="https://github.com/loogg/tool-low-pass-filter-lab" target="_blank" rel="noreferrer">源代码 <ArrowUpRight size={14} /></a></span></footer>
  </div>
}
