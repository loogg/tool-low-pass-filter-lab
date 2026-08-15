import { Check, Clipboard, Code2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { alphaBackwardEuler, alphaForMethod, alphaZoh, nyquistFrequency, tauFromCutoff } from '../lib/filterMath.js'
import { formatFrequency, formatNumber, formatSeconds } from '../lib/format.js'
import SectionIntro from './SectionIntro.jsx'

export default function CodePanel({ cutoffHz, sampleRateHz, method }) {
  const [copied, setCopied] = useState(false)
  const tau = tauFromCutoff(cutoffHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const zohAlpha = alphaZoh(cutoffHz, sampleRateHz)
  const backwardAlpha = alphaBackwardEuler(cutoffHz, sampleRateHz)
  const nyquist = nyquistFrequency(sampleRateHz)
  const methodLabel = method === 'zoh' ? 'ZOH exact discretization' : 'Backward Euler discretization'
  const code = useMemo(
    () => `#include <stdbool.h>

typedef struct {
    float y;
    float alpha;
    bool initialized;
} lpf1_t;

static inline void lpf1_init(lpf1_t *f)
{
    /* fc = ${cutoffHz.toFixed(4)} Hz, fs = ${sampleRateHz.toFixed(2)} Hz */
    /* Nyquist fN = ${nyquist.toFixed(4)} Hz. Band-limit the analog input before ADC. */
    /* ${methodLabel} */
    f->alpha = ${alpha.toFixed(8)}f;
    f->y = 0.0f;
    f->initialized = false;
}

static inline float lpf1_update(lpf1_t *f, float x)
{
    if (!f->initialized) {
        f->y = x;
        f->initialized = true;
        return x;
    }

    f->y += f->alpha * (x - f->y);
    return f->y;
}`,
    [cutoffHz, sampleRateHz, nyquist, methodLabel, alpha],
  )

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="content-section">
      <SectionIntro
        eyebrow="05 · 落到代码"
        title="最后 MCU 真正执行的，仍然只有一行"
        description="固定采样周期时，α 在初始化阶段算一次即可。实时更新只做一次减法、一次乘法和一次加法。"
        aside={<><Code2 size={18} />可直接复制</>}
      />

      <div className="code-layout">
        <article className="code-card">
          <div className="code-toolbar">
            <div><span className="code-dot red" /><span className="code-dot amber" /><span className="code-dot green" /><strong>lpf1.h</strong></div>
            <button type="button" onClick={copyCode}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? '已复制' : '复制代码'}</button>
          </div>
          <pre><code>{code}</code></pre>
        </article>

        <aside className="code-explainer">
          <div className="one-line-code"><span>核心递推</span><code>y += α × (x − y)</code></div>
          <ol>
            <li><span>01</span><div><strong>x − y</strong><p>先算输入与当前输出还差多少。</p></div></li>
            <li><span>02</span><div><strong>乘以 α</strong><p>这次只走完整差值的一小步。</p></div></li>
            <li><span>03</span><div><strong>加回 y</strong><p>输出平滑地向输入靠近。</p></div></li>
          </ol>
          <div className="method-comparison">
            <h3>两种 α 对照</h3>
            <div className={method === 'zoh' ? 'is-selected' : ''}><span>ZOH 精确</span><strong>{formatNumber(zohAlpha, 7)}</strong></div>
            <div className={method === 'backward-euler' ? 'is-selected' : ''}><span>后向欧拉</span><strong>{formatNumber(backwardAlpha, 7)}</strong></div>
            <p>当前 τ = {formatSeconds(tau)}。当 fs ≫ fc 时，两种结果会很接近。</p>
          </div>
          <div className="engineering-note"><strong>启动注意</strong><p>第一次采样让 y = x，可避免从 0 开始产生不必要的启动过渡。</p></div>
          <div className="engineering-note is-warning"><strong>采样链路注意</strong><p>当前 fN = {formatFrequency(nyquist)}。这段代码运行在 ADC 之后，无法撤销已经折回的频率；模拟抗混叠滤波器必须放在 ADC 之前。</p></div>
        </aside>
      </div>
    </section>
  )
}
