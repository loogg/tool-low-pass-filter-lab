import { useMemo } from 'react'
import EChartCanvas from './EChartCanvas.jsx'
import { formatNumber, formatSeconds } from '../lib/format.js'

const COLORS = {
  analog: '#ff9b52',
  samples: '#19c8c1',
  alias: '#b995ff',
  output: '#d7f56d',
  text: '#91aaa3',
  line: 'rgba(170, 206, 196, 0.13)',
}

function toPairs(points) {
  return points.map((point) => [point.x, point.y])
}

function tooltipFormatter(params) {
  const values = Array.isArray(params) ? params : [params]
  const time = values[0]?.axisValue ?? 0
  const rows = values.map((item) => `
    <div class="echart-tooltip-row">
      <i style="background:${item.color}"></i>
      <span>${item.seriesName}</span>
      <strong>${formatNumber(Array.isArray(item.value) ? item.value[1] : item.value, 5)}</strong>
    </div>
  `).join('')
  return `<div class="echart-tooltip"><header>t = ${formatSeconds(Number(time))}</header>${rows}</div>`
}

function lineSeries({ id, name, color, data, width, type = 'solid', z = 2, step }) {
  return {
    id,
    name,
    type: 'line',
    data,
    showSymbol: false,
    smooth: false,
    sampling: 'lttb',
    step,
    animation: false,
    lineStyle: { color, width, type, opacity: 1 },
    itemStyle: { color },
    emphasis: { focus: 'series', lineStyle: { width: width + 1 } },
    z,
  }
}

export default function SimulatorTimeChart({
  simulation,
  yDomain,
  inputType,
  signalAliasing,
  playing,
  scanKey,
}) {
  const option = useMemo(() => {
    const analogData = toPairs(simulation.analogInput)
    const sampleData = toPairs(simulation.input)
    const outputData = toPairs(simulation.output)
    const aliasData = toPairs(simulation.aliasReference ?? [])
    const isStep = inputType === 'step'
    const series = isStep
      ? [
          {
            ...lineSeries({
              id: 'adc-input',
              name: 'ADC 输入 x[n]',
              color: COLORS.analog,
              data: sampleData,
              width: 2.5,
              step: 'end',
              z: 3,
            }),
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 5,
          },
          lineSeries({
            id: 'digital-output',
            name: '数字输出 y[n]',
            color: COLORS.output,
            data: outputData,
            width: 3.2,
            z: 5,
          }),
        ]
      : [
          {
            ...lineSeries({
              id: 'analog-input',
              name: '采样前模拟信号',
              color: COLORS.analog,
              data: analogData,
              width: 2.8,
              z: 4,
            }),
            areaStyle: { color: 'rgba(255, 155, 82, 0.045)' },
          },
          {
            id: 'adc-samples',
            name: 'ADC 样本 x[n]',
            type: 'scatter',
            data: sampleData,
            symbol: 'circle',
            symbolSize: 6,
            animation: false,
            itemStyle: {
              color: COLORS.samples,
              borderColor: '#052728',
              borderWidth: 1.2,
              shadowBlur: 7,
              shadowColor: 'rgba(25, 200, 193, 0.45)',
            },
            emphasis: { focus: 'series', scale: 1.7 },
            z: 7,
          },
          lineSeries({
            id: 'alias-reference',
            name: '折回等效参考',
            color: COLORS.alias,
            data: aliasData,
            width: 2.2,
            type: 'dashed',
            z: 3,
          }),
          lineSeries({
            id: 'digital-output',
            name: '数字输出 y[n]',
            color: COLORS.output,
            data: outputData,
            width: 3.2,
            z: 6,
          }),
        ]

    return {
      backgroundColor: 'transparent',
      animationDuration: 280,
      animationDurationUpdate: 180,
      aria: {
        show: true,
        description: '采样前模拟信号、ADC 离散样本、混叠等效参考与数字低通输出的时域分析图。',
      },
      color: [COLORS.analog, COLORS.samples, COLORS.alias, COLORS.output],
      legend: {
        type: 'scroll',
        top: 12,
        left: 14,
        right: 150,
        itemWidth: 19,
        itemHeight: 8,
        itemGap: 16,
        selectedMode: true,
        selected: isStep ? {} : { '折回等效参考': signalAliasing.aliased },
        textStyle: { color: COLORS.text, fontSize: 11 },
        inactiveColor: '#3f5d57',
        pageIconColor: COLORS.output,
        pageIconInactiveColor: '#3f5d57',
        pageTextStyle: { color: '#7f9c94', fontSize: 9 },
      },
      toolbox: {
        show: true,
        top: 6,
        right: 10,
        itemSize: 15,
        iconStyle: { borderColor: '#789a91' },
        emphasis: { iconStyle: { borderColor: COLORS.output } },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: '框选缩放', back: '返回缩放' } },
          restore: { title: '恢复视图' },
          saveAsImage: { name: 'LPF-时域分析', backgroundColor: '#052526', title: '导出图片' },
        },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        appendToBody: false,
        axisPointer: {
          type: 'cross',
          snap: false,
          lineStyle: { color: 'rgba(215, 245, 109, 0.5)', width: 1 },
          crossStyle: { color: 'rgba(215, 245, 109, 0.45)', width: 1 },
          label: { color: '#082829', backgroundColor: COLORS.output, fontSize: 10 },
        },
        padding: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
        formatter: tooltipFormatter,
      },
      grid: {
        top: 62,
        right: 28,
        bottom: 66,
        left: 62,
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: simulation.duration,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#42645d' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#6f8e86',
          fontSize: 10,
          hideOverlap: true,
          formatter: (value) => formatSeconds(value),
        },
        splitLine: { show: true, lineStyle: { color: COLORS.line, type: 'dashed' } },
      },
      yAxis: {
        type: 'value',
        min: yDomain[0],
        max: yDomain[1],
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#6f8e86',
          fontSize: 10,
          formatter: (value) => formatNumber(value, 3),
        },
        splitLine: { show: true, lineStyle: { color: COLORS.line, type: 'dashed' } },
        splitArea: {
          show: true,
          areaStyle: { color: ['rgba(255,255,255,0.010)', 'rgba(10,163,154,0.014)'] },
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none', minValueSpan: simulation.duration / 200 },
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
            lineStyle: { color: COLORS.output },
            areaStyle: { color: 'rgba(215,245,109,0.10)' },
          },
          handleStyle: { color: '#0d4b49', borderColor: COLORS.output },
          moveHandleStyle: { color: '#789a91' },
          textStyle: { color: '#7f9c94', fontSize: 9 },
        },
      ],
      series,
    }
  }, [inputType, signalAliasing.aliased, simulation, yDomain])

  return (
    <div className="echart-analysis-frame time-analysis-chart">
      <EChartCanvas
        option={option}
        ariaLabel="采样前模拟信号、ADC 样本、折回等效参考与数字输出的交互时域图"
      />
      <span
        key={scanKey}
        className={`echart-scan-playhead ${playing ? 'is-playing' : 'is-paused'}`}
        aria-hidden="true"
      />
    </div>
  )
}
