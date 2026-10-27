import { ArrowUpRight } from 'lucide-react'
import { Metrics, Notice } from './LabUI.jsx'
import { alphaForMethod, digitalCutoffFrequency, discreteSettlingSamples, tauFromCutoff } from '../lib/filterMath.js'
import { formatFrequency, formatNumber, formatSeconds } from '../lib/format.js'

export default function TheoryLab({ cutoffHz, sampleRateHz, method }) {
  const tau = tauFromCutoff(cutoffHz)
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const digitalCutoff = digitalCutoffFrequency(cutoffHz, sampleRateHz, method)
  const updates = discreteSettlingSamples(cutoffHz, sampleRateHz, method)
  return <div className="theory-layout">
    <article className="panel theory-reference"><h2>参数关系</h2>
      <div className="table-scroll"><table><thead><tr><th>参数</th><th>当前值</th><th>含义 / 关系</th></tr></thead><tbody>
        <tr><th>连续截止频率 fc</th><td>{formatFrequency(cutoffHz)}</td><td>fc = 1 / (2πτ)</td></tr>
        <tr><th>时间常数 τ</th><td>{formatSeconds(tau)}</td><td>单位阶跃达到 63.2%</td></tr>
        <tr><th>数字系数 α</th><td>{formatNumber(alpha, 8)}</td><td>y[n] = y[n−1] + α(x[n] − y[n−1])</td></tr>
      </tbody></table></div>
      <p>τ 与 fc 描述连续原型。给定采样频率 fs 与系数方法后，才确定数字滤波器。数字半功率频率一般不等于输入参数 fc。</p>
    </article>
    <Metrics items={[
      { label: '连续原型 t95', value: formatSeconds(-tau * Math.log(0.05)), detail: '2.9957τ' },
      { label: '数字达到 95%', value: `${formatNumber(updates, 0)} 次更新`, detail: `更新预算 ${formatSeconds(updates / sampleRateHz)}` },
      { label: '实际数字截止', value: digitalCutoff === null ? '基带内未达 −3 dB' : formatFrequency(digitalCutoff), detail: '半功率点 −3.0103 dB' },
      { label: '采样周期 Ts', value: formatSeconds(1 / sampleRateHz), detail: 'Ts = 1 / fs' },
    ]} />
    <section className="model-section" id="model-notes"><h2>模型约定与适用范围</h2>
      <div className="model-notes">
        <details open><summary>01 <span>极点匹配与严格 ZOH</span></summary><div><p>当前输入 EMA：H(z) = α / [1 − (1−α)z⁻¹]。极点匹配取 α = 1 − exp(−2πfc/fs)，保留连续极点的衰减速度。后向欧拉取 α = 2πfc / (fs + 2πfc)。</p><p>严格 ZOH 对连续系统同刻采样时使用 x[n−1]，比当前输入 EMA 多一个采样延时；幅值相同，相位多滞后 Ω。分析页的数字曲线始终表示当前输入 EMA，不将其误标为严格 ZOH。</p></div></details>
        <details><summary>02 <span>采样边界与混叠</span></summary><div><p>实数单音折回频率 f_alias = |fin − round(fin/fs)·fs|。Nyquist 边界 fs/2 的幅相表达退化；偶数 Nyquist 区的等效正弦初相位为 180°−φ。</p><p>方波包含无限谐波，基频低于 fs/2 不能保证谐波不混叠。数字滤波不能恢复混叠来源，实际系统需在 ADC 前设计抗混叠滤波与过渡带。</p></div></details>
        <details><summary>03 <span>真实时间、归一化时间与响应指标</span></summary><div><p>分析页默认使用真实时间 t，并按量级显示 s、ms、μs 等单位。t/τ 是无量纲时间，仅用于归一化比较；归一化图会消除不同 τ 在时间尺度上的差异。</p><p>连续单位阶跃：y(t) = 1 − exp(−t/τ)。t95 = −τ ln(0.05)，t99 = −τ ln(0.01)。固定时间窗便于比较 fc 改变后的实际响应速度。</p><p>数字初始状态为 y[−1] = 0，x[0] 在 t=0 立即参与更新。N 次更新后的残差为 (1−α)ᴺ；首次达标样本是 y[N−1]，图上时刻为 (N−1)Ts，更新预算为 NTs。</p></div></details>
        <details><summary>04 <span>相位与群时延</span></summary><div><p>相位描述单一正弦的角度变化。群时延是 −dφ/dω，可能随频率变化；不能将它直接视为全部频率的固定处理延迟。高频负群时延不表示信号能提前到达。</p></div></details>
        <details><summary>05 <span>计算与仿真边界</span></summary><div><p>使用理想采样、双精度一阶线性模型，不模拟 ADC 量化、饱和、抖动及模拟前级。阶跃分析通过解析式计算实际 nTs 时刻，绘图抽点不表示逐点遍历全部样本。</p><p>信号仿真采用独立配置和逐点递推。超预算时明确缩短实际观察窗；RMS 包含直流与启动过程，不能当作稳态增益。</p></div></details>
      </div>
      <Notice>一阶连续原型的高频渐近滚降为 −20 dB/dec。通带与干扰频率过近、要求更陡衰减时，应考虑更高阶滤波器。</Notice>
      <div className="source-links"><span>参考资料</span>
        <a href="https://www.analog.com/media/en/training-seminars/design-handbooks/Basic-Linear-Design/Chapter8.pdf" target="_blank" rel="noreferrer">ADI · Analog Filters <ArrowUpRight size={13} /></a>
        <a href="https://www.analog.com/media/en/training-seminars/tutorials/MT-002.pdf" target="_blank" rel="noreferrer">ADI · MT-002 <ArrowUpRight size={13} /></a>
        <a href="https://www.mathworks.com/help/control/ug/continuous-discrete-conversion-methods.html" target="_blank" rel="noreferrer">MathWorks · 离散化 <ArrowUpRight size={13} /></a>
        <a href="https://www.mathworks.com/help/control/ref/stepplot.html" target="_blank" rel="noreferrer">MathWorks · 阶跃时间轴 <ArrowUpRight size={13} /></a>
        <a href="https://www.dsprelated.com/freebooks/filters/One_Pole.html" target="_blank" rel="noreferrer">J. O. Smith · One-Pole <ArrowUpRight size={13} /></a>
      </div>
    </section>
  </div>
}
