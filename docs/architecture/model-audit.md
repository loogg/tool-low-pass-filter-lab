# 一阶低通理论模型审核

审核日期：2026-10-27。适用代码：`src/lib/filterMath.js`、`src/lib/codegen.js`。范围为理想一阶、固定周期、实数采样教学模型。

## 资料与适用范围

| 来源 | 核验内容 |
| --- | --- |
| [Analog Devices · Basic Linear Design，Chapter 8](https://www.analog.com/media/en/training-seminars/design-handbooks/Basic-Linear-Design/Chapter8.pdf)，§8.2、§8.3、§8.6 Single-Pole RC / Fig.8.66 | 单极点连续传递函数、幅相、阶跃与 RC 实现。理想单位直流增益，真实 RC 还需考虑负载及器件误差。 |
| [Analog Devices · ADALM1000 RC Transient Response](https://www.analog.com/en/resources/analog-dialogue/studentzone/2019/07/25/14/46/studentzone-april-2018.html) | RC 时间常数与阶跃 63.2% 的物理意义。 |
| [Analog Devices · MT-002，Walt Kester](https://www.analog.com/media/en/training-seminars/tutorials/MT-002.pdf) | 采样、Nyquist 区、频谱镜像、ADC 前抗混叠。工具采用基带实采样，不进行带通重建。 |
| [MathWorks · Continuous-Discrete Conversion Methods](https://www.mathworks.com/help/control/ug/continuous-discrete-conversion-methods.html)，Zero-Order Hold | ZOH 保持输入一个采样周期，再采样连续输出的时序假设。 |
| [MathWorks · Discrete-Time Integrator](https://www.mathworks.com/help/simulink/slref/discretetimeintegrator.html)，Backward Euler | 后向矩形法 `1/s ≈ Ts·z/(z−1)`，当前输入具有直接作用。 |
| [Julius O. Smith III · Introduction to Digital Filters，One-Pole](https://www.dsprelated.com/freebooks/filters/One_Pole.html) | 一极点递推、H(z)、稳定性、单位增益归一化。 |

以下数字截止、群时延、整数达标次数和约束求解是从上述模型推导并通过数值实验交叉验证的项目实现，不将项目推导称为原文结论。

## 连续原型

```text
H(s) = 1 / (1 + τs)          τ = 1 / (2πfc)
阶跃：y(t) = 1 − exp(−t/τ)   （单位阶跃，初始输出 0）
|H(j2πf)| = 1 / sqrt(1 + (f/fc)²)
GdB = 20log10|H|            φ = −atan(f/fc)
群时延 = τ / (1 + (f/fc)²)
tp = −τ ln(1−p)
```

fc 处幅值为 1/√2，增益 −3.0102999566 dB，相位 −45°；高频渐近滚降 −20 dB/dec。3τ 达到 95.02%，5τ 达到 99.33%；精确 t95 = 2.995732τ、t99 = 4.605170τ。以上解析关系保留。

## 当前输入 EMA 与 ZOH 时序

项目实际执行的递推与频响为：

```text
y[n] = y[n−1] + α (x[n] − y[n−1])
p = 1 − α
H(z) = α / (1 − p z⁻¹)
极点匹配：α = −expm1(−2πfc/fs)
后向欧拉：α = 2πfc / (fs + 2πfc)
```

指数系数匹配连续极点的衰减速度，后向欧拉由差分近似代入连续方程得到。正参数下 0 < α ≤ 1；α = 1 为双精度饱和下的直通极限。

严格 ZOH 的输入在 `[nTs,(n+1)Ts)` 保持 x[n]，同刻采样连续输出时：

```text
y[n+1] = p y[n] + α x[n]
H_ZOH(z) = α z⁻¹ / (1 − p z⁻¹)
```

因此原先将当前输入 EMA 称作“ZOH 精确离散”过于笼统。UI 改为“极点匹配”，保留内部 `zoh` 标识以减少无关改动。严格 ZOH 与该 EMA 幅值相同、相位多滞后 Ω、群时延多 Ts。仿真和生成代码统一使用当前样本立即更新、初始状态 y[−1]。

## 实际数字截止与群时延

```text
Ω = 2πf/fs
|H| = α / sqrt(α² + 4p sin²(Ω/2))
φ = −atan2(p sinΩ, α + 2p sin²(Ω/2))
fd = (fs/π) asin(α / (2sqrt(p)))
```

fd 是真正的半功率点。若 asin 的参数大于 1（α > 2(√2−1)），整个基带都未达到 −3.0103 dB，显示“未达 −3 dB”，不伪造截止点。半角形式避免极小 α 时的相减抵消。

数字群时延为 `p(α − 2sin²(Ω/2)) / [α² + 4p sin²(Ω/2)] / fs`。删除原先以绝对 `Number.EPSILON` 判定分母为零的逻辑；该判定会把宽量程下有效的小分母错误置零。负群时延不表示非因果或负总处理时延。

## 整数更新与设计约束

单位阶跃在 N 次更新后残差为 pᴺ。第一次达标更新数为 `N = ceil(ln(1−目标比例)/ln(p))`，α=1 时 N=1。本工具用 N·Ts 表示从 y[−1] 开始的更新预算；图中 x[0] 在 t=0 跳变，首次达标是 y[N−1]，时刻 (N−1)Ts。UI 和代码中显式解释这一区别。

原先数字 t95 返回连续指数包络的交点，可能落在两个采样点之间，现改成整数更新数。选型按 `floor(目标时间·fs)` 次更新求下限，通带/阻带按 H(z) 求边界，在 fc 支持范围内求交；必须 `0 < fp < fstop < fs/2`。建议值回代验证三项指标，不用模拟近似代替数字约束。

## 混叠与显示

- 单音折回 `falias = |fin − round(fin/fs)fs|`。镜像区等效正弦初相位为 180°−φ；数字传递函数在正负频率的相位应为奇函数，修正原先只取绝对折回频率导致的符号错误。
- fs/2、fs 整数倍存在相位/幅值退化，不能承诺完整幅相重建；方波高次谐波也可能混叠，不能仅根据基频判定整体无混叠。
- 数字滤波不能区分原始频率与已折回分量；真实系统需要 ADC 前抗混叠。实验无量化、饱和或抖动模型。
- 原算法用块末样本保持整块并扩大 α，除块内输入恒定外不等于逐点递推。现删除该近似：实际最多逐点计算预算数量，超预算报告请求长度与实际较短观察窗。
- 输入、输出 RMS 对实际窗口的全部样本累加。绘图只选择极值点，保留样本时间；抽点后用散点，不用稀疏折线假装完整波形。连续参考超过分辨率时隐藏。
- 噪声是可重复的离散伪随机扰动；连续参考不含该噪声。RMS 含直流、干扰及初始过渡，不等于稳态频响增益。
- 零幅值/零阶跃电平差严格对应零相对噪声和干扰，不用人为最小幅值注入微小信号。短于 Ts 的自定义窗口会显式说明扩展到首两个样本。
- 宽量程计算采用机器精度量级的边界容差，不把非常低的基带频率强制吸附到直流；大更新次数的取整容差也按机器精度缩放。

## 代码与验证边界

生成的 C99 默认 double，显式初始化 y[−1]，首样本按同一递推计算。保留 float 选项并提示舍入边界；极小系数使用科学计数法。运算数是算术预算，不等于 MCU 的周期/耗时。

验证覆盖解析值、极小比值、实际截止、整数更新、约束回代、独立稳态正弦投影、镜像相位、噪声可重复性、预算截窗、绘图不改变 RMS 及代码字面量。未执行真实 ADC/MCU 硬件联调；目标 CPU 的精度、采样时钟与运行周期需在目标环境核验。
