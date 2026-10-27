# LPF LAB · 一阶低通滤波实验室

面向学习者与嵌入式开发者的纯前端工具：设置参数，观察连续响应与数字递推，从工程约束选型，再生成 C99 实现。

## 工作区

- **分析（默认）**：直接进入参数与响应工作台；fc / τ 双向输入，支持连续原型、数字 EMA 和对比；阶跃默认使用真实时间与明确单位，提供 t/τ 可选模式、自动/固定时间窗、游标读数及分列模型特征。
- **仿真**：独立实验参数，可载入共享值；支持正弦、方波、阶跃，幅值/偏置/相位/占空比/电平/跳变位置，固定种子噪声、周期干扰、初始状态、观察时长与计算预算。提供暂停更新、混叠例题、数字幅相、实际数字截止、RMS 及计算明细。
- **指标选型**：按当前数字传递函数求响应速度、通带与阻带的可行交集，回代核验并应用建议值。
- **代码**：生成当前输入立即更新的 C99 EMA；可选 double / float 与初始状态，支持复制和错误反馈。
- **理论**：集中说明公式、时序、归一化、采样边界与权威资料。旧 `#concept` 链接自动转到分析。

共享 fc 支持 1 mHz–50 MHz，fs 支持 1 Hz–200 MHz。工程数值可切换 Hz / kHz / MHz，支持科学计数法；文本编辑在 Enter 或离焦时提交，Escape 取消，非法输入保留原参数并给出提示。

## 模型约定

```text
连续：H(s) = 1 / (1 + τs)，τ = 1 / (2πfc)
数字：y[n] = y[n−1] + α(x[n] − y[n−1])
      H(z) = α / [1 − (1−α)z⁻¹]
极点匹配：α = 1 − exp(−2πfc/fs)
后向欧拉：α = 2πfc / (fs + 2πfc)
```

指数系数的旧名称“ZOH 精确”已更正为“极点匹配”：严格 ZOH 连续系统的同刻采样多一个输入采样延时，不能把它的相位与当前输入 EMA 混用。fc 是连续原型/系数映射参数；实际数字半功率点另外计算，可能在基带内不存在。

数字响应按整数 N 次更新判断达标；N·Ts 是从初始状态 y[−1] 开始的更新预算。如果 x[0] 在 t=0 跳变，达标样本编号为 N−1。仿真逐样本精确递推，超预算时明确缩短实际观察窗；绘图抽点不改变运算和 RMS，连续参考分辨率不足时隐藏。实验不包含 ADC 量化、饱和、抖动或模拟前级。

详细依据、推导、问题与修正见 [模型审核](docs/architecture/model-audit.md)。

## 设计与验收

采用用户提供的 [Cap 风格参考](docs/ui-prototype/design.md) 的近白画布、灰色细线和蓝色强调，界面按专业工具组织，移除营销式 Hero。具体状态与坐标约定见 [分析工作台方案](docs/architecture/analysis-workbench.md)，九章设计原则见 [Refactoring UI 落实记录](docs/ui-prototype/refactoring-ui-application.md)。

本轮范围、检查方法、实际结果及边界见 [重构验收](docs/acceptance/2026-10-27-refactor.md)。

## 开发与检查

Node.js 20.19+（20.x）或 22.12+，React 19 / Vite 7 / ECharts 6 / Vitest。图表与非首页工作区按需加载，全部计算在客户端完成。

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

## 发布

[在线体验](https://loogg.github.io/tool-low-pass-filter-lab/)。`package.json.version` 是应用显示版本与发布依据。普通提交仅运行 CI；与版本一致的语义版本标签才发布本仓库的 GitHub Pages：

```bash
npm version patch -m "chore(release): v%s"
git push origin main --follow-tags
```

本地重构不自动升版、打标签或发布，不修改工具目录仓库。
