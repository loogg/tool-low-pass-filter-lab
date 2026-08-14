# LPF·LAB：一阶低通滤波交互实验室

一个面向初学者和嵌入式开发者的纯前端教学工具。它把一阶低通滤波器的三个常见参数——时间常数 `τ`、截止频率 `fc`、数字系数 `α`——放进同一套可交互实验中，帮助用户从公式建立到工程选型，再落到 MCU 代码。

## 主要功能

- `τ ↔ fc ↔ α` 全局联动，修改任一实验参数即可实时更新结论。
- 阶跃响应横轴以 `1τ ～ 5τ` 标注，配合幅频响应和相频响应原生 SVG 图表建立直觉。
- 阶跃、方波、正弦叠加噪声三类离散信号模拟，可调频率、幅值、观察周期、噪声与波形细节。
- 模拟频率支持 `0.1 Hz ～ 0.45fs`、对数滑杆、直接数值输入和相对 `fc/fs` 快捷预设。
- ZOH 精确离散与后向欧拉系数对比。
- 时域、通带、阻带三类设计约束求交，可判断一阶滤波器是否可行。
- 自动生成可复制的嵌入式 C 实现。
- 响应式布局、键盘可操作控件和减少动态效果支持。

## 核心关系

```text
τ = 1 / (2πfc)

y[n] = y[n-1] + α(x[n] - y[n-1])

ZOH:             α = 1 - exp(-2πfc / fs)
Backward Euler:  α = 2πfc / (fs + 2πfc)
```

## 本地运行

要求 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址即可。

## 质量检查

```bash
npm run lint
npm test
npm run build
```

数学单元测试覆盖参数换算、截止点幅相特性、两种离散系数、约束求解和阶跃收敛。

## GitHub Pages

在线体验：[https://loogg.github.io/tool-low-pass-filter-lab/](https://loogg.github.io/tool-low-pass-filter-lab/)

仓库包含 GitHub Actions 工作流。推送与 `package.json` 版本一致的语义化标签即可构建并部署：

```bash
npm version patch -m "chore(release): v%s"
git push origin main --follow-tags
```

普通提交只运行 CI，不触发 Pages 发布。

## 技术栈

- React 19
- Vite 7
- 原生 SVG 图表
- Vitest
- Lucide React

## 设计原则

- 先给直觉，再给公式。
- 每个数字都配即时工程解释。
- 不把 `fc` 描述成硬边界。
- 不把后向欧拉误称为 Tustin。
- 明确一阶滤波器、抗混叠和离群值处理的能力边界。
