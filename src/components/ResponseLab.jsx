import { useCallback, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import Plot from './Plot.jsx'
import EngineeringTimeInput from './EngineeringTimeInput.jsx'
import { Notice, Segments } from './LabUI.jsx'
import {
  alphaForMethod, digitalCutoffFrequency, discreteGainDbAt, discreteMagnitudeAt,
  discretePhaseDegreesAt, discreteSettlingSamples, discreteTimeConstantSeconds,
  gainDbAt, magnitudeAt, phaseDegreesAt, tauFromCutoff,
} from '../lib/filterMath.js'
import { automaticStepWindow, continuousStepData, continuousStepValue, digitalStepData, digitalStepValue, stepAxis } from '../lib/responseAnalysis.js'
import { formatFrequency, formatInteger, formatNumber, formatPercent, formatSeconds } from '../lib/format.js'
import { baseChartOption, chartAxis, chartSeries, CHART_COLORS } from '../lib/chartTheme.js'

const VIEWS = [{ id: 'step', label: '阶跃响应' }, { id: 'magnitude', label: '幅频响应' }, { id: 'phase', label: '相频响应' }]
const MODELS = [{ id: 'analog', label: '连续原型' }, { id: 'digital', label: '数字 EMA' }, { id: 'compare', label: '连续 / 数字对比' }]

export default function ResponseLab({ cutoffHz, sampleRateHz, method }) {
  const [view, setView] = useState('step')
  const [model, setModel] = useState('analog')
  const [axisMode, setAxisMode] = useState('physical')
  const [yMode, setYMode] = useState('amplitude')
  const [windowMode, setWindowMode] = useState('auto')
  const [fixedDuration, setFixedDuration] = useState(() => automaticStepWindow(cutoffHz))
  const [cursor, setCursor] = useState(null)
  const [resetId, setResetId] = useState(0)
  const tau = Number(tauFromCutoff(cutoffHz))
  const autoDuration = automaticStepWindow(cutoffHz)
  const duration = Number(windowMode === 'auto' ? autoDuration : fixedDuration)
  const axis = stepAxis(duration, tau, axisMode === 'normalized')
  const alpha = Number(alphaForMethod(cutoffHz, sampleRateHz, method))
  const nyquist = sampleRateHz / 2
  const digitalCutoff = digitalCutoffFrequency(cutoffHz, sampleRateHz, method)
  const digital = useMemo(() => digitalStepData(cutoffHz, sampleRateHz, method, duration), [cutoffHz, sampleRateHz, method, duration])
  const showAnalog = model !== 'digital'
  const showDigital = model !== 'analog'
  const context = `${view}-${model}-${axisMode}-${yMode}-${duration}-${cutoffHz}-${sampleRateHz}-${method}-${resetId}`
  const onCursor = useCallback((value) => setCursor((previous) => previous?.context === context && previous.value === value ? previous : { context, value }), [context])

  function changeWindow(mode) {
    if (mode === 'fixed' && windowMode === 'auto') setFixedDuration(duration)
    setWindowMode(mode)
  }

  function resetChart() {
    setView('step'); setModel('analog'); setAxisMode('physical'); setYMode('amplitude'); setWindowMode('auto')
    setCursor(null); setResetId((previous) => previous + 1)
  }

  const option = useMemo(() => {
    const base = baseChartOption()
    const phase = view === 'phase'
    const timeAxis = stepAxis(duration, tau, axisMode === 'normalized')
    const series = []
    if (view === 'step') {
      const toAxis = (points) => points.map((p) => ({ ...p, x: timeAxis.fromSeconds(p.x) }))
      if (showAnalog) series.push(chartSeries('连续 y(t)', toAxis(continuousStepData(cutoffHz, duration)), model === 'compare' ? CHART_COLORS.gray : CHART_COLORS.blue, {
        lineStyle: { color: model === 'compare' ? CHART_COLORS.gray : CHART_COLORS.blue, width: 2.4, type: model === 'compare' ? 'dashed' : 'solid' },
      }))
      if (showDigital) series.push(chartSeries('数字 y[n]', toAxis(digital.data), CHART_COLORS.blue, digital.decimated
        ? { type: 'scatter', symbolSize: 3.5 }
        : { step: 'end', showSymbol: true, symbolSize: digital.sampleCount < 150 ? 4.5 : 2.5 }))
      series.push(chartSeries('输入 x = 1', [{ x: 0, y: 1 }, { x: timeAxis.maximum, y: 1 }], '#757575', { lineStyle: { color: '#757575', width: 1.2, type: 'dotted' }, silent: true }))
      const referenceTimes = showAnalog ? [
        { value: tau, label: 'τ' }, { value: -tau * Math.log(0.05), label: 't95' }, { value: -tau * Math.log(0.01), label: 't99' },
      ] : [0.95, 0.99].map((fraction) => ({ value: (discreteSettlingSamples(cutoffHz, sampleRateHz, method, fraction) - 1) / sampleRateHz, label: fraction === 0.95 ? 't95' : 't99' }))
      series[0].markLine = { silent: true, symbol: 'none', lineStyle: { color: '#aebbcf', type: 'dashed', width: 1 },
        label: { color: '#646464', fontSize: 11 }, data: referenceTimes.filter((item) => item.value > 0 && item.value <= duration).map((item) => ({ xAxis: timeAxis.fromSeconds(item.value), label: { formatter: item.label } })) }
      return { ...base,
        grid: { top: 80, bottom: 64, left: 62, right: 22 },
        xAxis: chartAxis({ min: 0, max: timeAxis.maximum, interval: timeAxis.interval,
          name: timeAxis.label, nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: '#646464', fontSize: 12 },
          axisLabel: { formatter: (v) => formatNumber(v, 4), hideOverlap: true, fontSize: 11 } }),
        yAxis: chartAxis({ min: 0, max: 1.05, name: yMode === 'percent' ? '归一化输出 (%)' : '幅值（无量纲）', nameGap: 14,
          nameTextStyle: { color: '#646464', fontSize: 11 },
          axisPointer: { label: { formatter: ({ value }) => yMode === 'percent' ? formatPercent(Number(value), 2) : formatNumber(Number(value), 4) } },
          axisLabel: { formatter: (v) => yMode === 'percent' ? formatPercent(v, 0) : formatNumber(v, 2), fontSize: 11 } }),
        tooltip: { ...base.tooltip, axisPointer: { type: 'cross', snap: false }, formatter: (params) => {
          const coordinate = Number(params[0]?.axisValue ?? 0)
          const time = timeAxis.toSeconds(coordinate)
          const output = (value) => yMode === 'percent' ? formatPercent(value, 3) : formatNumber(value, 6)
          const n = Math.min(digital.sampleCount - 1, Math.max(0, Math.round(time * sampleRateHz)))
          return [`t = ${formatSeconds(time)} · t/τ = ${formatNumber(time / tau, 4)}`,
            ...(showAnalog ? [`连续 y(t): ${output(continuousStepValue(time, cutoffHz))}`] : []),
            ...(showDigital ? [`数字 y[n]: ${output(digitalStepValue(n, alpha))} · n=${formatInteger(n)} @ ${formatSeconds(n / sampleRateHz)}`] : []),
            '输入 x = 1',
          ].join('<br/>')
        } }, series,
      }
    }
    const minimum = model === 'analog' ? cutoffHz / 100 : Math.min(cutoffHz / 100, nyquist / 1000)
    const maximum = model === 'analog' ? cutoffHz * 100 : nyquist
    const frequencies = Array.from({ length: 321 }, (_, index) => minimum * (maximum / minimum) ** (index / 320))
    if (showAnalog) series.push(chartSeries('连续原型', frequencies.map((x) => ({ x, y: phase ? phaseDegreesAt(x, cutoffHz) : gainDbAt(x, cutoffHz) })), model === 'compare' ? CHART_COLORS.gray : CHART_COLORS.blue, {
      lineStyle: { color: model === 'compare' ? CHART_COLORS.gray : CHART_COLORS.blue, width: 2.3, type: model === 'compare' ? 'dashed' : 'solid' },
    }))
    if (showDigital) series.push(chartSeries('数字 EMA', frequencies.map((x) => ({ x, y: phase ? discretePhaseDegreesAt(x, cutoffHz, sampleRateHz, method) : discreteGainDbAt(x, cutoffHz, sampleRateHz, method) }))))
    const references = []
    if (cutoffHz < maximum) references.push({ xAxis: cutoffHz, label: { formatter: 'fc' } })
    if (showDigital) references.push({ xAxis: nyquist, label: { formatter: 'fN', position: 'insideEndTop', rotate: 0, align: 'right' } })
    series[0].markLine = { silent: true, symbol: 'none', lineStyle: { color: '#aebbcf', type: 'dashed' }, label: { color: '#646464', fontSize: 11 }, data: references }
    return { ...base,
      grid: { top: 80, bottom: 64, left: 62, right: 22 },
      xAxis: chartAxis({ type: 'log', min: minimum, max: maximum, name: '频率 f (Hz) · 对数刻度', nameLocation: 'middle', nameGap: 34,
        axisLabel: { formatter: formatFrequency, fontSize: 11, hideOverlap: true } }),
      yAxis: chartAxis({ max: 0, min: phase ? -90 : undefined, name: phase ? '相位 (°)' : '增益 (dB)', nameGap: 14,
        axisLabel: { formatter: (v) => formatNumber(v, 2), fontSize: 11 } }),
      tooltip: { ...base.tooltip, axisPointer: { type: 'cross', snap: false }, formatter: (params) => {
        const f = Number(params[0]?.axisValue ?? minimum)
        return [`f = ${formatFrequency(f)}`,
          ...(showAnalog ? [`连续原型: ${formatNumber(phase ? phaseDegreesAt(f, cutoffHz) : gainDbAt(f, cutoffHz), 5)}${phase ? '°' : ' dB'}`] : []),
          ...(showDigital ? [`数字 EMA: ${formatNumber(phase ? discretePhaseDegreesAt(f, cutoffHz, sampleRateHz, method) : discreteGainDbAt(f, cutoffHz, sampleRateHz, method), 5)}${phase ? '°' : ' dB'}`] : []),
        ].join('<br/>')
      } }, series,
    }
  }, [alpha, axisMode, cutoffHz, digital, duration, method, model, nyquist, sampleRateHz, showAnalog, showDigital, tau, view, yMode])

  const initialCoordinate = view === 'step' ? axis.fromSeconds(Math.min(tau, duration / 2)) : model === 'analog' ? cutoffHz : Math.min(cutoffHz, nyquist * 0.8)
  const coordinate = cursor?.context === context ? cursor.value : initialCoordinate
  const time = Math.max(0, Math.min(duration, axis.toSeconds(coordinate)))
  const sampleIndex = Math.min(digital.sampleCount - 1, Math.max(0, Math.round(time * sampleRateHz)))
  const displayOutput = (value) => yMode === 'percent' ? formatPercent(value, 3) : formatNumber(value, 6)
  const readouts = view === 'step' ? [
    { label: '时间 t', value: formatSeconds(time) },
    ...(showAnalog ? [{ label: '连续 y(t)', value: displayOutput(continuousStepValue(time, cutoffHz)) }] : []),
    ...(showDigital ? [{ label: '数字 y[n]', value: displayOutput(digitalStepValue(sampleIndex, alpha)), detail: `n=${formatInteger(sampleIndex)} · t[n]=${formatSeconds(sampleIndex / sampleRateHz)}` }] : []),
    { label: 't/τ', value: formatNumber(time / tau, 4), detail: '无量纲' },
  ] : [
    { label: '频率 f', value: formatFrequency(coordinate) },
    ...(showAnalog ? [{ label: '连续原型', value: view === 'phase' ? `${formatNumber(phaseDegreesAt(coordinate, cutoffHz), 3)}°` : `${formatNumber(gainDbAt(coordinate, cutoffHz), 3)} dB` }] : []),
    ...(showDigital ? [{ label: '数字 EMA', value: view === 'phase' ? `${formatNumber(discretePhaseDegreesAt(coordinate, cutoffHz, sampleRateHz, method), 3)}°` : `${formatNumber(discreteGainDbAt(coordinate, cutoffHz, sampleRateHz, method), 3)} dB` }] : []),
  ]
  const updates95 = discreteSettlingSamples(cutoffHz, sampleRateHz, method, 0.95)
  const updates99 = discreteSettlingSamples(cutoffHz, sampleRateHz, method, 0.99)

  return <div className="result-stack analysis-results" id="analysis-results">
    <article className="panel analysis-panel">
      <header className="panel-title"><h2>响应曲线</h2><div className="analysis-model-control"><label>模型 <select aria-label="分析模型" value={model} onChange={(event) => setModel(event.target.value)}>{MODELS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <button type="button" className="icon-button" aria-label="重置图表设置" title="恢复默认图表设置" onClick={resetChart}><RotateCcw size={15} /></button></div></header>
      <Segments label="响应曲线" value={view} onChange={setView} items={VIEWS} />
      {view === 'step' ? <div className="analysis-axis-controls">
        <div><span>横轴</span><Segments label="时间轴模式" value={axisMode} onChange={setAxisMode} items={[{ id: 'physical', label: '真实时间' }, { id: 'normalized', label: 't/τ' }]} /></div>
        <label className="compact-select">纵轴 <select aria-label="阶跃纵轴显示" value={yMode} onChange={(event) => setYMode(event.target.value)}><option value="amplitude">幅值</option><option value="percent">百分比</option></select></label>
        <div className="window-control"><span>时间窗</span><Segments label="阶跃时间窗模式" value={windowMode} onChange={changeWindow} items={[{ id: 'auto', label: '自动' }, { id: 'fixed', label: '固定' }]} />
          <EngineeringTimeInput key={resetId} valueSeconds={duration} minimumSeconds={1e-12} maximumSeconds={1_000_000} ariaLabel="阶跃时间窗" onChange={(value) => { setFixedDuration(value); setWindowMode('fixed') }} /></div>
      </div> : <p className="analysis-frequency-context">{showDigital ? `数字频带：0 < f ≤ ${formatFrequency(nyquist)}；当前 ${method === 'zoh' ? '极点匹配' : '后向欧拉'}。` : '连续原型 H(s) = 1 / (1 + τs)，频率范围 0.01fc～100fc。'}</p>}
      <Plot key={resetId} className="response-plot" option={option} onCursor={onCursor} label={`${MODELS.find((item) => item.id === model).label}${VIEWS.find((item) => item.id === view).label}，${view === 'step' ? axis.label : '频率单位 Hz'}`} />
      <section className="measurement-strip" aria-label="响应读数"><span>{cursor?.context === context ? '游标读数' : '参考读数'}</span><dl className="cursor-readout">{readouts.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd>{item.detail ? <small>{item.detail}</small> : null}</div>)}</dl></section>
      <p className="chart-footnote">{view === 'step' ? `${windowMode === 'auto' ? '自动范围约 5τ' : '固定时间窗不随 fc 改变'} · ${formatSeconds(duration)}。${showAnalog ? '参考线：连续原型 τ、t95、t99。' : ''}${showDigital ? `数字初始 y[−1]=0，首样本在 t=0 更新；${digital.decimated ? `解析采样时刻抽取 ${formatInteger(digital.data.length)} 点绘图` : `显示 ${formatInteger(digital.sampleCount)} 个采样时刻`}。` : '输入为 0→1 单位阶跃。'}` : '幅值比按 20log₁₀|H| 换算 dB；数字相位对应当前输入 EMA，严格 ZOH 另有一采样延时。'}</p>
    </article>
    <article className="panel model-characteristics"><header className="panel-title"><h2>模型特征</h2><span className="muted">fc {formatFrequency(cutoffHz)} · fs {formatFrequency(sampleRateHz)}</span></header>
      <div className="table-scroll"><table><thead><tr><th>指标</th><th>连续原型 H(s)</th><th>数字 EMA · {method === 'zoh' ? '极点匹配' : '后向欧拉'}</th></tr></thead><tbody>
        <tr><th>时间常数 / 等效 τ</th><td>{formatSeconds(tau)}</td><td>{formatSeconds(discreteTimeConstantSeconds(cutoffHz, sampleRateHz, method))}</td></tr>
        <tr><th>首次达到 95%</th><td>{formatSeconds(-tau * Math.log(0.05))}</td><td>{formatSeconds((updates95 - 1) / sampleRateHz)}<small>{formatInteger(updates95)} 次更新 · 预算 {formatSeconds(updates95 / sampleRateHz)}</small></td></tr>
        <tr><th>首次达到 99%</th><td>{formatSeconds(-tau * Math.log(0.01))}</td><td>{formatSeconds((updates99 - 1) / sampleRateHz)}<small>{formatInteger(updates99)} 次更新 · 预算 {formatSeconds(updates99 / sampleRateHz)}</small></td></tr>
        <tr><th>半功率截止频率</th><td>{formatFrequency(cutoffHz)}</td><td>{digitalCutoff === null ? '基带内未达 −3.0103 dB' : formatFrequency(digitalCutoff)}</td></tr>
      </tbody></table></div>
    </article>
    <details className="panel calculation-details"><summary>频率参考点与时序说明</summary><div className="table-scroll"><table><thead><tr><th>频率</th><th>连续幅值 / 相位</th><th>数字幅值 / 相位</th></tr></thead><tbody>{[0.1, 1, 10, 100].map((ratio) => <tr key={ratio}><th>{formatFrequency(ratio * cutoffHz)}<small>{ratio} × fc</small></th><td>{formatPercent(magnitudeAt(ratio * cutoffHz, cutoffHz), 2)} / {formatNumber(phaseDegreesAt(ratio * cutoffHz, cutoffHz), 2)}°</td><td>{ratio * cutoffHz <= nyquist ? `${formatPercent(discreteMagnitudeAt(ratio * cutoffHz, cutoffHz, sampleRateHz, method), 2)} / ${formatNumber(discretePhaseDegreesAt(ratio * cutoffHz, cutoffHz, sampleRateHz, method), 2)}°` : '超出数字基带'}</td></tr>)}</tbody></table></div>
      <p>数字首个输出 y[0] 位于 t=0，已完成第一次更新。N 次更新的首次达标样本在 (N−1)Ts，更新预算为 NTs。归一化时间轴只改变坐标表达；固定时间窗保持物理时长。</p>
    </details>
    {showDigital && cutoffHz >= nyquist ? <Notice warning>fc 是系数映射参数，当前已不在严格数字基带内。应以实际数字响应与半功率截止判定，不将 fc 当作数字滤波的真实截止点。</Notice> : null}
  </div>
}
