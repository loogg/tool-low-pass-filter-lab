# Refactoring UI 九章在本工具中的落实

依据：用户在本轮提供的[中文译本站点](https://shallowhawk.github.io/refactoring-ui-zh/)，九章正文均于 2026-10-27 阅读。这里只记录针对实验工具的设计决策，不复制书籍正文。颜色和视觉风格以用户提供的 [Cap 参考](design.md) 为准。

用户反馈后的专业化修订：首轮保留的 Hero 与大标题不适合作为工具入口，已移除。当前默认直接进入分析，使用功能名和 20px 标题；真实时间轴为默认，t/τ 改为可选；新增固定时间窗、τ 反向输入与分列模型读数。原“直觉”内容迁入理论辅助页。下表中的视觉学习以此任务优先原则为约束，不能用风格参考替代产品任务结构。详见 [当前工作台方案](../architecture/analysis-workbench.md)。

| 章节 | 提取的原则 | 本次落实 |
| --- | --- | --- |
| [01 从零开始](https://shallowhawk.github.io/refactoring-ui-zh/starting-from-scratch/) | 从真实任务出发，限制设计选项，先做可运行功能 | 围绕设参→读图→仿真→选型→实现组织五个工作区；统一输入、按钮、间距与色阶；删除无关装饰和假播放效果。 |
| [02 层级就是一切](https://shallowhawk.github.io/refactoring-ui-zh/hierarchy-is-everything/) | 以字重、对比和弱化辅助内容建立层级；操作有主次 | 波形、建议值与实际结果优先；标签与单位弱化；仅采用建议值等核心操作填蓝，复位/载入参数为次级操作。语义标题与视觉字号分开管理。 |
| [03 布局与间距](https://shallowhawk.github.io/refactoring-ui-zh/layout-and-spacing/) | 限制内容宽度，组外留白大于组内；侧栏按内容定宽 | 页面最大 1200px，参数栏 304px；主要间距 8/12/16/24/32/48/80px；参数组之间明显分隔，窄屏堆叠；不强行把所有结果挤进首屏。 |
| [04 文字设计](https://shallowhawk.github.io/refactoring-ui-zh/designing-text/) | 有限字号、控制行长、数字便于比较、正文左对齐 | DM Sans + 中文无衬线；正文 14–16px、长说明限制行长；表格数字右对齐、等宽数字；公式和单位基线对齐；大标题随断点收敛。 |
| [05 色彩的运用](https://shallowhawk.github.io/refactoring-ui-zh/working-with-color/) | 预先定义灰/主色色阶，颜色不能独自承载含义 | #fcfcfc 画布、有限灰阶、蓝色状态；曲线用深浅、实线/虚线/散点和名称区分；不可行/暂停/超预算均有文字。功能性错误使用深红文字与错误说明。 |
| [06 营造层次感](https://shallowhawk.github.io/refactoring-ui-zh/creating-depth/) | 层次服务交互，不以阴影装饰所有内容 | 主体平面化；输入与分段控件有轻微凹凸关系；静态面板无重投影；选中段仅小阴影；结果和说明通过布局区分。 |
| [07 图片的运用](https://shallowhawk.github.io/refactoring-ui-zh/working-with-images/) | 图形按真实显示尺寸设计，不缩成看不清的截图 | 分析页直接显示可测量的原生图表，替换固定示意 SVG；单位、采样点与游标按实际数据渲染；标识保持简洁，不放装饰性图库照片。 |
| [08 收尾打磨](https://shallowhawk.github.io/refactoring-ui-zh/finishing-touches/) | 打磨默认控件、空/错态与反馈，减少多余边框 | 统一 focus/hover/active；输入草稿提交校验；复制成功/失败、可行/冲突、暂停、超预算、连续参考隐藏都有明确信息；分组更多依靠留白而非层层卡片。 |
| [09 持续进阶](https://shallowhawk.github.io/refactoring-ui-zh/leveling-up/) | 研究参考中的具体决定，重建并对照实际结果 | 将 Cap 的白/灰/蓝、胶囊导航、紧凑组件和宽松段落转成工具语言；逐工作区实际操作和截图审查，记录发现、修正与复验。 |

冲突处理：不机械移植营销页的下载/升级按钮、信任 Logo 或长 Hero；工具仍以计算、图表与明确交互为核心。原参考的低对比灰色不直接用于小字号正文，辅助文字采用更深灰以维持可读性。
