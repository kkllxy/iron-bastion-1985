# MIGHTY BRAWL · 霓虹快打

原创 Q 版 3D 清版动作游戏（Beat'em Up），致敬 1993 年 FC 时代《快打旋风》风格玩法，
**不使用任何原作素材与商标**。Three.js + TypeScript + Vite 单页应用，桌面与移动端均可玩。

> 这是一个完全独立的子项目，所有文件都在 `mighty-brawl-93-glm/` 内，不依赖、不修改、不覆盖父目录的任何内容。

## 玩法

在 3D 斜俯视的霓虹都市中，控制主角八方向移动，用连段普攻、跳跃攻击、怒气必杀和抓取投掷，
清剿三区黑帮并击败各关 BOSS，最终通关。

- **关卡**：霓虹街区 → 午夜地铁 → 地下工厂，布局、宽度、敌兵配置、配色与 BOSS 各不相同。
- **敌兵**：普通混混、快速打手、重装壮汉（高血量/护甲）、远程投掷干扰型，以及各关特色 BOSS。
- **系统**：血量、命数、计分、经验值升级（解锁更长连段与伤害）、怒气槽必杀、可拾取道具（回血/加分/怒气/限时武器）、暂停、失败续关重开、关卡过渡、最终胜利演出。
- **打击感**：命中顿帧（hitstop）、击退/击飞、屏幕震动、爆烟/火花 VFX、伤害飘字、命中闪光、FOV 冲击、Q 版挤压拉伸。

## 操作

| 操作 | 键盘 | 触屏 |
| --- | --- | --- |
| 移动 | `WASD` / 方向键 | 左下虚拟摇杆 |
| 普攻（连段） | `J` / `X` | 「打」按钮 |
| 跳跃 / 跳跃攻击 | `K` / `C` | 「跳」按钮 |
| 必杀技（消耗怒气） | `L` / `V` | 「必杀」按钮 |
| 抓取与投掷 | `E` / `空格` | 「抓」按钮 |
| 暂停 | `P` / `Esc` | 右上 Ⅱ |
| 开始 / 确认 | `回车` | 弹窗按钮 |
| 重开本关 / 重玩 | `R`（暂停或失败时） | 「重开本关」按钮 |

> 攻击时会自动软锁定最近的敌人（经典清版动作手感）。怒气槽达 50% 即可释放必杀（范围旋转攻击 + 击飞）。

## 运行

```bash
cd mighty-brawl-93-glm
npm install
npm run dev        # 开发服务器 http://127.0.0.1:5193
npm run build      # 生产构建到 dist/
npm run preview    # 预览生产构建 http://127.0.0.1:4193
```

调试实时调参：在 URL 后加 `?debug` 打开 lil-gui 面板。

## 验证命令（确定性硬门禁）

```bash
npm test                 # 全部 Playwright 用例（桌面 + 移动端）
npm run verify:visual    # 画布非空 + 启动/移动/攻击响应 + 移动端触控
npm run verify:bot       # 机器人脚本游玩：击杀推进、计分上升、无错误
npm run verify:baselines # 视觉基线：active-play / boss / complete（桌面+移动）
npm run inspect:canvas   # 画布像素统计 + 渲染预算 + GPU/Console 诊断
```

测试钩子（`window.__THREE_GAME_TEST_HOOKS__`）：`seed` / `setState`（`active-play|boss|complete|title`）/
`setPausedForScreenshot` / `setReducedMotion` / `hideDebugUi`。所有玩法随机走种子 RNG，保证基线与机器人可复现。

## 架构

```
src/
  core/        InputController(八方向+边沿触发+触控) · Loop · Renderer · dispose
  utils/       random(种子) · feel(Tween/ShakeRig/FovPunch/缓动)
  game/        Game(状态机+关卡导演+FX实现) · types · levels(3关/原型/Boss配置)
  entities/    Character(Q版chibi骨骼+战斗FSM) · Player · Enemy · Boss · Pickup · Projectile
  systems/     CameraRig · CombatSystem · EffectsSystem(实例化粒子池) · AudioSystem(过程化SFX+BGM) · Hud · DebugTools
```

设计要点：单条确定更新顺序（hitstop 缩放游戏 delta，相机/特效/音频走真实 delta）；战斗用方向圆弧命中盒 +
`hitThisSwing` 防多段；过程化美术与音频（所有生成器 API 密钥缺失，见质量报告的资源采购账本）。

## 技术栈

Three.js `0.184` · TypeScript `6` · Vite `8` · Playwright `1.60`（`channel:chromium` 真实 GPU）· lil-gui。
