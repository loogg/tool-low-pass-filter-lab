import { useEffect, useRef, useState } from 'react'
import { Download, RotateCcw, ScanLine, ZoomIn, ZoomOut } from 'lucide-react'
import * as echarts from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  LegendScrollComponent,
  MarkLineComponent,
  MarkPointComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  LegendScrollComponent,
  MarkLineComponent,
  MarkPointComponent,
  ToolboxComponent,
  TooltipComponent,
  CanvasRenderer,
])

function withPreservedLegendSelection(option, selected) {
  if (!option.legend || Array.isArray(option.legend)) return option
  return {
    ...option,
    legend: {
      ...option.legend,
      selected: {
        ...option.legend.selected,
        ...selected,
      },
    },
  }
}

export default function EChartCanvas({ option, className = '', ariaLabel, onCursor }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const legendSelectionRef = useRef({})
  const latestOptionRef = useRef({ option, ariaLabel, onCursor })
  const [exportError, setExportError] = useState('')
  const [selecting, setSelecting] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleLegendSelection = (event) => {
      legendSelectionRef.current = event.selected ?? {}
    }
    const handleRestore = () => { legendSelectionRef.current = {} }
    const handleCursor = (event) => setSelecting(event.key === 'dataZoomSelect' && Boolean(event.dataZoomSelectActive))
    const handlePointer = (event) => {
      const axis = event.axesInfo?.find((item) => item.axisDim === 'x')
      if (axis && Number.isFinite(Number(axis.value))) latestOptionRef.current.onCursor?.(Number(axis.value))
    }
    function initialize() {
      if (chartRef.current || container.clientWidth === 0 || container.clientHeight === 0) return
      const chart = echarts.init(container, null, {
        renderer: 'canvas', devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      chartRef.current = chart
      chart.on('legendselectchanged', handleLegendSelection)
      chart.on('restore', handleRestore)
      chart.on('globalcursortaken', handleCursor)
      chart.on('updateAxisPointer', handlePointer)
      const latest = latestOptionRef.current
      chart.setOption(withPreservedLegendSelection({ ...latest.option, aria: { ...latest.option.aria, enabled: true, description: latest.ariaLabel } }, legendSelectionRef.current))
      chart.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: false })
    }
    initialize()

    let animationFrame = 0
    const resizeChart = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        if (container.clientWidth === 0 || container.clientHeight === 0) return
        initialize()
        chartRef.current?.resize()
      })
    }
    const resizeObserver = new ResizeObserver(resizeChart)
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      const chart = chartRef.current
      chart?.off('legendselectchanged', handleLegendSelection)
      chart?.off('restore', handleRestore)
      chart?.off('globalcursortaken', handleCursor)
      chart?.off('updateAxisPointer', handlePointer)
      chart?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    latestOptionRef.current = { option, ariaLabel, onCursor }
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(
      withPreservedLegendSelection({ ...option, aria: { ...option.aria, enabled: true, description: ariaLabel } }, legendSelectionRef.current),
      { notMerge: true, lazyUpdate: true },
    )
  }, [option, ariaLabel, onCursor])

  function zoom(factor) {
    const chart = chartRef.current
    if (!chart) return
    const current = chart.getOption().dataZoom?.[0] ?? {}
    const center = ((current.start ?? 0) + (current.end ?? 100)) / 2
    const span = Math.min(100, ((current.end ?? 100) - (current.start ?? 0)) * factor)
    const start = Math.min(100 - span, Math.max(0, center - span / 2))
    chart.dispatchAction({ type: 'dataZoom', start, end: start + span })
  }

  function exportImage() {
    setExportError('')
    try {
      const canvas = chartRef.current.renderToCanvas({ pixelRatio: 2, backgroundColor: '#fcfcfc' })
      canvas.toBlob((blob) => {
        if (!blob) { setExportError('图片生成失败，请重试。'); return }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = 'LPF-LAB.png'
        link.href = url
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      }, 'image/png')
    } catch {
      setExportError('图表暂时无法导出，请在加载完成后重试。')
    }
  }

  return <div className="chart-host">
    <div
      ref={containerRef}
      className={`echart-canvas ${className}`}
      role="img"
      aria-label={ariaLabel}
    />
    <div className="chart-toolbar" role="group" aria-label="图表操作">
      <button type="button" aria-label="放大图表" title="放大图表" onClick={() => zoom(0.6)}><ZoomIn size={15} /></button>
      <button type="button" aria-label="缩小图表" title="缩小图表" onClick={() => zoom(1 / 0.6)}><ZoomOut size={15} /></button>
      <button type="button" aria-label="框选缩放图表" aria-pressed={selecting} title="框选缩放图表" onClick={() => chartRef.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: !selecting })}><ScanLine size={15} /></button>
      <button type="button" aria-label="恢复图表视图" title="恢复图表视图" onClick={() => {
        chartRef.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: false })
        chartRef.current?.dispatchAction({ type: 'restore' })
      }}><RotateCcw size={15} /></button>
      <button type="button" aria-label="导出图表图片" title="导出图表图片" onClick={exportImage}><Download size={15} /></button>
    </div>
    {exportError ? <span className="chart-error" role="alert">{exportError}</span> : null}
  </div>
}
