import { useDeferredValue, useMemo, useState } from 'react'
import { Check, Download, Pause, Play, RotateCcw } from 'lucide-react'
import { FrequencyField } from './FilterControls.jsx'
import { METHODS } from '../lib/workspaces.js'
import { Metrics, Notice, NumberField, Segments } from './LabUI.jsx'
import SimulatorTimeChart from './SimulatorTimeChart.jsx'
import SimulatorFrequencyChart from './SimulatorFrequencyChart.jsx'
import {
  CUTOFF_FREQUENCY_RANGE, SAMPLE_RATE_RANGE, clamp, createSimulation, digitalCutoffFrequency,
  discreteGainDbAt, discreteGroupDelaySecondsAt, discreteMagnitudeAt, discretePhaseDegreesAt,
  discreteSettlingSamples, discreteTimeConstantSeconds, gainDbAt, magnitudeAt, simulationFrequencyLimits,
} from '../lib/filterMath.js'
import { formatEngineeringRate, formatFrequency, formatInteger, formatNumber, formatPercent, formatSeconds } from '../lib/format.js'

const DEFAULTS = {
  inputType: 'sine', signalFrequencyHz: 1, signalAmplitude: 1, signalOffset: 0, signalPhaseDegrees: 0,
  noiseLevel: 0.2, noiseSeed: 1, interferenceFrequencyHz: 9, interferenceLevel: 0.15, interferencePhaseDegrees: 0,
  squareDutyCycle: 0.5, stepTimeRatio: 0.15, stepInitialValue: 0, stepFinalValue: 1, initialOutput: 0,
  cyclesToShow: 4, windowMode: 'auto', customDuration: 4, maxIntegrationSteps: 50_000, maxRenderedPoints: 800,
}
const INPUTS = [{ id: 'sine', label: '正弦波' }, { id: 'square', label: '方波' }, { id: 'step', label: '阶跃' }]

function ControlSection({ number, title, detail, children, open = false }) {
  return <details className="control-section" open={open}><summary><span className="control-section-number">{number}</span><span><strong>{title}</strong><small>{detail}</small></span></summary><div className="control-section-body">{children}</div></details>
}

function normalizeRates(settings) {
  const range = simulationFrequencyLimits(settings.sampleRateHz)
  return { ...settings, signalFrequencyHz: clamp(settings.signalFrequencyHz, range.minimum, range.maximum), interferenceFrequencyHz: clamp(settings.interferenceFrequencyHz, range.minimum, range.maximum) }
}

export default function SimulatorLab({ cutoffHz, sampleRateHz, method }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, cutoffHz, sampleRateHz, method }))
  const [frozen, setFrozen] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const current = frozen ?? settings
  const deferred = useDeferredValue(current)
  const pending = deferred !== current
  const simulation = useMemo(() => createSimulation({ ...deferred, durationSeconds: deferred.windowMode === 'custom' ? deferred.customDuration : undefined }), [deferred])
  const frequencyRange = simulationFrequencyLimits(settings.sampleRateHz)
  const update = (key, value) => {
    const next = ['noiseSeed', 'maxIntegrationSteps', 'maxRenderedPoints'].includes(key) ? Math.round(value) : value
    setSettings((previous) => normalizeRates({ ...previous, [key]: next })); setLoaded(false)
  }
  const field = (key, label, min, max, unit, hint, step) => <NumberField key={key} label={label} value={settings[key]} min={min} max={max} unit={unit} hint={hint} step={step} onChange={(value) => update(key, value)} />
  const alias = simulation.signalAliasing
  const rate = deferred.sampleRateHz
  const cutoff = deferred.cutoffHz
  const activeMethod = deferred.method
  const actualCutoff = digitalCutoffFrequency(cutoff, rate, activeMethod)
  const updates95 = discreteSettlingSamples(cutoff, rate, activeMethod)
  const isSine = deferred.inputType === 'sine'

  function aliasExample(ratio) {
    setSettings((previous) => ({ ...previous, inputType: 'sine', signalFrequencyHz: previous.sampleRateHz * ratio, noiseLevel: 0, interferenceLevel: 0, windowMode: 'auto' }))
    setFrozen(null)
  }

  return <div className="workbench simulator-workbench">
    <aside className="panel simulation-controls" aria-label="仿真参数">
      <header className="panel-title"><div><h2>独立仿真参数</h2></div><button type="button" className="icon-button" aria-label="重置仿真参数" onClick={() => { setSettings({ ...DEFAULTS, cutoffHz, sampleRateHz, method }); setFrozen(null); setLoaded(false) }}><RotateCcw size={16} /></button></header>
      <a className="mobile-jump" href="#simulation-results" onClick={(event) => { event.preventDefault(); document.getElementById('simulation-results')?.scrollIntoView({ block: 'start' }) }}>查看波形与计算结果 ↓</a>
      <ControlSection number="01" title="输入信号" detail={INPUTS.find((input) => input.id === settings.inputType).label} open>
        <Segments label="输入波形" value={settings.inputType} onChange={(value) => update('inputType', value)} items={INPUTS} />
        {settings.inputType === 'step' ? <div className="field-grid">
          {field('stepInitialValue', '阶跃前电平', -10, 10)}{field('stepFinalValue', '阶跃后电平', -10, 10)}
          {field('stepTimeRatio', '跳变位置', 0.02, 0.8, '× 窗口', '相对于请求观察时长')}
        </div> : <>
          <FrequencyField label="主信号频率" symbol="fin" value={settings.signalFrequencyHz} range={frequencyRange} onChange={(value) => update('signalFrequencyHz', value)} />
          <div className="field-grid">{field('signalAmplitude', '峰值幅度', 0, 10)}{field('signalOffset', '直流偏置', -10, 10)}{field('signalPhaseDegrees', '初始相位', -180, 180, '°', undefined, 1)}
            {settings.inputType === 'square' ? field('squareDutyCycle', '占空比', 0.05, 0.95, '比例') : null}</div>
        </>}
      </ControlSection>
      <ControlSection number="02" title="滤波器与采样" detail={`${formatFrequency(settings.cutoffHz)} / ${formatFrequency(settings.sampleRateHz)}`} open>
        <button type="button" className="text-button load-parameters" onClick={() => { setSettings((previous) => normalizeRates({ ...previous, cutoffHz, sampleRateHz, method })); setFrozen(null); setLoaded(true) }}>{loaded ? <Check size={14} /> : <Download size={14} />}{loaded ? '已载入分析参数' : '载入分析滤波参数'}</button>
        <FrequencyField label="仿真截止参数" symbol="fc" value={settings.cutoffHz} range={CUTOFF_FREQUENCY_RANGE} onChange={(value) => update('cutoffHz', value)} />
        <FrequencyField label="仿真采样频率" symbol="fs" value={settings.sampleRateHz} range={SAMPLE_RATE_RANGE} onChange={(value) => update('sampleRateHz', value)} />
        <Segments label="仿真系数方法" value={settings.method} onChange={(value) => update('method', value)} items={METHODS} />
      </ControlSection>
      <ControlSection number="03" title="噪声与干扰" detail={`噪声 ${formatNumber(settings.noiseLevel)}× · 干扰 ${formatNumber(settings.interferenceLevel)}×`}>
        <div className="field-grid">{field('noiseLevel', '噪声峰值比例', 0, 3, '×')}{field('noiseSeed', '噪声种子', 0, 9999, undefined, undefined, 1)}
          {field('interferenceLevel', '干扰幅值比例', 0, 3, '×')}{field('interferencePhaseDegrees', '干扰初相位', -180, 180, '°', undefined, 1)}</div>
        <FrequencyField label="周期干扰频率" value={settings.interferenceFrequencyHz} range={frequencyRange} onChange={(value) => update('interferenceFrequencyHz', value)} />
        <p className="control-hint">比例相对于主信号峰值；阶跃时相对于电平差。噪声是采样点上的固定种子均匀扰动。</p>
      </ControlSection>
      <ControlSection number="04" title="观察与计算" detail={`${settings.windowMode === 'auto' ? '自动窗口' : '指定时长'} · ${formatInteger(settings.maxIntegrationSteps)} 点预算`}>
        <Segments label="观察窗口" value={settings.windowMode} onChange={(value) => update('windowMode', value)} items={[{ id: 'auto', label: '自动窗口' }, { id: 'custom', label: '指定时长' }]} />
        <div className="field-grid">{settings.windowMode === 'auto' ? field('cyclesToShow', '观察周期', 0.25, 100, '周期', '阶跃自动取 6τ') : field('customDuration', '请求时长', 0.000000001, 1_000_000, 's')}
          {field('initialOutput', '初始状态 y[−1]', -10, 10)}
          {field('maxIntegrationSteps', '递推点数上限', 1000, 200_000, '点', '超预算时缩短观察窗', 1000)}
          {field('maxRenderedPoints', '绘图点数预算', 200, 2400, '点', '只抽点，不改计算', 100)}</div>
      </ControlSection>
      <div className="simulation-control-footer"><button type="button" className="button button-dark" onClick={() => setFrozen(frozen ? null : settings)}>{frozen ? <Play size={15} /> : <Pause size={15} />}{frozen ? '恢复更新' : '暂停更新'}</button><span>{frozen ? '参数可编辑，图表已暂停' : '参数变化后自动重算'}</span></div>
    </aside>
    <div className="result-stack" id="simulation-results" aria-busy={pending}>
      {frozen ? <Notice>更新已暂停。当前图表保持暂停时的参数，点击“恢复更新”应用新设置。</Notice> : null}
      {simulation.minimumWindowExtended ? <Notice warning>请求时长 {formatSeconds(deferred.customDuration)} 短于一个采样周期。为显示至少两个样本，实际观察窗扩展到 {formatSeconds(simulation.duration)}。</Notice> : null}
      {simulation.truncated ? <Notice warning>请求 {formatSeconds(simulation.requestedDuration)}，共 {formatInteger(simulation.requestedSampleCount)} 个采样点，超过预算。当前逐点计算前 {formatInteger(simulation.sampleCount)} 点，实际显示 {formatSeconds(simulation.duration)}。可提高预算或缩短请求时长。</Notice> : null}
      <article className="panel scope-panel">
        <header className="panel-title"><div><h2>时域波形</h2></div><span className="status-label"><span className={frozen ? 'gray-dot' : 'blue-dot'} />{pending ? '计算中' : frozen ? '已暂停' : '逐点递推'}</span></header>
        <div className="alias-strip"><div><span>{deferred.inputType === 'step' ? '观察窗口' : '采样后的主频'}</span><strong>{deferred.inputType === 'step' ? formatSeconds(simulation.duration) : formatFrequency(alias.aliasFrequency)}</strong></div>
          <p>{deferred.inputType === 'step' ? '输入跳变后，输出按整数次更新逼近。' : alias.atNyquist || alias.aliasFrequency === 0 ? '采样边界：样本幅度取决于初相位，可能退化为零。' : alias.aliased ? `${formatFrequency(simulation.signalFrequency)} → 第 ${alias.nyquistZone} 区${alias.mirrored ? '镜像' : '平移'}折回` : '主信号基频位于第一 Nyquist 区。'}</p>
        </div>
        <SimulatorTimeChart simulation={simulation} inputType={deferred.inputType} />
        <div className="chart-footnote">{simulation.decimated ? `绘图已抽取 ${formatInteger(simulation.renderedPoints)} 个真实时刻，使用散点避免连线形成假波形；递推与 RMS 使用全部 ${formatInteger(simulation.sampleCount)} 点。` : `共 ${formatInteger(simulation.sampleCount)} 个实际采样点，连线仅帮助读图。`} {simulation.analogTraceCompressed || simulation.aliasTraceCompressed ? '部分连续参考超过绘图分辨率，已隐藏对应曲线。' : '连续参考不含离散噪声。'}</div>
      </article>
      <Metrics items={[
        { label: '数字系数 α', value: formatNumber(simulation.alpha, 8), detail: activeMethod === 'zoh' ? '指数极点匹配' : '后向欧拉' },
        { label: '实际数字截止', value: actualCutoff === null ? '未达 −3 dB' : formatFrequency(actualCutoff), detail: '半功率点 · 基带内' },
        { label: '输入 RMS', value: formatNumber(simulation.inputRms, 4), detail: '含偏置、噪声与启动' },
        { label: '输出 RMS', value: formatNumber(simulation.outputRms, 4), detail: '当前实际观察窗' },
      ]} />
      <article className="panel alias-panel"><header className="panel-title"><div><h2>采样频率折回</h2></div><span className="muted">fN = {formatFrequency(rate / 2)}</span></header>
        <div className="alias-equation"><code>f_alias = |fin − k·fs|</code>{deferred.inputType === 'step' ? <p>阶跃没有单一频率。下面的例题将切换为无噪正弦输入，观察其采样折回。</p> : <p>k = round(fin/fs) = {alias.nearestSampleMultiple}，所以 |{formatFrequency(simulation.signalFrequency)} − {alias.nearestSampleMultiple} × {formatFrequency(rate)}| = <strong>{formatFrequency(alias.aliasFrequency)}</strong></p>}</div>
        <div className="alias-examples"><span>试试折回</span>{[0.6, 0.9, 1.1, 1.6].map((ratio) => <button type="button" key={ratio} onClick={() => aliasExample(ratio)}>{ratio}fs <span>→ {formatNumber(Math.abs(ratio - Math.round(ratio)), 1)}fs</span></button>)}</div>
        {deferred.inputType === 'square' ? <Notice warning>方波未做带限。这里的折回计算只描述基频，高次谐波也可能发生混叠。</Notice> : null}
      </article>
      <article className="panel frequency-panel"><header className="panel-title"><div><h2>数字幅相响应</h2></div></header>
        <SimulatorFrequencyChart cutoffHz={cutoff} sampleRateHz={rate} method={activeMethod} aliasHz={isSine ? alias.aliasFrequency : 0} />
        {isSine ? <div className="table-scroll"><table><caption>正弦主信号的稳态理论值（不含噪声、干扰及初始过渡）</caption><thead><tr><th>比较对象</th><th>频率</th><th>幅值比</th><th>增益</th></tr></thead><tbody>
          <tr><th>连续原型</th><td>{formatFrequency(simulation.signalFrequency)}</td><td>{formatPercent(magnitudeAt(simulation.signalFrequency, cutoff), 2)}</td><td>{formatNumber(gainDbAt(simulation.signalFrequency, cutoff), 2)} dB</td></tr>
          <tr><th>当前数字滤波器</th><td>{formatFrequency(alias.aliasFrequency)}</td><td>{formatPercent(discreteMagnitudeAt(alias.aliasFrequency, cutoff, rate, activeMethod), 2)}</td><td>{formatNumber(discreteGainDbAt(alias.aliasFrequency, cutoff, rate, activeMethod), 2)} dB</td></tr>
        </tbody></table></div> : null}
      </article>
      <details className="panel calculation-details"><summary>计算明细与时序约定</summary><Metrics items={[
        { label: '数字达到 95%', value: `${formatInteger(updates95)} 次`, detail: `预算 ${formatSeconds(updates95 / rate)}` },
        { label: '数字等效 τ', value: formatSeconds(discreteTimeConstantSeconds(cutoff, rate, activeMethod)), detail: '指数包络的时间常数' },
        ...(deferred.inputType === 'step' ? [] : [
          { label: '基带数字相位', value: `${formatNumber(discretePhaseDegreesAt(alias.aliasFrequency, cutoff, rate, activeMethod), 2)}°`, detail: `参考 ${formatFrequency(alias.aliasFrequency)}` },
          { label: '基带数字群时延', value: formatSeconds(discreteGroupDelaySecondsAt(alias.aliasFrequency, cutoff, rate, activeMethod)), detail: '−dφ/dω，不是总处理延迟' },
        ]),
        { label: '实际递推点数', value: formatInteger(simulation.sampleCount), detail: `绘图 ${formatInteger(simulation.renderedPoints)} 点` },
        { label: '周期干扰折回', value: formatFrequency(simulation.interferenceAliasFrequency), detail: `输入 ${formatFrequency(simulation.interferenceFrequency)}` },
        { label: '实时算术预算', value: formatEngineeringRate(rate * 3, 'ops/s'), detail: '每样本 1 乘 + 2 加减，不等于 CPU 周期' },
        { label: '实际采样间隔', value: formatSeconds(1 / rate), detail: '固定周期理想采样' },
      ]} /><p>初始状态是 y[−1]；x[0] 在图上 t = 0 时立即更新得到 y[0]。达标 N 次时，样本编号为 N−1。RMS 包含启动过程和直流，不能据此直接推断稳态幅值衰减。ADC 量化、饱和和抖动不在本实验模型内。</p></details>
    </div>
  </div>
}
