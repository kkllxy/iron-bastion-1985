# 质量报告 · 末日花园自走棋

> 本报告记录开发完成后的实际验证命令与结果。所有结论均有可复现的命令与诊断证据。
> **工具选择**（按 `../AGENTS.md`）：本次以 **Playwright** 为唯一确定性硬门禁；Midscene.js / Chrome DevTools MCP 未启用（无 Console/性能问题，无需根因诊断）。

## 一、验证命令与硬门禁结果

| 验证项 | 命令 | 结果 |
|--------|------|------|
| TypeScript 类型 | `npx tsc --noEmit` | ✅ 通过（strict + noUnusedLocals/Parameters） |
| 生产构建 | `npm run build` | ✅ 通过，633.8 KB JS / 165.6 KB gzip |
| 全套 Playwright | `npm test` | ✅ **16 passed, 2 skipped, 0 failed**（36.8s） |
| 画布非空 + 中文 + 交互 | `npm run verify:visual` | ✅ 通过（标题/中文文案/购买摆放开战，桌面+移动） |
| 视觉回归基线 | `npm run verify:baselines` | ✅ 通过（active-play / boss / complete × 桌面+移动，6 张基线） |
| 机器人游玩 + 闭环 + 确定性 | `npm run verify:bot` | ✅ 通过 |
| 画布像素 + 渲染预算 | `npm run inspect:canvas` | ✅ 通过 |

> `2 skipped` 为移动端的机器人/确定性测试——它们按设计 `test.skip(project !== 'desktop-chrome')`（机器人用键盘/钩子驱动；移动端触控由 `visual.spec.ts` 覆盖）。

## 二、画布检查器证据（`scripts/inspect-threejs-canvas.mjs`）

**GPU**：`ANGLE (Apple, ANGLE Metal Renderer: Apple M2)` —— `softwareRendered: false`（真实 GPU，非 SwiftShader 软件回退；FPS/帧时间证据有效）。
**Console / Page error**：`[]`（无错误）。

| 模式 | draw calls | 三角面 | 几何体 | 纹理 | 预算 | 达标 |
|------|-----------|--------|--------|------|------|------|
| desktop (active-play) | 112 | 6,642 | 61 | 4 | 300 / 750k / 300 / 60 | ✅ |
| mobile (active-play) | 53 | 2,578 | 49 | 4 | 150 / 300k / 200 / 40 | ✅ |

（预算为起始参考值，见 `threejs-aaa-graphics-builder` references；实际开销远低于上限。）

## 三、机器人游玩与完整闭环（确定性）

`bot-playtest.spec.ts` 三项：

1. **机器人烟雾**：固定 seed 2024，购买→摆放→开战；断言帧前进 >100、放置数 >0、场上植物 >0、场上星级 ≥ 放置数，全程无 page/console error。✅
2. **完整自走棋闭环**：固定 seed 31337，注入阵容→开战→**清空第 1 波**（断言 `phase ∈ {reward,prep}`、`score ≥ 200` 含击杀分+清波奖励、防线未破）→**选奖励**→断言进入第 2 波备战（`phase=prep, wave=2`）。✅ 这条覆盖了经济→升星→自动战斗结算→波次推进→奖励→下一波的完整闭环。
3. **确定性**：同一 seed 99 两次 `setState('prep')`，商店 5 槽 `data-plant` 完全一致。✅

## 四、中文渲染校验

`visual.spec.ts · 中文文案正确渲染` 断言（DOM 文本，确定性）：
- 顶部 HUD：`防线血量`、`波次`、阳光数值可见。
- 备战面板按钮：`开始本波`、`刷新`、`锁定` 文案存在。
- 商店槽 `.shop-name` 有非空中文名。
- 标题模态：`末日花园自走棋`。
全部 ✅（中文字体回退 `PingFang SC / Hiragino Sans GB / Microsoft YaHeI / Noto Sans CJK SC`，无方块/乱码）。
视觉基线（`visual-regression.spec.ts`）在桌面与移动端进一步校验文案不溢出、不被遮挡。

## 五、确定性钩子

所有玩法随机走固定种子 RNG（`utils/random.ts · createSeededRandom`，mulberry32）。`window.__THREE_GAME_TEST_HOOKS__` 用 `Object.defineProperty` getter 锁定，读取始终返回本游戏钩子，杜绝外部覆盖；`window.__THREE_GAME_DIAGNOSTICS__` 每帧发布帧号/分数/阳光/防线血量/波次/阶段/存活数/星级/渲染开销。

## 六、未验证项与剩余风险

- **Midscene.js 视觉语义判断**：未配置模型 API Key，按 `AGENTS.md` 跳过（不阻塞硬门禁）。植物/怪物辨识度依赖人工目视基线（已生成 6 张桌面+移动基线供回归）。
- **真实玩家手感/难度曲线**：机器人验证了循环可通，但单局 12～18 分钟的完整 15 波平衡未做大规模对局调优；首版数值见 `content.ts`，可按需微调。
- **音频**：程序化 Web Audio（无素材），需用户手势解锁（已挂 pointerdown/keydown 解锁）。

## 七、复现步骤

```bash
cd garden-autochess-glm
npm install
npx playwright install chromium        # channel:'chromium' 需系统 Chromium
npm test                                # 16 passed, 2 skipped
npm run inspect:canvas                  # 渲染预算证据
npm run build                           # 生产构建
```
