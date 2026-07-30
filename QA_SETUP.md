# 测试工具准备 / QA Setup（新机器）

> 用途：在新机器上把本项目用到的三个 QA 工具（Playwright、Midscene.js、Chrome DevTools MCP）准备好。
> 本文档可单独交给一个新会话执行。**工具选择规则见 `AGENTS.md`**；本文档只讲“怎么把工具装好、跑通”。

## 0. 工具选择规则（摘要，完整版见 AGENTS.md）

- **Playwright**：默认确定性验证与发布硬门禁（导航/DOM/状态/截图基线/回归）。
- **Midscene.js**：只在需要人类视觉语义判断时用（Canvas 画面好不好认、是否拥挤/遮挡）；结果只能是 `warning`，不能单独作为发布硬门禁。
- **Chrome DevTools MCP**：用于 Console 报错、网络、性能 Trace、内存等根因诊断；修完必须回到 Playwright 复验。
- 不确定先用 Playwright；不要默认把三个工具都跑一遍。

开始前声明选了哪些/跳过哪些；结束时报告执行命令、硬门禁结果、（若有）视觉结论与根因证据、剩余风险。

---

## 1. 前置环境

- **Node v22+**（本项目开发机用 v22.22.2，npm 10+）
- git
- **系统 Chrome**（`/Applications/Google Chrome.app`）：Playwright 的 `channel:'chromium'` 与 Chrome DevTools MCP 都需要
- macOS（本项目在 macOS 上开发；若用 Linux 需额外跑 `npx playwright install-deps`）

## 2. 克隆并安装依赖

```bash
git clone https://github.com/kkllxy/iron-bastion-1985
cd iron-bastion-1985
npm install            # 安装 three / @playwright/test / @midscene/web / vite / typescript
```

- 根项目的 `package.json` 服务于根游戏（iron-bastion-1985）并承载共享测试脚本。
- 每个游戏子目录（如 `garden-autochess-glm/`）之后会有自己的 `package.json`，开发时再在该子目录单独 `npm install`。
- 确认 Midscene 装上：`ls node_modules/@midscene/web` 应存在。

## 3. Playwright（确定性硬门禁）

```bash
npx playwright install              # 安装 chromium（playwright.config.ts 用 channel:'chromium'）
npm test                            # 冒烟：应全部通过；首跑在 tests/*-snapshots/ 生成视觉基线
npm run verify:visual               # 视觉断言
npm run verify:baselines            # 视觉回归基线
npm run verify:bot                  # 机器人游玩
npm run inspect:canvas              # 画布像素非空检查（scripts/inspect-threejs-canvas.mjs）
```

要点（来自 `playwright.config.ts`）：

- dev server 地址 `http://127.0.0.1:5188`，Playwright 会自动起 `npm run dev`（`reuseExistingServer:true`）。
- `workers: 1`（多 worker 并行 headless WebGL 会争 GPU、帧时间漂移、基线 flaky）——不要擅自调高。
- 两个 project：`desktop-chrome`（1280×720）、`mobile-chrome`（iPhone 13）。
- **基线需要重生成时**：删对应 `tests/*-snapshots/` 后重跑 `npm run verify:baselines`，人工确认新基线正确再提交。
- `npm test` 全绿 = 确定性硬门禁通过。

## 4. Midscene.js（Canvas 视觉语义，可选 / warning 级）

- 已在 `devDependencies`（`@midscene/web`），`npm install` 后即装上。
- **必须配置 AI 模型 API Key**：按官方文档 https://midscenejs.com/ 配置（环境变量或本地配置）。
  - ⚠️ 密钥只能放**环境变量或本地未跟踪文件**，禁止写入仓库 / 打印到日志 / 提交。
  - 具体变量名以 Midscene 官方文档为准（不同版本/模型提供商不同）。
- **未配置 key 时**：按 AGENTS.md，停止 Midscene 检查并报告，不得阻塞发布门禁；Playwright 硬门禁照常。
- 目前没有专用测试入口；第一次真正需要“人类视觉语义判断”时，再加一个最小 `tests/midscene-*.spec.ts`（先用 Playwright 把游戏推进到固定 seed/状态/viewport → 再用 `aiAssert` 检查视觉）。
- 不要用 Midscene 检查数值阈值、网络错误、Console 错误或性能指标（那些归 Playwright / DevTools）。

## 5. Chrome DevTools MCP（根因诊断，可选）

- 全局安装 MCP 二进制（开发机版本 1.6.0）：
  ```bash
  npm install -g chrome-devtools-mcp
  which chrome-devtools-mcp          # 记下实际路径，下面配置要用
  ```
- 在 pi 配置 MCP：编辑 `~/.pi/agent/mcp.json`，确保包含：
  ```json
  {
    "mcpServers": {
      "chrome-devtools": { "command": "<上一步 which 的绝对路径>" }
    }
  }
  ```
  （开发机示例：`/opt/homebrew/bin/chrome-devtools-mcp`，对应 npm 全局前缀 `/opt/homebrew`。）
- 验证：在 pi 会话里调用 chrome-devtools 工具，能列出 / 连接 Chrome 标签页即就绪。
- 用途：Console 报错、网络请求、Performance Trace、长任务/掉帧、内存泄漏、LCP/资源加载。定位根因后**必须回到 Playwright 或 canvas inspector 做确定性复验**。

## 6. 完成核对（逐项确认）

- [ ] `node -v` ≥ 22，系统 Chrome 已装
- [ ] `npm install` 成功，`node_modules/@midscene/web` 存在
- [ ] `npx playwright install` 完成；`npm test` 全绿
- [ ] Midscene 模型 key 已配置 **或** 已登记“未配置→跳过”
- [ ] `chrome-devtools-mcp` 全局可用，pi MCP 能连 Chrome
- [ ] `npm run inspect:canvas` 能跑通

## 7. 规则提醒

- Playwright = 确定性硬门禁；Midscene = warning；DevTools MCP = 定位根因后回 Playwright 复验。
- 任何诊断修改后，回到确定性测试复验才算闭环。
- 不确定先用 Playwright，因为它的结果最可重复。
