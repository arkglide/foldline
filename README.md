# 折径 / Foldline

原创第一人称剧情空间解谜游戏。长期目标为约九章、30～40 个核心谜题、首次正常游玩约 3～5 小时；规模须由实际游玩调整。

**M0 已合并；当前交付仅为 M1 的 C01-L01《侧向通行》可玩灰盒与技术验证，等待用户实际体验。** 没有制作相邻关卡、正式美术或完整叙事系统。

使用 Node.js ≥20.19（本轮为 24.19.0）：

```sh
npm ci
npm run dev
```

在本机浏览器打开 `http://127.0.0.1:4173`，启动外层播放器后点击游戏画面取得鼠标控制。WASD 移动，鼠标观察，E 交互，Space 跳跃，Esc 暂停，R 重试。工程自动获取固定 SHA 的 ArkGlide 并生成本地运行文件；首次准备需要网络，不运行完整编辑器构建。

```sh
npm run check
npm run test:browser
```

浏览器测试使用 Chromium；默认路径 `/usr/bin/chromium`，其他安装位置用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。测试会更新已提交的操作记录与截图，属于真实输入的自动化技术检查，不是玩家盲测。

- [L01 运行说明、截图、空间调整与验证边界](docs/m1-c01-l01.md)

- [文档索引、阅读顺序与当前状态](docs/README.md)
- [长期开发约束](AGENTS.md)
- [世界观、故事与结局](docs/design/game-architecture.md)
- [九章路线图与单元候选](docs/design/chapter-roadmap.md)
- [机制递进图](docs/design/mechanic-progression.md)
- [第一章《苏醒》空间与谜题设计](docs/design/chapter-01-awakening.md)
- [第一章状态、广播与检查点](docs/design/chapter-01-events.md)
- [首次体验设计推演](docs/design/chapter-01-walkthrough.md)
- [研究依据](docs/research/portal2-design-methods.md) · [ArkGlide 技术核查](docs/technical/arkglide-api-audit.md)
- [制作阶段与验收制度](docs/production-and-acceptance.md)
