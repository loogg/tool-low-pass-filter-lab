import { useMemo, useState } from 'react'
import { Check, Clipboard, Code2 } from 'lucide-react'
import { Metrics, Notice, NumberField, Segments } from './LabUI.jsx'
import { alphaBackwardEuler, alphaForMethod, alphaZoh } from '../lib/filterMath.js'
import { generateFilterCode } from '../lib/codegen.js'
import { formatFrequency, formatNumber } from '../lib/format.js'

export default function CodePanel({ cutoffHz, sampleRateHz, method }) {
  const [precision, setPrecision] = useState('double')
  const [initialOutput, setInitialOutput] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const code = useMemo(() => generateFilterCode({ cutoffHz, sampleRateHz, method, precision, initialOutput }), [cutoffHz, sampleRateHz, method, precision, initialOutput])
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const copied = copyStatus === code
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopyStatus(code) }
    catch { setCopyStatus('failed') }
  }
  return <div className="result-stack">
    <article className="panel code-options"><header className="panel-title"><h2>实现配置</h2><Code2 size={20} /></header>
      <div className="code-settings"><div><span className="field-title">数值类型</span><Segments label="C 代码数值类型" value={precision} onChange={setPrecision} items={[{ id: 'double', label: 'double' }, { id: 'float', label: 'float' }]} /></div><NumberField label="初始状态 y[−1]" value={initialOutput} min={-1_000_000} max={1_000_000} onChange={setInitialOutput} /></div>
    </article>
    <article className="code-card"><div className="code-toolbar"><span><span className="blue-dot" />lpf1.h <small>C99</small></span><button type="button" onClick={copyCode}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? '已复制' : '复制代码'}</button></div><pre tabIndex="0" aria-label="可复制的低通滤波 C 代码"><code>{code}</code></pre></article>
    <span role="status" className={copyStatus === 'failed' ? 'copy-error' : 'sr-only'}>{copyStatus === 'failed' ? '剪贴板不可用，请选中上面的代码手动复制。' : copied ? '代码已复制到剪贴板' : ''}</span>
    <Metrics items={[
      { label: '极点匹配 α', value: formatNumber(alphaZoh(cutoffHz, sampleRateHz), 8), detail: method === 'zoh' ? '当前采用' : '用于对比' },
      { label: '后向欧拉 α', value: formatNumber(alphaBackwardEuler(cutoffHz, sampleRateHz), 8), detail: method === 'backward-euler' ? '当前采用' : '用于对比' },
      { label: '每采样计算', value: '1 乘 + 2 加减', detail: '运算数不等于目标 CPU 周期' },
    ]} />
    <article className="panel implementation-notes"><h3>实现约定</h3><ol>
      <li><strong>固定周期调用。</strong><p>每收到一个采样值调用一次 update，当前 fs = {formatFrequency(sampleRateHz)}。采样间隔变化时需重新计算系数。</p></li>
      <li><strong>让初始化与实验一致。</strong><p>默认 y[−1] = 0，首样本立即参与滤波。如需首样本启动，可先将状态设为 x[0]，这会改变启动过渡。</p></li>
      <li><strong>按目标处理器选择精度。</strong><p>浏览器使用双精度。float 的舍入可能使极小更新停滞；确认编译器的 double 位宽，并实测误差与运行周期。</p></li>
    </ol></article>
    {precision === 'float' && (Math.fround(1 - alpha) === 1 || alpha > 1 - 1e-7) ? <Notice warning>当前 α 接近 float 的精度边界。系数字面量仍会输出，但单精度递推可能停滞或趋近直通，请用 double 验证后再移植。</Notice> : null}
    <Notice>这段代码运行在采样之后，不能恢复已经混叠的信号。实际系统的抗混叠滤波应位于 ADC 之前。</Notice>
  </div>
}
