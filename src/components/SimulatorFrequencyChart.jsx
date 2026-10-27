import { useMemo, useState } from 'react'
import Plot from './Plot.jsx'
import { Segments } from './LabUI.jsx'
import { baseChartOption, chartAxis, chartSeries, CHART_COLORS } from '../lib/chartTheme.js'
import { discreteGainDbAt, discretePhaseDegreesAt, gainDbAt, phaseDegreesAt } from '../lib/filterMath.js'
import { formatFrequency } from '../lib/format.js'

export default function SimulatorFrequencyChart({ cutoffHz, sampleRateHz, method, aliasHz }) {
  const [view, setView] = useState('magnitude')
  const option = useMemo(() => {
    const nyquist = sampleRateHz / 2
    const minimum = Math.min(cutoffHz / 100, nyquist / 1000)
    const frequencies = Array.from({ length: 301 }, (_, i) => minimum * (nyquist / minimum) ** (i / 300))
    const phase = view === 'phase'
    const digital = frequencies.map((x) => ({ x, y: phase ? discretePhaseDegreesAt(x, cutoffHz, sampleRateHz, method) : discreteGainDbAt(x, cutoffHz, sampleRateHz, method) }))
    const analog = frequencies.map((x) => ({ x, y: phase ? phaseDegreesAt(x, cutoffHz) : gainDbAt(x, cutoffHz) }))
    const markers = [{ xAxis: nyquist, label: { formatter: 'fN', position: 'insideEndTop', rotate: 0, align: 'right' } }]
    if (cutoffHz < nyquist && cutoffHz > minimum) markers.push({ xAxis: cutoffHz, label: { formatter: 'fc' } })
    const measurement = aliasHz > minimum && aliasHz < nyquist ? {
      symbol: 'circle', symbolSize: 7,
      data: [{ coord: [aliasHz, phase ? discretePhaseDegreesAt(aliasHz, cutoffHz, sampleRateHz, method) : discreteGainDbAt(aliasHz, cutoffHz, sampleRateHz, method)] }],
      label: { show: true, formatter: 'f_alias', position: 'left', color: CHART_COLORS.blue, fontSize: 10 },
    } : undefined
    return { ...baseChartOption(),
      xAxis: chartAxis({ type: 'log', min: minimum, max: nyquist, axisLabel: { formatter: formatFrequency, fontSize: 11, hideOverlap: true } }),
      yAxis: chartAxis({ max: 0, min: phase ? -90 : undefined, axisLabel: { formatter: (v) => `${v}${phase ? '°' : ' dB'}`, fontSize: 11 } }),
      series: [chartSeries(phase ? '数字相位' : '数字增益', digital, CHART_COLORS.blue, { markPoint: measurement, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#aebbcf', type: 'dashed' }, label: { color: '#646464', fontSize: 11 }, data: markers } }),
        chartSeries('连续原型参考', analog, CHART_COLORS.gray, { lineStyle: { color: CHART_COLORS.gray, width: 1.5, type: 'dashed' } })],
    }
  }, [aliasHz, cutoffHz, method, sampleRateHz, view])
  return <><Segments label="数字响应类型" value={view} onChange={setView} items={[{ id: 'magnitude', label: '幅频' }, { id: 'phase', label: '相频' }]} />
    <Plot option={option} label={`数字滤波器与连续原型的${view === 'phase' ? '相频' : '幅频'}对比图`} />
    <p className="chart-footnote">只绘制 0 &lt; f ≤ fs/2。数字相位以正频率基带为参考，严格 ZOH 还会额外滞后一个采样周期。</p></>
}
