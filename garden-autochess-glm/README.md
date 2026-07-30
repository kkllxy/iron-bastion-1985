# 末日花园自走棋 · Garden Autochess

一款致敬《植物大战僵尸》横向路线克制 ×《背包乱斗》摆阵构筑自动结算、但**完全原创主题与美术**的 3D 斜俯视"末日花园自走棋"。主题为「变异植物抵抗污染怪物」——不使用任何《植物大战僵尸》的名字、角色或美术。

玩家不实时操控战斗，而是通过**买种子 → 摆花园 → 合植物构筑阵容**，让植物自动抵挡 15 波污染怪物潮。

## 核心循环（每波重复）

1. **备战阶段**：商店随机刷出"种子"，可购买、刷新、锁定、出售。
2. **摆阵阶段**：把植物拖入草坪网格，位置与相邻关系决定加成。
3. **合成阶段**：三株同类升星（1★→2★→3★），或两种植物嫁接成新品种；3★ 时在两个变异方向中二选一。
4. **战斗阶段**：植物自动攻击来袭怪物，玩家仅能用**铲子**移除、**肥料**临时增益。
5. **奖励阶段**：在肥料 / 天气 / 遗物 / 变异中选一，进入下一波。

## 内容规模（首版）

- **5 条横向路线**，草坪 5×9 网格；怪物从右涌入，植物守左侧防线。
- **12 种植物**：向日葵、豌豆射手、火辣椒、寒冰苔、坚果墙、荆棘藤、毒蟾蜍、孢子菇、闪电芦荟、洋葱投手，以及两个嫁接品种（蒸汽蒲公英 = 火+冰、烈阳南瓜 = 向日葵+坚果）。
- **8 种敌人**：污泥怪、尖刺蛛、铁桶怪、雾霭鬼、毒囊虫、跳蚤、重锤怪、抢旗兵（不同速度、抗性、特性，如跳蚤换道、毒囊虫留下毒迹、铁桶怪高物抗弱电）。
- **3 个 BOSS**：污泥巨像（分裂）、毒雾树灵（光环增益）、末日巨龙（第 5/10/15 波）。
- **15 波**，单局约 12～18 分钟。

## 关键相邻联动（构筑深度来源）

- **光合**：产阳光植物（向日葵）旁放攻击植物 → 攻击附带阳光产出。
- **蒸汽**：火属性旁放冰属性 → 双方伤害 +25%（不嫁接也有收益）。
- **菌丝网络**：蘑菇（毒蟾蜍/孢子菇）围成一圈 → 共享攻速 +40%。
- **荆棘反伤**：坚果墙后放藤蔓 → 坚果被啃咬时反伤。
- **嫁接**：火辣椒+寒冰苔 → 蒸汽蒲公英（范围冰火）；向日葵+坚果墙 → 烈阳南瓜（产阳光肉盾）。

## 操作

- **鼠标**：商店点击购买 / 刷新 / 锁定；拖拽植物从备战台到网格摆放，拖出网格即出售；点击铲子/肥料后再点植物使用。
- **快捷键**：`空格` 开始本波 · `R` 刷新 · `L` 锁定 · `1–5` 购买商店槽 · `Q` 铲子 · `E` 肥料 · `P/Esc` 暂停 · `回车` 开始/重开。
- **触控**：拖拽放置 + 底部按钮组（移动端适配，文案不溢出不遮挡）。

## 中文显示

游戏内所有文字统一使用**简体中文**（标题、主菜单、HUD 阳光数/波次/防线血量/星数、商店与道具说明、变异/遗物/天气文案、按键提示、暂停/失败/通关结算）。字体回退到 `PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans CJK SC`，避免方块乱码。Playwright 视觉基线与中文文案校验专门覆盖。

## 技术栈

Three.js + TypeScript + Vite。单网页，无外部素材（植物/怪物均为程序化 Q 版几何体，音效/BGM 为程序化 Web Audio）。

## 开发与验证

```bash
npm install
npm run dev          # 开发服务器 http://127.0.0.1:5194
npm run build        # 生产构建（tsc + vite build）
npm test             # Playwright 全套（桌面 + 移动端）
npm run verify:visual      # 画布非空 + 中文文案 + 交互
npm run verify:baselines   # 视觉回归基线
npm run verify:bot         # 机器人游玩 + 确定性 + 完整闭环
npm run inspect:canvas     # 画布像素/渲染预算检查
```

### 确定性测试钩子

所有玩法随机走**固定种子 RNG**（`createSeededRandom`），通过 `window.__THREE_GAME_TEST_HOOKS__` 暴露：

- `seed(n)` 固定商店刷新 / 出怪 / 掉落，可复现摆阵与战斗结算。
- `setState('title'|'active-play'|'prep'|'battle'|'boss'|'complete')` 跳转到固定状态（视觉基线用）。
- `setPausedForScreenshot` / `setReducedMotion` / `hideDebugUi` 冻结环境动效以稳定截图。
- `testBuy / testReroll / testPlace / testStartBattle / testPickReward / testSell / testInject` 直接驱动自走棋循环（机器人用，断言经济 / 升星 / 联动数值）。

`window.__THREE_GAME_DIAGNOSTICS__` 每帧发布：帧号、分数、阳光、防线血量、波次、阶段、存活植物/敌人数、场上星级总数、渲染器开销（draw calls / 三角面 / 几何体 / 纹理）。

## 目录结构

```
garden-autochess-glm/
├── index.html              # 单页 DOM（中文 HUD / 商店 / 备战台 / 奖励卡 / 模态）
├── src/
│   ├── main.ts             # 入口
│   ├── styles.css          # 花园主题 / 响应式 / 移动端安全
│   ├── core/               # Loop, Renderer
│   ├── utils/              # random(种子), dispose, feel(缓动/震屏/FOV)
│   ├── game/
│   │   ├── types.ts        # 网格常量 / 植物敌人定义类型 / 阶段
│   │   ├── content.ts      # 12 植物 / 8 敌人 / 3 BOSS / 嫁接 / 变异 / 遗物 / 天气 / 15 波
│   │   └── Game.ts         # 编排器：阶段循环 / 商店 / 摆阵 / 合成 / 战斗结算 / 联动 / 奖励 / 输入 / 钩子
│   ├── systems/            # CameraRig, Hud, AudioSystem, EffectsSystem, DebugTools
│   └── entities/           # Plant, Enemy, Projectile, SunPickup, meshes(程序化模型)
├── tests/                  # visual / visual-regression / bot-playtest（含模板）
├── scripts/                # inspect-threejs-canvas.mjs
└── playwright.config.ts    # workers:1, desktop-chrome + mobile-chrome
```

## 边界

所有文件与操作限制在本目录（`garden-autochess-glm/`）内，不修改、覆盖或删除父项目已有内容。未确认不 push、不建 PR。
