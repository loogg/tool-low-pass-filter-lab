import { ArrowRight, Clock3, Cpu, Lightbulb, Waves } from 'lucide-react'
import { alphaForMethod, tauFromCutoff } from '../lib/filterMath.js'
import { formatFrequency, formatNumber, formatSeconds } from '../lib/format.js'
import SectionIntro from './SectionIntro.jsx'

export default function ConceptBridge({ cutoffHz, sampleRateHz, method }) {
  const tau = tauFromCutoff(cutoffHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)

  return (
    <section className="content-section">
      <SectionIntro
        eyebrow="01 · 建立直觉"
        title="三个符号，其实只在讲同一个一阶极点"
        description="先别背公式。把它想成一扇有惯性的门：输入突然变化时，输出不会瞬移，而是按固定节奏追过去。"
        aside={<><Lightbulb size={18} />先看“快慢”，再看公式</>}
      />

      <div className="concept-bridge">
        <article className="concept-card tau-card">
          <div className="concept-card-top"><Clock3 size={22} /><span>时域镜头</span></div>
          <strong className="concept-symbol">τ</strong>
          <h3>多久能跟上？</h3>
          <p>τ 越大，输出追得越慢，但曲线更平滑。</p>
          <div className="concept-value">当前 {formatSeconds(tau)}</div>
          <code>3τ ≈ 95% · 5τ ≈ 99%</code>
        </article>

        <div className="bridge-arrow" aria-hidden="true">
          <ArrowRight />
          <span>τ = 1 / 2πfc</span>
        </div>

        <article className="concept-card fc-card">
          <div className="concept-card-top"><Waves size={22} /><span>频域镜头</span></div>
          <strong className="concept-symbol">f<sub>c</sub></strong>
          <h3>从哪里开始明显衰减？</h3>
          <p>fc 越低，高频压得越强，同时响应也越慢。</p>
          <div className="concept-value">当前 {formatFrequency(cutoffHz)}</div>
          <code>fc 处：70.7% · −45°</code>
        </article>

        <div className="bridge-arrow" aria-hidden="true">
          <ArrowRight />
          <span>结合采样率 fs</span>
        </div>

        <article className="concept-card alpha-card">
          <div className="concept-card-top"><Cpu size={22} /><span>代码镜头</span></div>
          <strong className="concept-symbol">α</strong>
          <h3>每次采样追近多少？</h3>
          <p>α 越大，单次迈得越大；α 越小，输出更稳。</p>
          <div className="concept-value">当前 {formatNumber(alpha, 6)}</div>
          <code>y += α · (x − y)</code>
        </article>
      </div>

      <div className="memory-banner">
        <span>快速记忆</span>
        <p><strong>τ</strong> 看“多久跟上”，<strong>fc</strong> 看“哪个频率衰减多少”，<strong>α</strong> 是 MCU 每次真正执行的步长。</p>
      </div>
    </section>
  )
}
