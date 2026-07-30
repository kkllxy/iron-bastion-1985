# QA 工具选择规则

执行浏览器、Canvas、视觉或性能任务前，先判断需要什么证据，只使用必要工具，不要默认把全部工具都跑一遍。

## 1. Playwright：默认确定性验证与发布硬门禁

以下场景优先使用 Playwright：

- 页面导航、按钮、键盘、触控和游戏操作
- DOM、URL、状态切换、胜负、重试流程
- 固定 seed、固定场景的可重复断言
- 截图基线和视觉回归
- CI、发布前回归和失败复现

优先复用现有命令：

- `npm test`
- `npm run verify:visual`
- `npm run verify:baselines`
- `npm run verify:bot`
- `npm run inspect:canvas`

Playwright 结果是确定性硬门禁。

## 2. Midscene.js：Canvas 视觉语义判断

只有任务需要人类视觉判断时使用 Midscene，例如：

- 玩家、敌人或重要目标是否容易辨认
- Canvas 场景是否清晰、拥挤或遮挡
- 爆炸、砖墙、水面等视觉元素是否有辨识度
- 移动端按钮是否遮挡战场
- 布局、颜色、层次和视觉噪声是否合理

执行方式：

1. 先用 Playwright 把游戏推进到固定 seed、固定状态和固定 viewport。
2. 再使用 Midscene `aiAssert` 检查视觉语义。
3. Midscene 结果只能作为 `warning` 或 `review required`，不能单独作为发布硬门禁。
4. 缺少模型配置时停止 Midscene 检查并报告，不得读取、打印或提交密钥。

不要使用 Midscene 检查数值阈值、网络错误、Console 错误或性能指标。

## 3. Chrome DevTools MCP：根因诊断

以下场景使用 Chrome DevTools MCP：

- Console 报错或异常堆栈
- 失败、重复或缓慢的网络请求
- Performance Trace、长任务、卡顿和掉帧
- 内存增长或疑似泄漏
- LCP、资源加载、主线程和渲染性能问题

Chrome DevTools MCP 用于定位根因，不代替 Playwright E2E 测试。

修复后必须回到 Playwright 或现有 Canvas inspector 做确定性复验。

## 组合规则

- 功能回归：Playwright
- Canvas 画面好不好：Playwright 固定场景 → Midscene
- 性能或 Console 问题：Chrome DevTools MCP 定位 → 修改 → Playwright 复验
- 发布验证：Playwright 为主；必要时补 Midscene；只有出现异常或性能任务时才用 DevTools
- 不确定时先用 Playwright，因为它的结果最可重复

开始前简要声明：

- 本次任务选择哪些工具
- 每个工具解决什么问题
- 哪些工具跳过及原因

结束时报告：

- 执行过的命令和场景
- 硬门禁结果
- Midscene 视觉结论（若使用）
- DevTools 根因证据（若使用）
- 未验证项和剩余风险
