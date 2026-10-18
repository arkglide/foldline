# 折径 / Foldline

原创第一人称剧情空间解谜游戏。长期目标为约九章、30～40 个核心谜题、首次正常游玩约 3～5 小时；规模须由实际游玩调整。

**当前为M2：C01-L02《隔栏借物》可玩候选。** 用户已认可L01质量基线；本轮仅推进L02的窄折口、真实跨门借物、锁存与同风格工业空间。L02仍待真人试玩，不制作S01/S02/L03。

使用 Node.js ≥20.19（本轮为 24.19.0）：

```sh
npm ci
npm run dev
```

在本机浏览器打开 `http://127.0.0.1:4173`，启动外层播放器后点击游戏画面取得鼠标控制。WASD 移动，鼠标观察，E拿取/松手（L02）或交互/按住转轮（L01），Space 跳跃，Esc 暂停，R 重试，V 切换英语语音，B 切换字幕，L 切换中文/英文字幕。默认中文；语言及V/B偏好同源下跨重试、关卡重进和刷新保留。工程自动获取固定 SHA 的 ArkGlide 并生成本地运行文件；首次准备需要网络，不运行完整编辑器构建。

默认`npm run dev`启动L02；`npm run dev:l01`保留已认可的L01。两者是独立测试入口，没有制作L01→L02的整章转换或S01。暂停页提供完整操作；左下无常驻操作块，左上仅标题和目标。

L02从玻璃外观察唯一接驳匣，经身体不适配的固定窄口用原生弹簧抓取取回，松手放稳在锁存坞，接通后实体出口开启。可以重复取放，R恢复本关安全检查点。没有自由放门或吸附传送取件。

[M2交付记录](docs/m2-l02-review.md)包含实际操作、截图、资源与性能；当前设备为云端SwiftShader软件渲染，不能替代Windows GPU性能验收。历史L01/R3约4FPS入口的限制仍保留。

云端L01英语WAV为0/15（用户本地已认可），L02新英语WAV为0/7，缺音可用双语字幕；4个机械音效已接入。Windows新关制作：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1 -Level l02
# 上一步成功后再依次执行；详见配音文档的失败停止流程。
node scripts/voice-assets.mjs --level=l02 --process
node scripts/voice-assets.mjs --level=l02 --check --strict
npm run dev
```

[离线配音说明](docs/voice-production.md)保留完整触发/文本/声音参数和迁移方式。L02录音与L01目录隔离，不覆盖已有本地声音。旧中文录音必须先备份重录，不能复用ID冒充英语。

Windows 若使用旧版脚本遇到 `spawn npm ENOENT`，请更新 `scripts/engine.mjs` 后重试；已有 `.cache` 可以保留。启动脚本现通过 Node 调用 npm CLI，避免直接启动 `npm.cmd`。

若第二次启动报 `ArkGlide has tracked changes`，也请先更新该脚本、保留缓存再运行。Windows CRLF 与上游运行时同步可能造成 Git 状态误报；新检查按 Git 归一化后的真实内容差异判断。真实修改仍会被列出并保留，必要时先将 `.cache/arkglide` 重命名备份，再准备新缓存。不要直接清空改动。详见[缓存启动修复](docs/startup-cache-fix.md)。

```sh
npm run check
npm run test:setup
npm run test:unit
npm run test:browser
npm run test:browser:l01
```

浏览器测试使用 Chromium；默认路径 `/usr/bin/chromium`，其他安装位置用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。测试会更新已提交的操作记录与截图，属于真实输入的自动化技术检查，不是玩家盲测。

- [M2 L02可玩版、截图和技术验证](docs/m2-l02-review.md)
- [L02空间与借物设计](docs/design/l02-borrow.md) · [素材/许可](assets/art/l02/README.md)
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
