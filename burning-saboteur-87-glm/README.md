# 夜枭行动 · 潜入谍战（Burning Saboteur）

一款致敬 1987 年 FC《燃烧战车 / 合金装备》潜行谍报玩法、**完全原创**（不复制原作素材与商标）的 3D 单网页潜行动作游戏。Three.js + TypeScript + Vite。

扮演潜入特工「夜枭」，孤身渗透「铁幕军团」核武基地：靠潜行、伪装与解谜推进，而非一味硬拼。3 个相互连通的区域，最终摧毁核武步行兵器「铁狱」即可通关。

> 本目录为独立子项目，所有内容均位于 `burning-saboteur-87-glm/` 内，不依赖也不修改父目录。

## 特性

- **潜行核心**：视线锥可视化、听觉、警戒状态机（潜伏 → 被发现 → 通缉 → 搜查 → 恢复）。
- **敌人/机关**：巡逻兵（视线锥+听觉）、固定监控摄像头（扫描）、重装守卫（高血量）、远程狙击手（激光锁定）、最终步行兵器 BOSS（多部位解谜破坏）。
- **3 个区域**：基地外围 / 内部建筑 / 地下核武库，分级钥匙卡开门、救俘虏、收集装备情报。
- **系统**：血量、命数、计分、分级钥匙卡、口粮回血、武器（手枪/镇静针）、C4 炸药、纸箱伪装、暂停、失败重开、区域过渡、最终胜利。
- **视听**：冷峻军事美术方向、警戒闪烁、爆炸/纸箱 VFX、WebAudio 合成枪声/警报/脚步/爆炸与程序化 BGM。
- **全中文**：标题/菜单/HUD/任务/对话/按键提示/结算均为简体中文；雷达小地图用几何图形（避免 canvas 字体问题）。
- **桌面 + 移动**：键盘/鼠标 + 触屏（虚拟摇杆 + 攻击/潜行/互动/切换/纸箱 五键）。

## 安装与运行

```bash
cd burning-saboteur-87-glm
npm install
npm run dev          # 开发：http://127.0.0.1:5188
npm run build        # 生产构建（tsc + vite build）
npm run preview      # 预览生产构建：http://127.0.0.1:4188
```

## 操作

| 操作 | 桌面 | 移动 |
| --- | --- | --- |
| 移动 | WASD / 方向键 | 虚拟摇杆 |
| 攻击/使用（当前装备） | J / X | 攻 |
| 切换武器与道具 | Q / Tab | 换 |
| 潜行（贴墙/蹲伏） | Shift / Ctrl | 蹲（按住） |
| 互动（开门/拾取/救援） | E / 空格 | 动 |
| 纸箱伪装 | F / B | 箱 |
| 暂停 | P / Esc | ⏸ |

装备槽循环：手枪（射击，有噪声会引来敌人）→ 镇静针（近身无声制服）→ 口粮（回血）→ C4 炸药（BOSS 部位大伤害）。

## 通关目标

1. 区域 1：避开视线锥，拾 1 级钥匙卡，从东闸门撤离。
2. 区域 2：救俘虏，拾 2 级钥匙卡，前往地下入口。
3. 区域 3：拾炸药，依次摧毁两侧导弹荚，再摧毁核心反应堆（手枪可磨血，炸药见效更快），注意弹幕与冲撞。

## 验证与质量

```bash
npm test                # Playwright 全量（desktop + mobile）
npm run verify:visual   # 画布非空 + 可控 + 中文 HUD
npm run verify:baselines# 桌面/移动视觉基线
npm run verify:bot      # 机器人游玩 + BOSS 破坏
npm run inspect:canvas  # 画布像素 + 渲染预算
```

- 测试结果：**20/20 通过**。
- 确定性测试钩子：`window.__THREE_GAME_TEST_HOOKS__`（seed/setState/setPausedForScreenshot/setReducedMotion/hideDebugUi/getPhase）；诊断：`window.__THREE_GAME_DIAGNOSTICS__`。
- 资产策略：凭证探测 `TRIPO/GEMINI/ELEVENLABS` 均 MISSING，全部资产程序化生成、音频用 WebAudio 合成（详见 `QUALITY_REPORT.md`）。
- 中文字体：使用系统 CJK 字体栈（PingFang SC / Microsoft YaHei / Source Han Sans SC 等）；测试已用像素签名验证无方块、无溢出遮挡。

详见 `QUALITY_REPORT.md`（含视觉记分卡、渲染预算、像素指标、残留风险）。

## 目录结构

```
src/
  core/        Loop, Renderer, InputController
  game/        Game, types, levels, Vision, AlertSystem
  entities/    Player, Enemy, Boss, Projectiles, Pickups, Effects
  systems/     GridMap, CameraRig, Hud, AudioSystem, DebugTools
  assets/      Materials, World
tests/         visual, chinese-text, bot-playtest, visual-regression
scripts/       inspect-threejs-canvas.mjs
```
