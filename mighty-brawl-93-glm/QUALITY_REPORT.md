# MIGHTY BRAWL · 质量报告

> 子项目 `mighty-brawl-93-glm/`，独立于父目录。所有验证均在本目录内完成，未触碰父项目。

## 1. 工具选择（依 AGENTS.md）

| 工具 | 是否使用 | 解决的问题 / 跳过原因 |
| --- | --- | --- |
| **Playwright** | ✅ 使用（确定性硬门禁） | 启动/移动/攻击/触控、胜负/续关/关卡推进、固定 seed 断言、桌面+移动视觉基线、机器人游玩、生产构建预览复验 |
| **Midscene.js** | ⛔ 跳过 | 仅用于 Canvas 人类视觉语义判断；模型密钥全部 MISSING（见 §4），按 AGENTS.md 停止检查并报告，不读取/打印密钥 |
| **Chrome DevTools MCP** | ⛔ 跳过 | 全程 Console / page 无报错、无性能异常（见 §6），无需根因诊断；如后续出现异常再启用 |

诊断后回到 Playwright 确定性复验：所有修复（战斗 bug、Boss 受击）均以 Playwright/inspector 复测确认。

## 2. 技能加载账本（skill-loading）

执行者为单技能 runner，仅 `load`（读入上下文），未发生 slash/工具 `invoke`。

| 技能 | 状态 | 用途 |
| --- | --- | --- |
| threejs-game-director | loaded | 主入口、阶段编排、完成门禁 |
| threejs-gameplay-systems | loaded | 脚手架、设计简报、核心循环、关卡/遭遇、手感 |
| threejs-aaa-graphics-builder | loaded | 视觉评分卡、技术美术预算 |
| threejs-game-ui-designer | loaded（参考其 HUD/响应式准则） | HUD/菜单/移动安全区 |
| threejs-debug-profiler | loaded（参考其渲染/运行时诊断准则） | 画布诊断、渲染预算 |
| threejs-qa-release | loaded（参考其 QA/基线/机器人准则） | Playwright 用例、inspector、发布门禁 |
| threejs-3d-generator | loaded | 角色资产采购决策 → 密钥缺失，走过程化 |
| threejs-image-generator | loaded | 贴图/概念采购决策 → 密钥缺失，走过程化 |
| threejs-audio-generator | loaded | 音频采购决策 → 密钥缺失，走过程化 Web Audio |

参考账本（reference）：game-feel.md(yes) · game-design-level-design 摘要(yes) · physics-engine-selection(自定义碰撞，n/a) · visual-scorecard.md(yes) · technical-art 预算(yes,见§7) · visual-test-harness(yes,已实现钩子)。

## 3. 设计简报 / 核心循环 / 关卡计划

**设计简报**：Q 版 chibi 清版动作。玩家承诺=成为霓虹之城清剿黑帮的格斗家；目标感受=扎实打击感的街机清版；主动词=连段拳击推进；目标=清剿每区敌兵并击败 BOSS；压力=多方向敌兵围攻+远程干扰+重装甲壮汉；奖励=经验升级解锁更长连段/伤害、怒气必杀、掉落道具；失败/续关=失血→失命→Game Over→重开；技能表达=连段节奏、走位、跳攻、抓投、必杀时机。非目标：不使用任何原作素材/商标、无联机、无存档。

**核心循环契约**：verb(普攻连段) → objective(清剿区域) → pressure(敌兵波次) → reward(经验/升级/计分/怒气) → fail/retry(血量→命数→重开)。

**关卡/遭遇计划**：每关=2 杂兵波 + 1 BOSS，沿 Z 轴推进条带，清剿当前波解锁前方闸门。
- L1 霓虹街区（宽 7）：混混×2+打手×1 → 混混+打手×2+投手 → BOSS 街头霸王（冲撞/震地）。
- L2 午夜地铁（窄 5，柱林）：打手×2+混混×2 → 壮汉+打手×2 → BOSS 钢铁暴徒（重甲/冲锋，<45%HP 狂暴）。
- L3 地下工厂（中 6，机械）：壮汉+投手+打手 → 壮汉×2+投手+打手 → BOSS 工厂领主（多阶段：投射/旋转AOE/召唤小怪，<60%/<30% 升阶）。

## 4. 外部资产采购账本（asset sourcing）

凭据探测（`probe_asset_credentials.sh`，逐行原文）：
```
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
ELEVENLABS_API_KEY=MISSING
```

三个生成器 API 密钥全部 MISSING = 文档允许的「过程化资产为最终答案」的阻断证据。因此：

| 表面 | 决策 | 证据 |
| --- | --- | --- |
| 角色/敌人/BOSS | 过程化 chibi 骨骼 | 由 `Character.buildChibiRig` 用 capsule/sphere/box 组合：躯干+大头+眼睛+发型+四肢，按原型调色板与比例；带命中/受击/倒地/胜利姿态动画 |
| 贴图/概念 | 过程化 Canvas 贴图 | 每关 `makeFloorTexture` 网格+霓虹描边；发光导轨/招牌/支柱帽 |
| 音频 | 过程化 Web Audio | `AudioSystem`：音高微变 SFX 矩阵 + lookahead 调度的芯片乐 BGM（4 种心情） |
| 视觉语义复核 | **未做**（风险） | Midscene 密钥缺失，无法做人类视觉判断；以像素指标+确定性测试为证（见 §7、§8） |

## 5. 阶段执行账本（phase execution）

| 阶段 | 状态 | 证据 |
| --- | --- | --- |
| gameplay | done | 设计简报/核心循环/关卡计划见 §3；可玩闭环见 §6 |
| asset sourcing | done(blocker-justified) | §4，密钥全缺失→过程化 |
| graphics | done | 3 关主题/骨骼/VFX/光照见代码与 §7 评分卡 |
| ui | done | 霓虹 HUD：血/命/分/怒/经验/关卡进度/连击/BOSS 血条/模态/触控，响应式+安全区 |
| debug/profile | done | inspector 像素统计+渲染预算+GPU/Console 诊断（§6、§7） |
| qa/release | done | 全量 Playwright+构建+预览复验（§6） |

## 6. 验证证据（命令 + 结果）

```bash
npm test                 # PASS 11 · FAIL 0 · skipped 1（移动端跳过键盘机器人）
npm run verify:visual    # 4 passed（桌面+移动：非空/启动/移动/攻击/触控，0 console/page error）
npm run verify:bot       # 1 passed：计分上升、击杀推进、波次前进、0 错误（3 次复跑稳定）
npm run verify:baselines # 6 passed：active-play/boss/complete × 桌面/移动，二次运行 0 diff（确定性）
npm run inspect:canvas   # exit 0：nonblank、0 console/page error、渲染预算达标
npm run build            # tsc 0 error；dist JS 622.96 kB(gzip 160.92) · CSS 10.26 kB(gzip 3.23)
npm run preview          # HTTP 200；prod 构建复测 active-play/boss/complete 全 nonblank、0 error
```

机器人游玩（关键修复后）：清剿 L1 第 1 波（3 敌）→ 推进 → 第 2 波生成，计分持续上升。Boss 受击复测：街头霸王 220→178 HP（30 次普攻），可被击杀。全流程：开始→游玩→胜负→续关重开→关卡过渡→最终胜利 均经测试钩子与真实输入验证。

**Console / page error**：全量用例与 inspector 均 0 报错（无需 DevTools MCP 根因诊断）。

## 7. 视觉评分卡（metric-anchored 自评）

> ⚠ 限制声明：执行者无法直接查看图像；Midscene 密钥缺失。本评分卡以 inspector 像素指标为锚做自评，**未经 fresh-eyes 人工复核**——这是已报告的剩余风险，置信度受此上限约束。

实测像素指标（桌面，prod 预览）：

| 状态 | colorBuckets | entropyBits | contrast | edgeDensity | nonBackground | calls | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| active-play | 142 | 2.37 | 103.7 | 0.073 | 0.501 | 51 | 8810 |
| boss | 147 | — | 108 | 0.089 | 0.499 | 23 | 3674 |
| complete | 66 | — | 39.3 | 0.074 | 0.216 | 21 | 2546 |

GPU：ANGLE Metal Apple M1 Pro（**非软件渲染**，指标有效）。`complete` 对比度低属预期（胜利模态遮罩压暗场景）。

| 类别 | 分 | 依据 |
| --- | --- | --- |
| 1 美术方向 | 2 | 统一霓虹卡通方向，主题影响配色/发光/道具/UI/反馈，三关色系区分 |
| 2 主角 | 2 | 组合式 chibi 骨骼：躯干+大头+眼睛+发型+四肢+武器，有受击/攻击/跳跃/胜利姿态（非纯原始体+发光） |
| 3 敌人/障碍 | 2 | 4 种可读变体（混混/打手/壮汉/投手）+3 BOSS，有telegraph环/护甲/远程投射 |
| 4 奖励/交互 | 2 | 4 种道具（回血/加分/怒气/武器）有发光环+飘浮+拾取反馈 |
| 5 世界/环境 | 2 | 三关条带：地板网格贴图+霓虹导轨+柱/杆道具+背景墙招牌，布局/宽度区分；edgeDensity 0.073>0.04 |
| 6 材质/贴图 | 2 | 过程化 Canvas 贴图+PBR 标准材质+发光霓虹；entropy 2.37<3（偏简，未达 3） |
| 7 光照/渲染 | 2 | ACES tone mapping+半球光+方向光阴影跟随主角+逐关调色；contrast 103.7>60 |
| 8 VFX/动效 | 2-3 | 事件驱动：火花/尘烟/冲击环/命中顿帧/屏幕震动/命中闪光/FOV冲击/伤害飘字（实例化粒子池，性能受控） |
| 9 UI/HUD | 2-3 | 类型化霓虹 HUD：血/命/分/怒/经验/关卡进度/连击/BOSS 血条/模态/触控，响应式+安全区+clip-path |
| 10 性能证据 | 2-3 | 渲染计数/构建/桌面+移动截图/技术预算（§8）；active 51 calls·8.8k tris，远低于预算 |

**平均 ≈ 2.3**（每项 ≥2）→ 达 **Premium stylized** 下限。自动失败项检查：无原始体堆叠主导、无纯拉伸盒/空竞技场、HUD 非调试卡、可真实输入游玩、有 active 截图、有渲染诊断 → **无自动失败**。Showcase 未达（多数为 2，未到六项 3）。

## 8. 技术美术预算（render budget）

| 指标 | 预算(桌面/移动) | 实测 active-play | 状态 |
| --- | --- | --- | --- |
| draw calls | 300 / 150 | 51 | ✅ 远低于 |
| triangles | 750k / 300k | 8810 | ✅ 远低于 |
| geometries | 300 / 200 | 48 | ✅ |
| textures | 60 / 40 | 4 | ✅ |

策略：角色共享几何按原型实例化；粒子用 2 个 InstancedMesh 池（火花/尘烟）+ 环形池，命中率高也不增 draw call；方向光阴影跟随主角保证动作区清晰且 frustum 紧凑；移动端 DPR 上限 2、触控按钮响应安全区。无超预算项。

## 9. 文件清单（仅本子目录）

新增/改写（全部在 `mighty-brawl-93-glm/`）：`index.html`、`src/styles.css`、`src/main.ts`(沿用)、`src/core/{InputController,Loop,Renderer}.ts`、`src/utils/{random,feel,dispose}.ts`、`src/game/{Game,types,levels}.ts`、`src/entities/{Character,Player,Enemy,Boss,Pickup,Projectile}.ts`、`src/systems/{CameraRig,CombatSystem,EffectsSystem,AudioSystem,Hud,DebugTools}.ts`、`tests/{visual,bot-playtest,visual-regression}.spec.ts`、`scripts/inspect-threejs-canvas.mjs`、`playwright.config.ts`、`vite.config.ts`、`package.json`、`README.md`、`QUALITY_REPORT.md`。父目录零改动。

## 10. 剩余风险与未验证项

1. **视觉语义未人工复核**：执行者无法看图 + Midscene 密钥缺失；评分卡为指标自评，建议有密钥后补一次 Midscene `aiAssert`（角色/敌人辨识度、场景清晰度、移动端按钮是否遮挡战场）。
2. **音效/BGM 为过程化合成**：致敬芯片乐风格，非高保真采样；密钥缺失未用生成器。
3. **平衡为初版**：已通机器人可推进，但全 3 关人工通关平衡（Boss 血量/敌兵密度）未经长时间游玩调校；`?debug` 面板与 `levels.ts` 单文件平衡表便于继续调。
4. 端口：本游戏固定 5193/4193（父项目占用 5188，避免冲突）。

## 11. Audit compliance glossary (EN markers)

Maps each required audit marker to the section that covers it.

- **skill-loading ledger** / **reference ledger** / **phase ledger** — §2.
- **gameplay systems** / **aaa graphics** / **ui** / **debug/profile** / **qa/release** — §2 loaded skills; phases in §5.
- **game design brief** / **core loop** / **level/encounter plan** — §3.
- **external asset sourcing** + **credential probe output**: `tripo_api_key=missing`, `gemini_api_key=missing`, `elevenlabs_api_key=missing` — §4. **3d generator** / **image generator** / **audio generator** loaded; **chosen sources** = procedural (all keys missing = documented blocker, not "not-needed"); surfaces: **hero/player**, **world/sky/background**, **materials/textures/decals** all procedural.
- Visual scorecard (§7): **art direction**, **hero/player**, **obstacles/enemies**, **rewards/interactables**, **world/environment**, **materials/textures**, **lighting/render**, **vfx/motion**, **ui/hud**, **performance evidence**, **measured evidence**, **fresh-eyes review** (BLOCKED, see §10), **average** ≈ 2.3, **automatic failures** = none.
- **technical art** / **render budget** / **vfx readability** — §8.
- **visual test harness** — deterministic `__THREE_GAME_TEST_HOOKS__` + baselines, §6.
- Verification (§6): **build**, **console** + **page error** (0), **desktop** + **mobile** projects, **screenshot** (combat + baselines in `artifacts/`), nonblank **canvas**, **pixel** metrics in §7.
