# 末日花园自走棋（Godot 版）实际开发环境

本文记录 2026-07-31 本项目实际使用的引擎、工具、协作方式、文件边界和验证环境，不是预设方案。

## 项目与写入边界

- 项目根目录：`/Users/yx/orca/workspaces/iron-bastion-1985/agent-initial-game/garden-autochess-godot-codex`
- 代码、资源、测试、导出配置和报告只写入上述目录。
- `garden-autochess-glm/` 与 `garden-autochess-codex/` 仅作只读参考。
- 未执行 Git push，未创建 Pull Request。

## 实际引擎与工具

| 工具 | 实际版本/位置 | 用途 |
| --- | --- | --- |
| Godot | `4.7.1.stable.official.a13da4feb` | 引擎、无头测试、Web 导出 |
| Godot 可执行文件 | `/opt/homebrew/bin/godot`，指向 `/Applications/Godot.app` | CLI 与编辑器 |
| Web 导出模板 | `/Users/yx/Library/Application Support/Godot/export_templates/4.7.1.stable/` | 无线程 Web release |
| Node.js | `v26.0.0` | QA 静态服务器与脚本 |
| npm | `11.12.1` | QA 依赖和命令 |
| Playwright | `1.62.0` | 桌面/移动 Chromium 硬门禁 |
| 中文字体 | `assets/fonts/NotoSansSC-Variable.ttf` | Web 与原生一致的简体中文显示 |

Godot 与本项目均可离线本地运行，不要求注册或登录账号。首次安装引擎、下载导出模板或安装 npm 依赖时才需要网络。

## 实际项目配置

- 语言：强类型 GDScript 2.0。
- 渲染器：Compatibility / WebGL 2.0。
- 响应式逻辑基准：390×664；本地桌面窗口覆盖为 1280×720；`canvas_items` + `expand` 适配宽高比。
- 战场：5 路 × 7 列。
- 战斗：物理帧由 Godot 以 60 Hz 调度，模型内部以 `1/30` 秒固定步长结算。
- 随机：`RandomNumberGenerator` 显式 seed；商店、奖励、波次和测试机器人不使用全局随机源。
- Web：release、无 GDExtension、`thread_support=false`，不要求跨源隔离头。
- 字体许可：Noto Sans SC 随项目打包，许可文本为 `assets/fonts/OFL.txt`。
- 音频：1 个程序化 BGM 流和 3 个复用 SFX 流，Web 强制 stream playback，提供静音。

## 使用的技能与实现准则

- 技能来源：`thedivergentai/gd-agentic-skills`。
- 新项目只安装并使用 `godot-master`：`/Users/yx/.codex/skills/godot-master`。
- 实际采用：功能目录、模型单一真源、Signal Up / Call Down、固定步长、显式 seed、数据目录、响应式触控和 Web 导出/测试准则。
- 主场景通过该技能仓库的场景 builder 生成初始骨架，随后按产品需求集成。

## 实际协作与隔离方式

- 主代理负责架构、集成、修复、Web 导出与最终硬门禁。
- 3 个子代理分别负责玩法清单/模型、Godot QA 环境、视觉/音频/测试桥；写入范围互不重叠，最终由主代理集成复验。
- 未创建额外 Git worktree：这是一个全新的独立目标目录，分支工作树不会增加隔离收益。
- 当前执行环境未启用文件系统沙盒。隔离由绝对目标目录、只读参考目录和最终 Git 状态检查保证。
- 系统级变更只有 Godot 4.7.1 与对应 Web 模板；npm 依赖安装在项目 `node_modules/`。

## 实际目录结构

```text
garden-autochess-godot-codex/
├── assets/fonts/                 # Noto Sans SC 与 OFL
├── common/                       # 全局信号与视觉调色板
├── features/
│   ├── audio/                    # 程序化 BGM/SFX
│   ├── catalog/                  # 植物、敌人、Boss、波次、奖励数据
│   ├── game/                     # 主场景与组合根节点
│   ├── model/                    # 经济、棋盘、单位和固定步长战斗
│   ├── presentation/             # 响应式 Canvas UI 与输入
│   └── qa/                       # Web 白名单测试桥
├── qa/                           # 静态服务器与 Canvas inspector
├── tests/                        # Godot 原生测试、Playwright、视觉基线
├── build/web/                    # 生成的 Web release，Git 忽略
├── project.godot
├── export_presets.cfg
├── package.json
└── playwright.config.ts
```

## QA 工具选择与实际用途

- Godot CLI：脚本解析、无头启动、固定 seed 模型测试和 Web release 导出。
- Playwright：桌面/移动 Canvas、简体中文、真实开始按钮点击/触控、固定 seed、15 波机器人闭环和 12 张视觉基线；属于硬门禁。
- Midscene.js：未使用。没有模型配置，且本轮视觉证据由固定状态截图、像素基线和人工审阅提供；未读取或输出任何密钥。
- Chrome DevTools MCP：未使用。Playwright 与 Canvas inspector 的 Console/Page Error 均为空，没有网络或性能异常需要定位。

## 可复现命令

```bash
godot --version
godot --headless --path . --editor --quit
npm run test:native
godot --headless --path . --quit-after 120
npm run export:web
npm test
npm run verify:visual
npm run verify:baselines
npm run verify:bot
npm run inspect:canvas
```

`npm test` 会自动启动和关闭本地静态服务器；`npm run inspect:canvas` 在未检测到服务器时也会自行启动临时服务器。实际结果见 `QUALITY_REPORT.md`。
