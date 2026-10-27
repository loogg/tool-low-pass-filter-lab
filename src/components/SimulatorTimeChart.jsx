import { useMemo } from 'react'
import Plot from './Plot.jsx'
import { baseChartOption, chartAxis, chartSeries, CHART_COLORS } from '../lib/chartTheme.js'
import { formatSeconds } from '../lib/format.js'

export default function SimulatorTimeChart({ simulation, inputType }) {
  const option = useMemo(() => {
    const sampled = simulation.decimated
    const series = [
      chartSeries('输出 y[n]', simulation.output, CHART_COLORS.blue, sampled ? { type: 'scatter', symbolSize: 3 } : { showSymbol: simulation.sampleCount < 150, symbolSize: 4 }),
      chartSeries(sampled ? '输入抽取点' : '输入 x[n]', simulation.input, CHART_COLORS.ink, {
        type: inputType === 'step' && !sampled ? 'line' : 'scatter', step: inputType === 'step' ? 'end' : undefined,
        showSymbol: true, symbolSize: sampled ? 2.5 : 4, lineStyle: { color: CHART_COLORS.ink, width: 1.3 },
      }),
      ...(simulation.analogInput.length ? [chartSeries('连续参考', simulation.analogInput, CHART_COLORS.gray, { lineStyle: { color: CHART_COLORS.gray, width: 1.3 } })] : []),
    ]
    if (inputType === 'sine' && simulation.signalAliasing.aliased && simulation.aliasReference.length) series.push(chartSeries('折回参考', simulation.aliasReference, '#646464', { lineStyle: { color: '#646464', width: 1.5, type: 'dashed' } }))
    return { ...baseChartOption(),
      grid: { top: 84, bottom: 56, left: 58, right: 24 },
      legend: { ...baseChartOption().legend, type: 'scroll', top: 4, right: 14, itemGap: 12 },
      toolbox: { ...baseChartOption().toolbox, top: 30 },
      xAxis: chartAxis({ min: 0, max: simulation.duration, axisLabel: { formatter: formatSeconds, fontSize: 11, hideOverlap: true } }),
      yAxis: chartAxis({ scale: true }),
      tooltip: { ...baseChartOption().tooltip, axisPointer: { type: 'cross' } }, series,
    }
  }, [inputType, simulation])
  return <Plot option={option} label="采样输入、数字低通输出及连续参考的时域曲线" className="time-plot" />
}
