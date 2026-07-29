# 钢铁堡垒 1985：全流程质量报告

## QA result

PASS。项目完成了玩法、外部素材决策、图形、UI、调试/性能和 QA/release 六个阶段；生产依赖审计为 0 漏洞。外部 AI 素材生成因三个凭据均缺失而按允许规则回退到原创程序化资产，这一项是已记录的素材来源限制，不是运行阻塞。

## Game design brief

- Player promise：驾驶一辆灵活的守卫坦克，连续穿越三张可被炮火逐步改写的立体战场并保住雄鹰基地。
- Target feeling：精确、紧张、清晰，保留 8 位机四向移动的节奏，同时用现代命中反馈增强重量。
- Primary verb：移动、定向、开火。
- Secondary verbs：利用砖墙开路、穿越树林、争夺反应装甲与装填加速。
- Objective：依次肃清 8 / 10 / 12 辆敌军并保证每个战区的基地存活；第 3 关完成才最终胜利。
- Pressure：最多 4 辆桌面敌军或 3 辆移动端敌军同时推进；侦察、突击、重装三种速度/生命/外形组合；敌方会在轴线对齐时射击。
- Reward/progression：每 3 次击毁生成一次增益；每关三波，前两关肃清后自动转进下一张地图。
- Fail/retry：3 条命；基地被击毁或生命归零时失败；`R` 或面板按钮立即重开。
- Skill expression：轴线预瞄、利用钢墙与水域分割路线、主动击穿砖墙、决定增益拾取时机。
- Readability promise：玩家黄铜色、敌军绿/棕/红、危险红、奖励青/橙；信息同时通过形状、材质、运动、文字和声音表达。
- Non-goals：双人模式、关卡编辑器、联网排行榜、复刻原作名称/商标/像素素材。

## Core loop contract

玩家用四向移动和炮击守住基地；敌军波次和三种地图拓扑制造不同风险；击毁敌军推进关内计数并掉落增益；生命耗尽或基地失守即失败，肃清当前战区后推进，完成第 3 关即胜利；失败和手动重开均从当前关快速恢复。

## Level and encounter plan

- Spatial format：3 张 13×13 模块化俯视战场，2 world units/格，四周有实体边界；运行时校验尺寸与唯一基地。
- Player start：基地正上方，具有直达中场的中心走廊。
- First decision：守中心轴、向左右砖墙开路，或穿过树林抢射击角度。
- First threat：开局左右两处出生台各有一辆敌军，随后按波次补充。
- First reward：第 3 次击毁生成反应装甲；第 6 次击毁生成装填加速。
- Landmarks：三处树林、四块水域、八座钢制掩体、底部雄鹰基地、顶部三座出生台。
- Escalation：三关配额为 8 / 10 / 12；最大同时敌军为桌面 3 / 4 / 4、移动端均为 3；出生间隔从 1.35–2.05 秒收紧至 0.85–1.4 秒，敌速倍率从 1.0 提升到 1.12，并逐关增加突击/重装比例。
- Map rhythm：边境壁垒以对称砖墙教会开路；钢铁水网用两条纵向水道制造绕行与射击通道；熔炉围城用钢墙、砖墙环和中心树林压缩安全路线。
- Recovery beats：玩家损失后 1.05 秒重新部署并获得 2.4 秒闪烁无敌；增益提供 10 秒窗口。
- Failure readability：基地爆炸、全屏亮度冲击、HUD 红灯、失败面板和下降音效同步。
- Collision choice：轻量自定义 AABB/点盒/半径检测；不引入刚体引擎。坦克实体边界 48 个，炮弹实体边界 44 个；帧增量上限 50ms，高速炮弹速度 17 units/s，在当前最薄障碍尺度下不会跨越 1.76-unit 方块。

## Difficulty and feel tuning

- 玩家速度 6.4 units/s；敌军 2.5–3.7；炮弹 17。
- 普通装填 0.36 秒，增益装填 0.16 秒；敌军装填 1.25–2.15 秒。
- 命中停顿 35ms，玩家损失 90ms；只缩放玩法 delta，不停止渲染。
- Trauma 平方震屏并按 1.7/s 衰减；`prefers-reduced-motion` 与测试钩子可关闭动态噪声。
- 命中、钢墙火花、砖墙破坏、坦克爆炸、增益、失败和胜利均有同步程序化 Web Audio 反馈。
- Fun-factor rejection：前 30 秒存在路线/射击决定；主机制不可被绕过；失败来源可见；奖励改变生存或射速；地图直接塑造轴线和掩体选择。

## Skill-loading ledger

- Director：active；`threejs-game-director/SKILL.md`。
- Gameplay systems：loaded；`threejs-gameplay-systems/SKILL.md`；阶段已执行。
- AAA graphics：loaded；`threejs-aaa-graphics-builder/SKILL.md`；阶段已执行。
- UI：loaded；`threejs-game-ui-designer/SKILL.md`；阶段已执行。
- Debug/profile：loaded；`threejs-debug-profiler/SKILL.md`；阶段已执行。
- QA/release：loaded；`threejs-qa-release/SKILL.md`；阶段已执行。
- 3D generator：loaded；`threejs-3d-generator/SKILL.md`；凭据阻塞后回退。
- Image generator：loaded；`threejs-image-generator/SKILL.md`；凭据阻塞后回退。
- Audio generator：loaded；`threejs-audio-generator/SKILL.md`；凭据阻塞后回退。

注：本运行器读取/加载了兄弟技能文件，并在其规则下执行阶段；没有把文件读取错误描述成独立 slash skill invocation。

## Reference ledger

- Gameplay：yes；`gameplay-workflows.md`、`game-design-level-design.md`、`game-feel.md`、`physics-engine-selection.md`。
- Gameplay checklists：yes；`new-game-definition-of-done.md`、`game-design-level-design.md`、`game-feel.md`。
- Graphics core：yes；`visual-scorecard.md`、`implementation-blueprint.md`、`model-recipes.md`、`render-recipes.md`、`shader-cookbook.md`、`technical-art.md`。
- Graphics checklists：yes；`aaa-game-quality-gate.md`、`aaa-visual-scorecard.md`、`technical-art-quality.md`。
- UI：yes；`ui-patterns.md`、`game-ui-quality.md`、`hud-readability.md`、`responsive-ui-fit.md`、`mobile-input.md`。
- Debug/profile：yes；`debug-profile-checklists.md`、`scene-debugging.md`、`performance-profile.md`、`mobile-input.md`。
- QA/release：yes；`qa-release-checklists.md`、`visual-verification.md`、`playtest-qa.md`、`release.md`。
- Visual harness：yes；`visual-test-harness.md`、`visual-test-harness` checklist。
- Bot playtest：yes；`playtest-bot.md`、`bot-playtest.md` checklist。
- 3D generation：yes；`api-notes.md`、`threejs-integration.md`、`image-generator-workflows.md`。
- Audio generation：yes；`audio-workflows.md`。
- Not needed：endless-runner checklist（非 endless runner）；prompt templates（用户未要求复用提示词）。

## External asset sourcing ledger

- Credential probe output：`TRIPO_API_KEY=MISSING`；`GEMINI_API_KEY=MISSING`；`ELEVENLABS_API_KEY=MISSING`。
- Hero/player source：procedural；分层履带、挤压几何车体、炮塔、炮管、舱盖、天线、灯具、旗标；外部 3D 因 Tripo key 缺失被阻塞。
- Enemies/vehicles/weapons source：procedural；侦察/突击/重装三种材料、速度、生命和附件语言；炮弹和炮口闪光为共享几何。
- Signature props/pickups source：procedural；雄鹰基地、反应装甲环和三联装填器；外部 3D/image 因 key 缺失被阻塞。
- World/sky/background source：procedural；模块化砖/钢/水/树林/边界/哨塔/出生台。
- Materials/textures/decals source：CanvasTexture；砖缝、钢板铆钉、水纹、地面网格与磨损。
- Logos/icons/GUI art source：CSS/DOM/ShapeGeometry；没有使用受版权保护的原作 logo。
- Audio/SFX/voice source：procedural Web Audio；发射、命中、爆炸、拾取、失败、胜利和低频环境底噪；外部 ElevenLabs 因 key 缺失被阻塞。
- Chosen sources per surface：程序化 Three.js + CanvasTexture + CSS + Web Audio。
- External assets generated：no；允许原因是三项 literal credential probe 均为 `MISSING`。
- Audio assets generated：no external file；运行时程序化音频已集成，用户手势解锁、暂停/重开不叠加循环。

## Phase ledger

- Gameplay systems：done；四向移动、射击、敌军 AI、三关九波、地图切换、地形碰撞、增益、生命、基地、胜负和当前关重开均有测试证据。
- External asset sourcing：done with blocker；凭据探针和每表面来源已记录。
- AAA graphics：done；完整可见面升级、共享材质/几何、Canvas 纹理、照明、阴影、VFX、预算和截图已验证。
- UI：done；玩法、暂停、失败、胜利、触控、安全区和固定宽数字状态均覆盖。
- Debug/profile：done；404 外部资源错误和重复几何体根因已修复；预算从桌面 423 calls / 864 geometries 降至 active 171 / 164，移动压力态降至 116 / 105。
- QA/release：done；build、18 项 Playwright、canvas inspector、机器人、生产 preview 均通过。

## Technical art brief and budget

- Art direction：1980s 军事终端、黄铜/橄榄/氧化钢、实体切角面板、离散 CRT 扫描线；表单与材质先于发光。
- Hero surfaces：玩家坦克、三类敌军、雄鹰基地、砖/钢/水/树林、两类增益。
- Support surfaces：边界、地标灯、哨塔、出生台；重复部分共享几何或 Canvas 纹理。
- Material kit：heroBody、heroTrim、track、scout、assault、fortress、enemyTrim、brick、steel、metal、border、signal、hazard、reward、shield、water、foliage、base、playerShell、enemyShell。
- Lighting：1 hemisphere + 1 shadow key + 1 rim；桌面 shadow map 2048，移动 1024；无 full-screen post passes。
- VFX：短生命爆炸碎片、冲击环、炮口闪光、钢墙火花、震屏和命中亮度冲击；移动端碎片数量从 14 降至 5。
- Instancing/LOD/culling：共享炮弹/碎片/环/砖块几何；视锥剔除默认启用；移动端小件 LOD、省略场外哨塔、最多 3 敌军；桌面保留完整小件和 4 敌军。
- Render budget target：桌面 <=300 calls / 750k triangles / 300 geometries / 60 textures；移动 <=150 / 300k / 200 / 40；DPR cap 1.75；1 shadow light；0 post pass。
- Active actual：桌面 171 calls / 5,931 triangles / 164 geometries / 8 textures；移动生产预览 94 / 3,567 / 107 / 8。
- Stress actual：桌面 217 calls / 6,631 triangles / 164 geometries / 8 textures；移动 116 / 4,403 / 105 / 8。
- GPU：ANGLE Metal Renderer，Apple M1 Pro；`softwareRendered=false`。

### VFX readability

每种效果都对应唯一事件和强度层级：炮口闪光指示发射方向；砖屑表示可破坏；冷白火花表示钢墙不可破坏；橙色大爆炸表示单位损失；青/橙收集环对应两种增益。效果短于 550ms、共享几何、不会覆盖下一条射击轴线；移动端把碎片从 14 降到 5，但保留冲击环和声音通道。

## UI state checklist

- Gameplay HUD：3 条生命、基地灯、`LEVEL / WAVE`、关内击毁目标、状态条、增益计时。
- Pause/resume：按钮、`P`、`Esc` 和主操作按钮均可恢复。
- Fail/retry：基地失守/生命耗尽两种文案，`R` 与按钮重开。
- Milestone/win：前两关显示“战区肃清”并支持 2 秒自动转进或立即转进；第 3 关显示任务完成和再战按钮。
- Mobile：390×664 CSS viewport、1170×1992 capture；安全区变量、>=88px 主要触控、Pointer Events、pointercancel/lostcapture/blur 清理。
- Text fit：十二张基线覆盖三关地图、里程碑、最长状态和胜负面板，固定宽数字未发生位移；无剪裁或 HUD/触控重叠。

## Audio matrix

| Event | Source | Runtime behavior |
| --- | --- | --- |
| Fire | square oscillator + filtered noise | 敌我不同音高，逐次事件触发 |
| Brick/steel impact | triangle/square sweep | 钢墙高频、砖墙低频 |
| Explosion | deterministic noise + saw sweep | 重装/基地使用更长尾音 |
| Shield/rapid pickup | 3-note arpeggio | 与 HUD meter 和 VFX 同帧 |
| Life lost/victory | descending / ascending sequence | 与 modal 状态同步 |
| Ambience | quiet 43Hz saw bed | 首次用户手势解锁；dispose 时停止 |

## Visual scorecard

空工作区为 before 0（没有游戏或截图）；after 使用桌面/移动 active、stress、fail、victory 证据。

- Art direction：before 0 / after 3；表单、材质、UI、声音和状态反馈共享军用终端语言。
- Hero/player：before 0 / after 2；挤压车体、履带、炮塔、舱盖/天线/旗标和状态反馈组成清晰轮廓，并使用独立碰撞代理。
- Obstacles/enemies：before 0 / after 2；三类敌军有速度/生命/颜色/附件差异，砖钢水林有不同规则和可读材质。
- Rewards/interactables：before 0 / after 2；反应装甲环与三联装填器有独立造型、漂浮旋转、收集 VFX/音效/HUD。
- World/environment：before 0 / after 2；三张 13×13 作者化布局具有不同水道、掩体、视线和推进节奏。
- Materials/textures：before 0 / after 2；19–21 个共享材料角色，8 张运行纹理，砖缝/铆钉/水纹/磨损均有功能。
- Lighting/render：before 0 / after 2；ACES、IBL、key/fill/rim、接触阴影和轻雾；active 亮度对比桌面 47.3、移动 59.9，保持可读但未达到 showcase 级动态范围。
- VFX/motion：before 0 / after 2；发射、命中、破坏、爆炸、拾取、损失均为事件驱动，stress 预算仍通过。
- UI/HUD：before 0 / after 3；不是网页 dashboard；玩法/暂停/失败/胜利/触控六状态基线、稳定数字和清晰层级。
- Performance evidence：before 0 / after 3；记录优化前后、真实 GPU、active/stress/preview 桌面移动指标、预算和 LOD 取舍。
- Measured evidence：desktop active entropy 3.26 / edge 0.152 / contrast 47.3 / dominant 0.324；mobile preview active 3.21 / 0.222 / 59.9 / 0.530；mobile stress 3.22 / 0.223 / 62 / 0.528。
- Average：2.3 / 3.0。
- Automatic failures remaining：none。active 非 primitive-dominant；世界非空平面；hero 非默认 primitive stack；敌人/奖励不只一个 silhouette；HUD 非 stat cards；无雾/发光遮掩；无 UI overlap；真实输入可玩；有 active screenshot、renderer diagnostics 和 technical-art budget。

## Fresh-eyes adversarial self-review

由于本次模式不允许为未明确请求的子任务启用 subagent，使用规则允许的对抗式自审回退；以下先给每类“只能算 1”的最强理由，再取保守分数。

- Art direction 反方：暗色军用面板和复古扫描线属于常见题材；但语言贯穿世界、UI、音频和反馈，维持 3。
- Hero 反方：主角仍由程序化硬表面构件组成，没有外部精模；因此只给 2。
- Enemies 反方：三类敌军共享底盘；附件/炮塔/生命/速度构成实质差异，但不够 showcase，给 2。
- Rewards 反方：两类奖励较小且在高速战斗中出现短；独立轮廓和完整收集状态足以给 2。
- World 反方：三关仍复用同一座战场的背景、材质和模块；路线变化已经实质影响决策，但未达到完全不同生态场景，因此维持 2。
- Materials 反方：Canvas 纹理分辨率低、没有外部 PBR 贴图；材质角色与功能细节足以给 2。
- Lighting 反方：桌面对比 47.3 低于约 60 的警戒线；仍有完整 key/fill/rim 与可读分离，所以只给 2。
- VFX 反方：没有 GPU 粒子或后处理；事件覆盖完整且压力预算通过，给 2。
- UI 反方：移动端 HUD 占据较大顶部面积；没有遮挡战区或触控，六状态稳定，维持 3。
- Performance 反方：未在真实低端手机上测 FPS；但真实 GPU、预算、优化前后和桌面/移动生产预览证据完整，维持 3；真机 FPS 作为残余风险。

## Visual test harness

- Decision：added。
- States：第 1 / 2 / 3 关 active-play、level-complete、defeat、victory；桌面 Chromium 和 iPhone 13 尺寸的移动 Chromium，共 12 个 baselines。
- Determinism：seed 1985、reduced motion、paused screenshot、隐藏 debug UI；全部玩法随机数走 seeded RNG。
- Update：`npx playwright test tests/visual-regression.spec.ts --update-snapshots`。
- Compare：`npm run verify:baselines`。
- Thresholds：active `maxDiffPixelRatio=.015`；modal `.012`；无 mask。
- Snapshot path：`tests/visual-regression.spec.ts-snapshots/`。
- Flake risk：不同 GPU/字体栅格化可能造成抗锯齿微差；阈值仍足以捕获布局、资产缺失和大面积材质回归。

## Bot playtest

- Decision：added；seed 1985；用真实 `D`/`A`/`W` 和 `Space` 输入，不直接增加得分。
- Desktop metrics：framesAdvanced 341；distanceTravelled 0.369；score 0→1；first score within 2.4s；softlockWindows 0；restart mode `playing` / lives 3；console/page errors 0。
- Mobile metrics：framesAdvanced 352；distanceTravelled 0.373；score 0→1；first score within 2.4s；softlockWindows 0；restart mode `playing` / lives 3；console/page errors 0。
- Reckless path：测试状态通过真实伤害函数触发最后一命失败，随后 `R` 恢复 playing + 3 lives。
- Artifacts：`artifacts/bot-playtest/desktop-chrome.json`、`mobile-chrome.json`。

## Commands and release evidence

- `npm run build`：PASS；Vite 8.0.13；JS 约 598kB raw / 155kB gzip，CSS 8.56kB raw / 2.90kB gzip。
- `npm test`：PASS；18/18（desktop + mobile smoke、12 baselines、4 bot/campaign runs）。
- `npm run inspect:canvas ...`：PASS；active + stress、desktop + mobile；非空画布；0 console/page error。
- Canvas pixel evidence：desktop/mobile 的 `alphaPixels` 均为 4096+，variance 248，colorBuckets 76–98；pixel metrics JSON 同截图归档。
- `npm run preview -- --port 5190`：PASS；生产 `dist` 桌面/移动画布检查均通过。
- `npm audit --omit=dev --json`：生产依赖 0 vulnerability。
- Dev URL：`http://127.0.0.1:5188/`。
- Preview URL：`http://127.0.0.1:5190/`。
- Deploy artifact：`dist/`；Vite base 使用 `/`，适合域名根路径静态托管；子路径部署需设置 `base` 后重建。

## Screenshots and artifacts

- Desktop active：`artifacts/canvas-inspection/desktop-active-play.png`。
- Mobile active：`artifacts/preview-inspection/mobile-active-play.png`。
- Desktop/mobile stress：`artifacts/canvas-inspection/desktop-stress.png`、`mobile-stress.png`。
- Inspector JSON：同目录下同名 `.json`。
- Twelve tracked visual baselines：`tests/visual-regression.spec.ts-snapshots/`。
- Three-level production inspection：`artifacts/preview-levels/`；第 2 / 3 关桌面与移动端均非空、0 console/page error，并在渲染预算内。

## Files changed

- `src/game/Game.ts`：完整玩法、资产工厂、地图、AI、碰撞、VFX、诊断和测试状态。
- `src/core/InputController.ts`：键盘与 Pointer Events 意图输入。
- `src/systems/AudioSystem.ts`：程序化 Web Audio。
- `src/systems/Hud.ts`、`index.html`、`src/styles.css`：玩法 UI 和响应式触控。
- `tests/visual.spec.ts`、`tests/visual-regression.spec.ts`、`tests/bot-playtest.spec.ts`：QA harness。
- `scripts/inspect-threejs-canvas.mjs`：脚手架自带的像素、GPU 和预算检查器。
- `README.md`、`QUALITY_REPORT.md`：玩家说明和证据报告。

## Remaining risks

- 未在真实 iOS Safari、Android 低端 GPU 和实体触屏上测试；移动证据来自真实 Metal GPU 上的 Chromium iPhone viewport emulation。
- 外部 3D/图片/音频生成因三个 API key 缺失未执行；当前程序化美术和音频满足运行与评分门槛，但不是外部精模/录音资产。
- 无保存进度与关卡选择；刷新即重开，这是本次单页街机范围内的明确非目标。
- Dev-only npm audit 初始显示 2 个 high；`npm audit --omit=dev` 证明生产依赖为 0。未运行可能改变锁文件和主版本的 `npm audit fix`。
