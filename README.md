# 折径 / Foldline

原创第一人称剧情空间解谜游戏。长期目标为约九章、30～40 个核心谜题、首次正常游玩约 3～5 小时；规模须由实际游玩调整。

**当前为 M1-R1：仅重构 C01-L01《侧向通行》的探索与机械反馈，并接入栈雀随行原型、事件对白与字幕。** 新版仍待用户体验验收，未制作相邻关卡或正式美术。

使用 Node.js ≥20.19（本轮为 24.19.0）：

```sh
npm ci
npm run dev
```

在本机浏览器打开 `http://127.0.0.1:4173`，启动外层播放器后点击游戏画面取得鼠标控制。WASD 移动，鼠标观察，E 交互（手轮需按住，松手保持进度），Space 跳跃，Esc 暂停，R 重试，V 切换语音，B 切换字幕。工程自动获取固定 SHA 的 ArkGlide 并生成本地运行文件；首次准备需要网络，不运行完整编辑器构建。

当前真正接入的是4个原创机械音效；11句 WinTTS 配音尚待本地 Windows 生成，字幕与事件已接通。依照[离线配音制作说明](docs/voice-production.md)生成并处理 WAV 后，再运行 `npm run dev` 自动打包，不使用在线语音服务。

Windows 若使用旧版脚本遇到 `spawn npm ENOENT`，请更新 `scripts/engine.mjs` 后重试；已有 `.cache` 可以保留。启动脚本现通过 Node 调用 npm CLI，避免直接启动 `npm.cmd`。

```sh
npm run check
npm run test:setup
npm run test:unit
npm run test:browser
```

浏览器测试使用 Chromium；默认路径 `/usr/bin/chromium`，其他安装位置用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。测试会更新已提交的操作记录与截图，属于真实输入的自动化技术检查，不是玩家盲测。

- [M1-R1 体验重构与验证记录](docs/m1-r1-review.md)
- [新版空间设计](docs/design/l01-r1-design.md) · [栈雀设定](docs/design/zanque.md) · [离线配音](docs/voice-production.md)
- [原 M1 运行与技术证据（历史）](docs/m1-c01-l01.md)

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
