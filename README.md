# 折径 / Foldline

原创第一人称剧情空间解谜游戏。长期目标为约九章、30～40 个核心谜题、首次正常游玩约 3～5 小时；规模须由实际游玩调整。

**当前为 M1-R3：仅 C01-L01《侧向通行》的正式视觉样板候选。** R2已由用户试玩认可；本轮保留其玩法、角色和对白，升级工业场景、栈雀外观、照明与轻量画面调色，待用户审查新版，不制作相邻关卡。

使用 Node.js ≥20.19（本轮为 24.19.0）：

```sh
npm ci
npm run dev
```

在本机浏览器打开 `http://127.0.0.1:4173`，启动外层播放器后点击游戏画面取得鼠标控制。WASD 移动，鼠标观察，E 交互（手轮需按住，松手保持进度），Space 跳跃，Esc 暂停，R 重试，V 切换英语语音，B 切换字幕，L 切换中文/英文字幕。默认中文；语言及V/B偏好同源下跨重试、关卡重进和刷新保留。工程自动获取固定 SHA 的 ArkGlide 并生成本地运行文件；首次准备需要网络，不运行完整编辑器构建。

当前已知风险：云端1280×800 SwiftShader软件渲染，R3入口约4.0FPS（R2约13.9），近门约2.2FPS（R2约4.6）；Windows GPU尚未实测。完整资源/性能数据与待审项见[R3记录](docs/m1-r3-review.md)。

当前云端仓库有4个原创机械音效，未收到用户本地已试听的15句英语WAV；R3保留现有配音与双语字幕接口。依照[离线配音制作说明](docs/voice-production.md)生成并处理 WAV 后，再运行 `npm run dev` 自动打包，运行游戏的玩家不需安装TTS。旧中文录音须备份并重新制作，不能沿用相同ID冒充英语。

Windows 若使用旧版脚本遇到 `spawn npm ENOENT`，请更新 `scripts/engine.mjs` 后重试；已有 `.cache` 可以保留。启动脚本现通过 Node 调用 npm CLI，避免直接启动 `npm.cmd`。

若第二次启动报 `ArkGlide has tracked changes`，也请先更新该脚本、保留缓存再运行。Windows CRLF 与上游运行时同步可能造成 Git 状态误报；新检查按 Git 归一化后的真实内容差异判断。真实修改仍会被列出并保留，必要时先将 `.cache/arkglide` 重命名备份，再准备新缓存。不要直接清空改动。详见[缓存启动修复](docs/startup-cache-fix.md)。

```sh
npm run check
npm run test:setup
npm run test:unit
npm run test:browser
```

浏览器测试使用 Chromium；默认路径 `/usr/bin/chromium`，其他安装位置用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。测试会更新已提交的操作记录与截图，属于真实输入的自动化技术检查，不是玩家盲测。

- [M1-R3 视觉样板、截图与性能记录](docs/m1-r3-review.md)
- [实际素材与许可证](assets/art/l01/README.md)
- [M1-R2 英语对白、字幕与验证记录](docs/m1-r2-review.md)
- [M1-R1 体验重构与验证记录（历史）](docs/m1-r1-review.md)
- [新版空间设计](docs/design/l01-r1-design.md) · [栈雀设定](docs/design/zanque.md) · [离线配音](docs/voice-production.md)
- [原 M1 运行与技术证据（历史）](docs/m1-c01-l01.md)

- [文档索引、阅读顺序与当前状态](docs/README.md)
- [长期开发约束](AGENTS.md)
- [世界观、故事与结局](docs/design/game-architecture.md)
- [栈雀与衡务的长期角色发展建议](docs/design/character-development.md)
- [九章路线图与单元候选](docs/design/chapter-roadmap.md)
- [机制递进图](docs/design/mechanic-progression.md)
- [第一章《苏醒》空间与谜题设计](docs/design/chapter-01-awakening.md)
- [第一章状态、广播与检查点](docs/design/chapter-01-events.md)
- [首次体验设计推演](docs/design/chapter-01-walkthrough.md)
- [研究依据](docs/research/portal2-design-methods.md) · [ArkGlide 技术核查](docs/technical/arkglide-api-audit.md)
- [制作阶段与验收制度](docs/production-and-acceptance.md)
