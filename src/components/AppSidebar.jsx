import { Github, Waves } from 'lucide-react'
import { formatFrequency } from '../lib/format.js'
import { WORKSPACE_ITEMS } from '../lib/workspaces.js'

export default function AppSidebar({
  activeWorkspace,
  cutoffHz,
  sampleRateHz,
  method,
  version,
  onSelect,
}) {
  function handleKeyDown(event, index) {
    const direction = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1,
    }[event.key]

    let targetIndex
    if (event.key === 'Home') targetIndex = 0
    else if (event.key === 'End') targetIndex = WORKSPACE_ITEMS.length - 1
    else if (direction) targetIndex = (index + direction + WORKSPACE_ITEMS.length) % WORKSPACE_ITEMS.length
    else return

    event.preventDefault()
    const target = WORKSPACE_ITEMS[targetIndex]
    onSelect(target.id)
    window.requestAnimationFrame(() => document.getElementById(`workspace-tab-${target.id}`)?.focus())
  }

  return (
    <aside className="app-sidebar">
      <button className="sidebar-brand" type="button" onClick={() => onSelect('concept')} aria-label="打开直觉工作区">
        <span className="brand-mark"><Waves size={21} /></span>
        <span><strong>LPF·LAB</strong><small>一阶低通实验室</small></span>
      </button>

      <div className="sidebar-section-label"><span>WORKSPACES</span><i /></div>
      <nav className="sidebar-nav" role="tablist" aria-label="教学工作区" aria-orientation="vertical">
        {WORKSPACE_ITEMS.map((item, index) => (
          <button
            id={`workspace-tab-${item.id}`}
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeWorkspace === item.id}
            aria-controls={`workspace-panel-${item.id}`}
            tabIndex={activeWorkspace === item.id ? 0 : -1}
            className={activeWorkspace === item.id ? 'is-active' : ''}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{item.index}</span>
            <strong>{item.label}</strong>
            <small>{item.eyebrow}</small>
            <em>{item.description}</em>
          </button>
        ))}
      </nav>

      <div className="sidebar-live-state" aria-label="当前全局参数">
        <span>GLOBAL STATE</span>
        <dl>
          <div><dt>fc</dt><dd>{formatFrequency(cutoffHz)}</dd></div>
          <div><dt>fs</dt><dd>{formatFrequency(sampleRateHz)}</dd></div>
          <div><dt>映射</dt><dd>{method === 'zoh' ? 'ZOH' : 'BE'}</dd></div>
        </dl>
      </div>

      <div className="sidebar-footer">
        <span>PURE FRONTEND · v{version}</span>
        <a href="https://github.com/loogg/tool-low-pass-filter-lab" target="_blank" rel="noreferrer" aria-label="查看 GitHub 仓库">
          <Github size={15} />SOURCE
        </a>
      </div>
    </aside>
  )
}
