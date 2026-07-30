# 末日花园自走棋（Godot 版）质量报告

> 最终集成验证日期：2026-07-31。这里只记录本项目实际执行的证据，父目录其他实现的结果不计入本项目门禁。

## 结论

Godot 原生、Web release、桌面/移动 Chromium、固定 seed 和 15 波机器人硬门禁均通过。完整 Playwright 套件共 22 项：21 项通过，1 项按设计跳过（15 波机器人只在桌面项目执行一次；同一文件的移动固定-seed 测试仍通过）。

## 实际环境

| 项目 | 实际值 | 结果 |
| --- | --- | --- |
| Godot | `4.7.1.stable.official.a13da4feb` | 通过 |
| 渲染器 | Compatibility / WebGL 2.0 | 通过 |
| Web 模板 | `4.7.1.stable` | 通过 |
| Node / npm | `v26.0.0` / `11.12.1` | 通过 |
| Playwright | `1.62.0` | 通过 |
| 技能 | 仅 `godot-master` | 已实际使用 |
| Git worktree | 未创建额外 worktree | 符合方案 |
| 文件沙盒 | 未启用 | 以目标目录边界控制 |

## 执行过的命令、场景与硬门禁

| 命令/场景 | 实际结果 |
| --- | --- |
| `godot --version` | `4.7.1.stable.official.a13da4feb` |
| `godot --headless --path . --editor --quit` | 退出码 0，无 `SCRIPT ERROR` |
| `npm run test:native` | 全部断言通过：17 个模型 API、12/8/3/15 内容数量、固定 seed 商店、锁定、购买经济、三合一升星、三星变异、蒸汽嫁接、光合/荆棘两种联动、15 波胜利和存活防线 |
| `godot --headless --path . --quit-after 120` | 场景启动并正常退出，无脚本/运行错误；退出时有 4 个 ObjectDB 泄漏警告 |
| `npm run export:web` | release 导出成功至 `build/web/index.html` |
| `npm run verify:visual` | 桌面/移动共 6 项通过：Canvas 非空、中文桥、真实开始按钮鼠标点击与触控 |
| `npm run verify:bot` | 3 项通过，1 项按设计跳过；桌面固定 seed 1985 完成 15 波且防线存活，桌面/移动初始商店一致性通过 |
| `npm run verify:baselines` | 开始、备战、战斗、奖励、失败、胜利 × 桌面/移动，共 12 张基线通过 |
| `npm test` | 22 项：21 通过，1 跳过，无失败 |
| `npm run inspect:canvas` | 1280×720；亮度跨度 159；24 个采样色桶；8229 个不透明采样像素；Console/Page Error 均为 0 |

完整 Playwright 运行同时验证 Web 测试桥可读、固定 seed 快照可复现、桌面与移动 Canvas 可启动。Web 音频生成器初轮曾产生浏览器 Console warning，改为 stream playback 后复验清零；测试桥初轮返回 `null`，改为由 Godot 同步只读 JSON 状态到固定 JS 属性后复验通过。

## 视觉审阅

最终人工审阅了两种 viewport 的 12 张固定状态基线：

- 简体中文使用项目内 Noto Sans SC，不再出现方块字或依赖系统字体。
- 5×7 斜俯视网格完整展开；植物轮廓、敌人、奖励卡与胜负遮罩可辨认。
- 移动端使用 390×664 逻辑基准，商店、培育台和操作按钮纵向占用合理，关键触控按钮高度不低于 48 逻辑像素。
- 开始、奖励、失败和胜利遮罩不会让底层战场干扰主要决策。

审阅过程中实际发现并修复了棋盘 7 列重叠、Web 中文字体缺失和移动端沿用桌面逻辑分辨率三个问题；最终基线已在修复后重新生成。

## Midscene 视觉结论

未执行。当前环境没有 Midscene 模型配置；遵循规则停止该检查，未读取、打印或提交密钥。固定状态 Playwright 截图与人工审阅已覆盖本轮需要的视觉证据，但这不等同于模型视觉语义评审。

## DevTools 根因证据

未使用 Chrome DevTools MCP。最终 Playwright 和 Canvas inspector 的 Console/Page Error 均为空，未出现网络失败或性能异常，因此没有需要 DevTools 追踪的异常根因。

## 未验证项与剩余风险

- 未进行真实玩家连续 12～18 分钟的自然操作体验测试；机器人闭环会加速并主动解长期战斗停滞。
- 未在实体 iPhone/Android、Safari 或 Firefox 上验证触控、安全区域、浏览器音频解锁和字体渲染；当前浏览器证据来自桌面/移动 Chromium 仿真。
- 未执行 Performance Trace、长时间内存曲线和低端移动设备帧率测试。
- 原生短时无头启动退出仍报告 `4 ObjectDB instances were leaked`；没有脚本错误或 Web Console 错误，但正式发布前应在正常窗口关闭路径复查对象生命周期。
- 自动化已分别覆盖合成、嫁接、两种联动和三星变异，但尚未对全部 12 种植物、8 种普通敌人和 3 个 Boss 的每条特殊能力逐一做独立数值断言。
- 程序化 BGM/SFX 已通过无错误运行与静音控制检查，未做真人听感、响度或无障碍评审。
