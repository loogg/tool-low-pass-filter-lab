import { ArrowUpRight } from 'lucide-react'
import { WORKSPACE_ITEMS } from '../lib/workspaces.js'

export default function AppHeader({ active, onNavigate, version }) {
  return <header className="app-header">
    <a className="brand" href="#response" onClick={(event) => { event.preventDefault(); onNavigate('response') }} aria-label="一阶低通滤波分析首页">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="30" height="30" />
      <span>一阶低通滤波<small>LPF LAB</small></span>
    </a>
    <nav className="workspace-nav" aria-label="实验工作区">
      {WORKSPACE_ITEMS.map((item) => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? 'page' : undefined}
        onClick={(event) => { event.preventDefault(); onNavigate(item.id) }}>{item.label}</a>)}
    </nav>
    <div className="header-meta"><span>v{version}</span><a href="https://github.com/loogg/tool-low-pass-filter-lab" target="_blank" rel="noreferrer">源代码 <ArrowUpRight size={14} /></a></div>
  </header>
}
