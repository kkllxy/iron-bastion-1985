# 夜枭行动 · 质量报告（QUALITY_REPORT）

> 致敬 1987 FC《燃烧战车 / 合金装备》潜行谍报玩法的原创 3D 潜行动作游戏。
> 所有新文件均在 `burning-saboteur-87-glm/` 子目录内，未修改父目录任何内容。

## 执行命令与硬门禁结果

| 命令 | 用途 | 结果 |
| --- | --- | --- |
| `npm run build` | tsc 类型检查 + 生产构建 | ✅ 通过（JS 588.9 kB / gzip 152.4 kB） |
| `npm test` | Playwright 全量（desktop + mobile） | ✅ 20/20 通过 |
| `npm run verify:visual` | 画布非空 + 可控 + 中文 HUD | ✅ 通过 |
| `npm run verify:baselines` | 桌面/移动视觉基线 | ✅ 6/6 通过 |
| `npm run verify:bot` | 机器人游玩 + BOSS 破坏 | ✅ 通过 |
| `npm run inspect:canvas` | 画布像素 + 渲染预算 | ✅ 非空、均在预算内、无 console/page error |

运行地址：开发 `http://127.0.0.1:5188`，生产预览 `http://127.0.0.1:4188`。
GPU：`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)`（真 GPU，非 SwiftShader）。

## game design brief（游戏设计简报）

- 玩家承诺：扮演潜入特工「夜枭」，孤身渗透「铁幕军团」核武基地，靠潜行与解谜而非蛮力推进。
- 目标感受：紧张、压抑、冷峻军事氛围；被发现时的通缉压迫感。
- 主要动词：潜行移动（贴墙/蹲伏降低被发现）。
- 目标：救出俘虏、收集分级钥匙卡与情报、摧毁最终核武步行兵器。
- 压力：巡逻兵视线锥、监控摄像头、重装守卫、狙击手激光、最终 BOSS。
- 奖励/推进：钥匙卡开门进入下一区域、口粮回血、炸药破 BOSS。
- 失败/重开：血量归零扣命；命尽则失败结算 → 重开。
- 非目标：不做开放世界、多人、原作素材复刻。

## core loop（核心循环契约）

潜行移动 → 观察/绕开视线锥 →（拾取/制服/解谜开门）→ 进入下一区域 → …… → BOSS 解谜破坏（导弹荚 → 核心反应堆）→ 胜利。

## level/encounter plan（关卡/遭遇计划）

- 区域 1「基地外围」：开阔+掩体，3 巡逻兵 + 2 摄像头，拾 1 级钥匙卡，东闸门撤离。第一威胁=视线锥；第一奖励=卡 1。
- 区域 2「内部建筑」：走廊房间，重装守卫 + 狙击手 + 巡逻兵 + 摄像头，救俘虏，拾 2 级钥匙卡。
- 区域 3「地下核武库」：步行兵器「铁狱」BOSS 战，拾炸药，依次摧毁双导弹荚 + 核心反应堆，躲避弹幕与冲撞。

## Skill-loading ledger（技能加载台账）

- Director：active（`threejs-game-director`，loaded，全程按其 phase playbook 执行）。
- Gameplay systems：yes，loaded `threejs-gameplay-systems/SKILL.md` + `references/gameplay-workflows.md`（架构/输入/碰撞/手感/诊断）。
- AAA graphics：loaded `threejs-aaa-graphics-builder`（按其视觉记分卡与材质/光照/VFX 指引；详见记分卡）。
- UI：loaded `threejs-game-ui-designer`（HUD/响应式/安全区/中文可读性）。
- Debug/profile：loaded `threejs-debug-profiler`（画布/运行时/移动端检查）。
- QA/release：loaded `threejs-qa-release`（画布像素/机器人/视觉基线/生产预览）。
- 3d generator：loaded（`threejs-3d-generator/SKILL.md`）；因凭证 MISSING 未实际生成（见下）。
- image generator：loaded（`threejs-image-generator/SKILL.md`）；因凭证 MISSING 未实际生成。
- audio generator：loaded（`threejs-audio-generator/SKILL.md`）；因凭证 MISSING，改用程序化 WebAudio 合成。

## reference ledger（参考台账）

- gameplay-workflows.md：yes。
- game-design-level-design / game-feel / new-game-definition-of-done：yes（按其检查项落地闭环、手感、失败重开）。
- visual-scorecard / implementation-blueprint / model-recipes / render-recipes / shader-cookbook / technical-art：yes（记分卡见下）。
- ui-patterns / hud-readability / responsive-ui-fit：yes。
- debug-profile / scene-debugging / performance-profile：yes。
- qa-release / visual-verification / playtest-qa / release / visual-test-harness / bot-playtest：yes。
- 3d/image/audio generator references：loaded（用于判断是否需要外部资产；结论=凭证缺失，程序化）。

## External asset sourcing（外部资产采购台账）

- credential probe output（凭证探测，逐行原文）：

```
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
ELEVENLABS_API_KEY=MISSING
```

- hero/player source：程序化（capsule+装备+面朝指示+纸箱网格）。3d generator 与 image generator 凭证均 MISSING，属真实 blocker。
- obstacles/enemies source：程序化（巡逻兵/摄像头/重装/狙击手 + 视线锥可视化 + 激光瞄准）。
- rewards/interactables source：程序化（钥匙卡/口粮/炸药/人质 + 光环 + 点光）。
- world/sky/background source：程序化（实例化墙体、混凝土/金属板/警示条纹 CanvasTexture、分区雾与光照气氛）。
- materials/textures/decals source：程序化 CanvasTexture（混凝土接缝、金属铆钉面板、警示斜纹）。
- logos/icons/GUI art source：程序化（内联 SVG favicon、CSS 图标化按钮）。
- audio/SFX/voice source：程序化 WebAudio（见下 audio 章节）。
- chosen sources per surface：全部 procedural（因 TRIPO/GEMINI/ELEVENLABS 三凭证 MISSING，构成真实 blocker，非 "not-needed"）。
- external assets generated：no — 三凭证 MISSING，无法调用 3d generator / image generator。
- audio assets generated：no（无外部音频文件）；改用 WebAudio 现场合成 SFX + 程序化 BGM。

> 说明：hero 与 boss 等关键面为程序化几何（斜面/挤出/胶囊/锥体/光晕），未达到外部高模水准；这是凭证缺失下的真实妥协，记为残留风险，非"已完成"。

## 视觉记分卡（visual scorecard，1–3 分，附 measured evidence）

| 类目 | 分 | 证据 / 说明 |
| --- | --- | --- |
| art direction | 2 | 冷峻军事暗色调（#07090c）+ 分区雾/光气氛；警示黄红点缀；统一 PBR。 |
| hero/player | 2 | capsule 躯干+头盔+护甲+蓝色面朝楔形+红色识别条；纸箱伪装切换。程序化，无高模。 |
| obstacles/enemies | 3 | 4 类敌人各自建模 + 视线锥可视化（绿/黄/红随警戒变色）+ 狙击激光 + 摄像头扫描。 |
| rewards/interactables | 3 | 钥匙卡/口粮/炸药/人质各自造型 + 光环 + 点光 + 旋转；互动提示。 |
| world/environment | 2 | 实例化墙、混凝土/金属 CanvasTexture、战术网格线、出口门+光圈；区域气氛差异。 |
| materials/textures | 2 | 程序化 CanvasTexture（接缝/铆钉/警示）；PBR metalness/roughness；未用外部贴图。 |
| lighting/render | 3 | HemisphereLight + 阴影 DirectionalLight（2048 阴影图）+ 分区点光（地下红色警戒/核心蓝光）+ ACES tone mapping + 雾。 |
| vfx/motion | 3 | 视线锥、警戒闪烁（exposure pulse）、爆炸（闪光+扩散环+碎片+点光）、命中火花、纸箱切换、相机震动/FOV。 |
| ui/hud | 3 | 全中文 HUD（血条/命数/装备/钥匙卡/口粮/炸药/警戒/区域/计分/兵器部位）+ 几何雷达小地图（无 canvas 文字规避字体问题）+ 任务/互动提示 + 5 键触屏。 |
| performance evidence | 3 | measured evidence：桌面 11 calls/1946 tris（出生点角落大量视锥剔除）、BOSS 25 calls/2370 tris；均在 render budget 内（calls≤300/150，tris≤750k/300k）。 |

average（均分）= (2+2+3+3+2+2+3+3+3+3)/10 = **2.6**（≥ 2.3 门槛，无类目 <2）。

automatic failures remaining（剩余自动失败项）：

- 无外部高模/贴图/音频（三凭证 MISSING blocker）——hero/boss/world 仍为程序化，离 AAA 高模有差距。
- fresh-eyes review：当前模型不支持读图、Midscene/图像凭证缺失，无法做人类语义级 fresh-eyes 复核；以 measured evidence（像素边密度/熵/对比度/色桶）替代，详见下。属已报告的残留风险。

### measured evidence（像素指标，来自 inspect-threejs-canvas）

| 帧 | edgeDensity | entropyBits | colorBuckets | contrast | nonBgShare |
| --- | --- | --- | --- | --- | --- |
| 桌面 active-play | 0.052 | 1.53 | 61 | 18.1 | 0.524 |
| 移动 active-play | 0.108 | 2.05 | 108 | 49.7 | 0.363 |
| 桌面 BOSS | 0.060 | 0.99 | 70 | 21.8 | 0.151 |

（出生点角落帧因视锥剔除偏稀疏；移动端采样帧最丰富。）

## technical art（技术美术）

- render budget（目标 vs 实际）：桌面 calls 11/300、tris 1,946/750,000、geometries 19/300、textures 5/60；移动 calls 9/150、tris 1,910/300,000；全部达标。
- 策略：墙体 InstancedMesh（1 draw call）、子弹/特效对象池、视锥剔除、DPR 上限 2、PCFSoft→PCF 阴影、雾近远按区分级。
- vfx readability（可读性）：视线锥颜色随警戒态变化、警戒全屏红脉冲、命中火花、爆炸光圈、纸箱切换、玩家面朝楔形与敌我识别条区分敌我。

## audio（音频）

- audio generator 凭证：`ELEVENLABS_API_KEY=MISSING`（真实 blocker），未生成外部音频文件。
- 替代方案：WebAudio 现场合成——枪声（噪声+方波）、镇静制服、拾取/钥匙卡/救俘虏、警报双音、爆炸、受伤、开门、BOSS 命中、纸箱、脚步、UI、胜利/失败音阶；程序化 BGM（低频脉冲+稀疏琶音，警戒时升压/升速/滤波）。
- 自动静音切换（🔊/🔇），首选手势解锁 AudioContext。

## 视觉测试基线（visual test harness）

- 决策：建立 Playwright 截图基线 `tests/visual-regression.spec.ts-snapshots/`，覆盖 desktop/mobile 的菜单（静态严格比对 2%）与暂停游玩帧（容差 8%）；BOSS 帧存档至 `artifacts/` 供人工复核。
- 确定性：固定 seed、reduced-motion、paused-for-screenshot、hideDebugUi 后采集；单 worker 避免 GPU 争用导致时间漂移。
- 中文渲染硬门禁：`tests/chinese-text.spec.ts` 用「同长异字串像素签名比对」判定非方块（tofu），并校验 HUD 字符串正确、无溢出遮挡。

## Phase ledger（阶段台账）

- gameplay systems：done — 完整闭环（开始/游玩/胜负/重开/区域推进/BOSS）。
- external asset sourcing：done（blocker）— 三凭证 MISSING，全部程序化 + WebAudio。
- AAA graphics：done（带残留风险）— 记分卡均分 2.6，无类目 <2，但无外部高模。
- UI：done — 全中文、桌面/移动响应式、5 键触屏、雷达、安全区。
- debug/profile：done — 画布非空、无 console/page error、渲染预算达标。
- qa/release：done — 20/20 测试通过、生产构建 + 预览 200。

## 验证证据（verification）

- build：`tsc && vite build` 通过。
- console / page error：全量 Playwright 断言 `consoleErrors==[] && pageErrors==[]`，通过。
- desktop + mobile：两工程均跑通（Desktop Chrome 1280×720 / iPhone 13 chromium 真 GPU）。
- screenshot：`artifacts/{desktop,mobile}-chrome-visual.png`、`artifacts/inspect/*.png`、基线快照。
- canvas 非空：inspect-threejs-canvas `ok:true`（variance 255、色桶 35–108）。
- pixel：见 measured evidence 表。
- 机器人：探索存活 + BOSS 部位被破坏（progress 推进至 1/3–3/3）。

## 残留风险与未验证项

- 无外部 AI 资产（3D/图像/音频）——需配置 TRIPO/GEMINI/ELEVENLABS 凭证后可升级 hero/boss/world 视觉与音质。
- 中文渲染依赖系统 CJK 字体（macOS PingFang SC / Windows Microsoft YaHei / Linux 文泉微等）；已用像素签名测试验证无方块，但无 CJK 字体的极端环境仍会回退。
- fresh-eyes 人类语义复核未做（无图像能力模型/Midscene 凭证）。
- 未 push、未建 PR、未改动父目录。

## 文件清单（均在 burning-saboteur-87-glm/ 内）

源码 `src/`：core(Loop/Renderer/InputController)、game(Game/types/levels/Vision/AlertSystem)、entities(Player/Enemy/Boss/Projectiles/Pickups/Effects)、systems(GridMap/CameraRig/Hud/AudioSystem/DebugTools)、assets(Materials/World)、main.ts、styles.css。
测试 `tests/`：visual / chinese-text / bot-playtest / visual-regression。脚本 `scripts/inspect-threejs-canvas.mjs`。
