import { lazy, Suspense } from 'react'
const EChartCanvas = lazy(() => import('./EChartCanvas.jsx'))

export default function Plot({ option, label, className = '', onCursor }) {
  return <div className={`plot ${className}`}><Suspense fallback={<div className="loading-state" role="status">正在加载图表…</div>}>
    <EChartCanvas option={option} ariaLabel={label} onCursor={onCursor} />
  </Suspense></div>
}
