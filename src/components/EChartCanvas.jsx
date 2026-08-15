import { useEffect, useRef } from 'react'
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

export default function EChartCanvas({ option, className = '', ariaLabel }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const legendSelectionRef = useRef({})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const chart = echarts.init(container, null, {
      renderer: 'canvas',
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    })
    chartRef.current = chart

    const handleLegendSelection = (event) => {
      legendSelectionRef.current = event.selected ?? {}
    }
    chart.on('legendselectchanged', handleLegendSelection)

    let animationFrame = 0
    const resizeChart = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => chart.resize())
    }
    const resizeObserver = new ResizeObserver(resizeChart)
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      chart.off('legendselectchanged', handleLegendSelection)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(
      withPreservedLegendSelection(option, legendSelectionRef.current),
      { notMerge: true, lazyUpdate: true },
    )
  }, [option])

  return (
    <div
      ref={containerRef}
      className={`echart-canvas ${className}`}
      role="img"
      aria-label={ariaLabel}
    />
  )
}
