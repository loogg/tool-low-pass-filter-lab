import { formatNumber } from './format.js'

export const CHART_COLORS = { blue: '#2563eb', ink: '#343a46', gray: '#818896', muted: '#646464', grid: '#ededee' }

export function baseChartOption() {
  return {
    animation: false,
    backgroundColor: '#fcfcfc',
    textStyle: { fontFamily: 'DM Sans, Noto Sans SC, sans-serif', color: '#646464', fontSize: 12 },
    aria: { enabled: true },
    grid: { top: 86, bottom: 48, left: 65, right: 28 },
    legend: { type: 'scroll', top: 4, left: 14, right: 14, itemWidth: 20, itemHeight: 8, itemGap: 18, textStyle: { color: '#646464', fontSize: 12 }, inactiveColor: '#c2c2c2' },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: '#fcfcfc', borderColor: '#e0e0e0', textStyle: { color: '#202020', fontSize: 12 }, extraCssText: 'max-width:min(320px,75vw);white-space:normal;line-height:1.65;', valueFormatter: (v) => formatNumber(v, 5) },
    // Keep ECharts' selection controller mounted. The visible controls are
    // keyboard-accessible HTML buttons, so canvas icons have zero footprint.
    toolbox: { show: true, showTitle: false, itemSize: 0, itemGap: 0, padding: 0, feature: { dataZoom: { yAxisIndex: 'none' } } },
    dataZoom: [{ type: 'inside', filterMode: 'none', zoomOnMouseWheel: 'ctrl' }],
  }
}

export function chartAxis(extra = {}) {
  return {
    type: 'value', axisLine: { lineStyle: { color: '#d8dade' } }, axisTick: { show: false },
    axisLabel: { color: '#646464', fontSize: 11, hideOverlap: true },
    splitLine: { lineStyle: { color: '#ededee', type: 'dashed' } }, ...extra,
  }
}

export function chartSeries(name, data, color = CHART_COLORS.blue, extra = {}) {
  return { name, type: 'line', data: data.map((p) => [p.x, p.y]), showSymbol: false,
    smooth: false, lineStyle: { color, width: 2.3 }, itemStyle: { color }, emphasis: { focus: 'series' }, ...extra }
}
