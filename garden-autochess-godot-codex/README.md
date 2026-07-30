# 末日花园自走棋（Godot 版）

一款使用 Godot 4.7 制作的原创中文花园构筑自走棋。玩家购买种子、在五路草坪上摆阵、升星和嫁接植物，再观看阵容自动抵挡 15 波污染怪物。

## 当前技术栈

- Godot 4.7.1 + 强类型 GDScript
- Compatibility 渲染器（macOS / WebGL 2.0 / 移动端）
- 固定种子的确定性商店、波次和自动战斗
- Playwright Web 交互、视觉和机器人测试

真实环境与产品范围分别见：

- [DEVELOPMENT_ENVIRONMENT.md](DEVELOPMENT_ENVIRONMENT.md)
- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)

## 运行

```bash
godot --path .
```

无头解析检查：

```bash
godot --headless --path . --editor --quit
```

## 操作

- 鼠标/触控：购买商店种子、拖放备战植物、选择奖励和变异。
- `1`～`5`：购买商店槽位。
- `R`：刷新商店。
- `L`：锁定/解锁商店。
- `Q`：铲子。
- `E`：肥料。
- `空格`：开始当前波。
- `Esc`：暂停/继续。

## 验证

原生确定性测试：

```bash
godot --headless --path . --script tests/run_all.gd
```

导出 Web 并运行 Playwright：

```bash
godot --headless --path . --export-release Web build/web/index.html
npm install
npm test
npm run verify:visual
npm run verify:baselines
npm run verify:bot
npm run inspect:canvas
```

最终实际结果与剩余风险记录在 `QUALITY_REPORT.md`。

## 架构

- `features/model/`：局内状态、经济、商店、棋盘与固定步长战斗的唯一真源。
- `features/catalog/`：12 种植物、8 种普通敌人、3 个 BOSS、奖励、遗物、天气和 15 波数据。
- `features/presentation/`：只读模型并绘制/交互的响应式中文 Canvas UI。
- `features/audio/`：程序化背景音乐与复用式音效播放器。
- `features/qa/`：Web 测试桥。
- `qa/`、`tests/`：Playwright 与 Godot 无头硬门禁。

项目内置 Noto Sans SC 变量字体以保证 Web 中文一致性，许可见 `assets/fonts/OFL.txt`。`build/web/`、测试报告和本地依赖均为生成物，不提交。

架构遵循 `godot-master` 的 Resource/数据所有权、Signal Up / Call Down、功能目录和确定性测试约束。
