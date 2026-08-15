import { useMemo } from 'react'
import EChartCanvas from './EChartCanvas.jsx'
import { formatFrequency, formatNumber } from '../lib/format.js'

const GAIN_COLOR = '#d7f56d'
const PHASE_COLOR = '#19c8c1'
const CUTOFF_COLOR = '#ff9b52'

function toPairs(points) {
  return points.map((point) => [point.x, point.y])
}

function tooltipFormatter(params) {
  const values = Array.isArray(params) ? params : [params]
  const frequency = values[0]?.axisValue ?? 0
  const rows = values.map((item) => {
    const value = Array.isArray(item.value) ? item.value[1] : item.value
    const suffix = item.seriesId === 'gain-response' ? ' dB' : '°'
    return `
      <div class="echart-tooltip-row">
        <i style="background:${item.color}"></i>
        <span>${item.seriesName}</span>
        <strong>${formatNumber(value, 4)}${suffix}</strong>
      </div>
    `
  }).join('')
  return `<div class="echart-tooltip"><header>f = ${formatFrequency(Number(frequency))}</header>${rows}</div>`
}

export default function SimulatorFrequencyChart({
  response,
  cutoffHz,
  measurementFrequencyHz,
  measurementLabel,
  gainDb,
  phase,
}) {
  const option = useMemo(() => {
    const gainData = toPairs(response.gain)
    const phaseData = toPairs(response.phase)
    const references = []
    if (cutoffHz >= response.domain[0] && cutoffHz <= response.domain[1]) {
      references.push({
        name: 'fc',
        xAxis: cutoffHz,
        lineStyle: { color: CUTOFF_COLOR, width: 1.4, type: 'dashed' },
        label: { color: CUTOFF_COLOR, formatter: 'fc', position: 'insideEndTop' },
      })
    }
    if (measurementFrequencyHz > 0 && Math.abs(measurementFrequencyHz - cutoffHz) / cutoffHz > 0.015) {
      references.push({
        name: 'measurement',
        xAxis: measurementFrequencyHz,
        lineStyle: { color: GAIN_COLOR, width: 1.3, type: 'dashed' },
        label: {
          color: GAIN_COLOR,
          formatter: measurementLabel.replace('@ ', ''),
          position: 'insideEndBottom',
        },
      })
    }

    return {
      backgroundColor: 'transparent',
      animationDuration: 300,
      animationDurationUpdate: 180,
      aria: {
        show: true,
        description: '当前数字一阶低通滤波器的幅值分贝与相位双轴频率响应图。',
      },
      color: [GAIN_COLOR, PHASE_COLOR],
      legend: {
        type: 'scroll',
        top: 12,
        left: 15,
        itemWidth: 20,
        itemHeight: 8,
        itemGap: 20,
        selectedMode: true,
        textStyle: { color: '#91aaa3', fontSize: 11 },
        inactiveColor: '#3f5d57',
        pageIconColor: GAIN_COLOR,
        pageIconInactiveColor: '#3f5d57',
        pageTextStyle: { color: '#7f9c94', fontSize: 9 },
      },
      toolbox: {
        show: true,
        top: 6,
        right: 10,
        itemSize: 15,
        iconStyle: { borderColor: '#789a91' },
        emphasis: { iconStyle: { borderColor: GAIN_COLOR } },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: '框选频段', back: '返回缩放' } },
          restore: { title: '恢复视图' },
          saveAsImage: { name: 'LPF-幅相响应', backgroundColor: '#052526', title: '导出图片' },
        },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        appendToBody: false,
        axisPointer: {
          type: 'cross',
          snap: false,
          lineStyle: { color: 'rgba(215,245,109,0.48)', width: 1 },
          crossStyle: { color: 'rgba(215,245,109,0.42)', width: 1 },
          label: { color: '#082829', backgroundColor: GAIN_COLOR, fontSize: 10 },
        },
        padding: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
        formatter: tooltipFormatter,
      },
      grid: {
        top: 64,
        right: 70,
        bottom: 66,
        left: 68,
      },
      xAxis: {
        type: 'log',
        logBase: 10,
        min: response.domain[0],
        max: response.domain[1],
        axisLine: { lineStyle: { color: '#42645d' } },
        axisTick: { show: false },
        minorTick: { show: true, splitNumber: 4, lineStyle: { color: '#385951' } },
        axisLabel: {
          color: '#6f8e86',
          fontSize: 10,
          hideOverlap: true,
          formatter: (value) => formatFrequency(value),
        },
        splitLine: { show: true, lineStyle: { color: 'rgba(170,206,196,0.13)', type: 'dashed' } },
        minorSplitLine: { show: true, lineStyle: { color: 'rgba(170,206,196,0.045)' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'MAGNITUDE / dB',
          nameTextStyle: { color: GAIN_COLOR, fontSize: 9, padding: [0, 0, 4, 0] },
          min: response.gainDomain[0],
          max: response.gainDomain[1],
          position: 'left',
          axisLine: { show: true, lineStyle: { color: 'rgba(215,245,109,0.38)' } },
          axisTick: { show: false },
          axisLabel: { color: GAIN_COLOR, fontSize: 10, formatter: (value) => `${formatNumber(value, 0)} dB` },
          splitLine: { show: true, lineStyle: { color: 'rgba(170,206,196,0.12)', type: 'dashed' } },
          splitArea: {
            show: true,
            areaStyle: { color: ['rgba(255,255,255,0.010)', 'rgba(10,163,154,0.014)'] },
          },
        },
        {
          type: 'value',
          name: 'PHASE / °',
          nameTextStyle: { color: PHASE_COLOR, fontSize: 9, padding: [0, 0, 4, 0] },
          min: -92,
          max: 2,
          position: 'right',
          axisLine: { show: true, lineStyle: { color: 'rgba(25,200,193,0.42)' } },
          axisTick: { show: false },
          axisLabel: { color: PHASE_COLOR, fontSize: 10, formatter: (value) => `${formatNumber(value, 0)}°` },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 18,
          bottom: 15,
          borderColor: 'rgba(215,245,109,0.12)',
          backgroundColor: 'rgba(0,0,0,0.16)',
          fillerColor: 'rgba(10,163,154,0.18)',
          dataBackground: {
            lineStyle: { color: '#547971' },
            areaStyle: { color: 'rgba(84,121,113,0.15)' },
          },
          selectedDataBackground: {
            lineStyle: { color: GAIN_COLOR },
            areaStyle: { color: 'rgba(215,245,109,0.10)' },
          },
          handleStyle: { color: '#0d4b49', borderColor: GAIN_COLOR },
          moveHandleStyle: { color: '#789a91' },
          textStyle: { color: '#7f9c94', fontSize: 9 },
        },
      ],
      series: [
        {
          id: 'gain-response',
          name: '幅值 / dB',
          type: 'line',
          yAxisIndex: 0,
          data: gainData,
          showSymbol: false,
          smooth: 0.18,
          sampling: 'lttb',
          lineStyle: { color: GAIN_COLOR, width: 3 },
          itemStyle: { color: GAIN_COLOR },
          areaStyle: { color: 'rgba(215,245,109,0.045)' },
          emphasis: { focus: 'series', lineStyle: { width: 4 } },
          markLine: {
            silent: true,
            symbol: 'none',
            data: references,
          },
          markPoint: measurementFrequencyHz > 0 ? {
            symbol: 'circle',
            symbolSize: 10,
            itemStyle: { color: GAIN_COLOR, borderColor: '#052728', borderWidth: 2 },
            label: { show: false },
            data: [{ coord: [measurementFrequencyHz, gainDb], name: '当前幅值' }],
          } : undefined,
          z: 4,
        },
        {
          id: 'phase-response',
          name: '相位 / °',
          type: 'line',
          yAxisIndex: 1,
          data: phaseData,
          showSymbol: false,
          smooth: 0.18,
          sampling: 'lttb',
          lineStyle: { color: PHASE_COLOR, width: 2.5 },
          itemStyle: { color: PHASE_COLOR },
          emphasis: { focus: 'series', lineStyle: { width: 3.5 } },
          markPoint: measurementFrequencyHz > 0 ? {
            symbol: 'circle',
            symbolSize: 9,
            itemStyle: { color: PHASE_COLOR, borderColor: '#052728', borderWidth: 2 },
            label: { show: false },
            data: [{ coord: [measurementFrequencyHz, phase], name: '当前相位' }],
          } : undefined,
          z: 5,
        },
      ],
    }
  }, [cutoffHz, gainDb, measurementFrequencyHz, measurementLabel, phase, response])

  return (
    <div className="echart-analysis-frame frequency-analysis-chart">
      <EChartCanvas
        option={option}
        ariaLabel="数字低通滤波器幅值分贝与相位的双轴交互频率响应图"
      />
    </div>
  )
}
