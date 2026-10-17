# L01 离线配音与字幕

本轮接入的是 **11 句事件对白、字幕、串行播放及离线资产接口**。当前云环境是 Linux，没有 Windows System.Speech，**实际生成并接入的 WinTTS 配音为 0 / 11**。游戏缺失语音时仍显示字幕；暂停菜单明确显示素材数量。没有使用在线服务、浏览器 `speechSynthesis` 或 Linux 合成声替代 Windows 配音。机械音效与配音分开计数。

## 数据与运行合同

- 唯一数据源：[l01-dialogue.json](../game/data/l01-dialogue.json)。每句独立 `id`、`character`、`subtitle`、`audioId`、`file`、`trigger`、`priority`、`duration`、`maxAge`；可选 `delay` 和 `cancelOn`。
- [dialogue.js](../game/dialogue.js) 通过 ArkGlide 原生 `audio.list/play`、`AudioVoice.playing/pause/resume/stop` 与预建 `ui` 字幕播放。玩家操作不等待对白结束；同一时刻最多一条对白句柄。
- 每个事件在当前关卡时间线仅消费一次。排队句按优先级排序，同优先级按进入顺序；句间留 0.65 秒。错过位置的观察句会过期，穿门后取消尚未说出的折口猜测。新事件不粗暴打断已经开始的句子。
- 有音频时，字幕跟随实际句柄结束；缺文件或原生拒播时，使用数据中的 `duration` 显示字幕。原生播放失败有可读诊断，不阻塞机关。
- 暂停显式暂停原生句柄并冻结字幕时钟；恢复继续当前句。存档 provider 应包含 `capture()`：保存已消费事件及已开始的句子，不序列化 Web Audio 句柄。`restore()` 停旧句、清排队，不从句首重播已消费事件。`reset()` 开始新的关卡事件时间线。语音和字幕开关独立，重试保留玩家选项。
- `snapshot()` 只读返回当前句、角色、排队、历史、缺失素材及错误，供浏览器验证；不是触发剧情或替玩家完成关卡的入口。

角色配置区分两条总线：栈雀 `CompanionVoice`、衡务 `BroadcastVoice`。栈雀较明亮、语速稍快；衡务语速克制，离线带通较窄，模拟设施广播。效果来自合法生成后的 PCM 文件及游戏混音总线，不声称不存在的配音已经播放。`voice` 指定 Windows 语音文化、可选声音名、TTS 语速和音量；`processing` 指定高通、低通和峰值。替换声线只需重新生成音频及修改该配置，不修改关卡脚本。

## 台词及事件

事件必须由实际空间观察或机关状态发出，不能仅按固定计时播放。

| ID | 角色 | 触发 | 台词 | 排队策略 |
| --- | --- | --- | --- | --- |
| C01-L01-ZQ-001 | 栈雀 | `court.enter`：测试入口进入巡检庭 | 支脚收好了。嗯，这里比图纸上宽。 | 进入一次，8 秒后不补说 |
| C01-L01-ZQ-002 | 栈雀 | `exit.seen`：首次实际观察高处出口 | 出口倒是醒着。只是我们还在楼下。 | 穿门后取消未开始的句子 |
| C01-L01-HW-001 | 衡务 | `route.blocked`：发现直接上行通路被隔离 | 上行检修梯处于隔离状态。请保留返回通路。 | 不提示折口或手轮解法 |
| C01-L01-ZQ-003 | 栈雀 | `maintenance.observed`：检视百叶实际升到位 | 这条线绕过了设备背面。图纸上可没画这个弯。 | 可错过；排队中遇折口启动/穿越则取消 |
| C01-L01-HW-002 | 衡务 | `fold.ready`：原生折口实际启用 | 固定折口接驳完成。两侧落脚区确认。 | 穿门后不补播启用播报 |
| C01-L01-ZQ-005 | 栈雀 | `fold.ready` 后仍停留观察 | 我猜那边是仓库……唔，扶栏不像。 | 延迟 4.2 秒、低优先级；穿门即取消未播句 |
| C01-L01-ZQ-006 | 栈雀 | `fold.crossed`：玩家首次原生跨门事件 | 刚才还在下面……那条绕弯的线，我认得。 | 同一事件只播一次，不因反复穿门重复 |
| C01-L01-ZQ-007 | 栈雀 | `return.open`：实体返回通道真正开放 | 这回停电也能走回去了。我喜欢楼梯。 | 通关后不补说 |
| C01-L01-ZQ-008 | 栈雀 | `court.returned`：玩家自愿沿楼梯回低庭 | 绕了一圈，没换地方。换的是路。 | 可错过，不强制回程听句子 |
| C01-L01-HW-003 | 衡务 | `level.complete`：实际到达本关出口 | 巡检段通路已恢复。保留人工回路。 | 高优先级，仍不打断当前句 |
| C01-L01-ZQ-009 | 栈雀 | `level.complete` 后 | 算我们修好的。别把楼梯的功劳全记给折口。 | 延迟 4.2 秒；自由继续活动 |

这些台词不承担目标、障碍和状态的唯一表达。高处目标、隔离梯、折口视图、机械运动及实体回路必须在静音、关闭字幕时仍可理解。栈雀会错猜设施用途、记住看过的细节、在意可走回的实体道路；衡务只陈述工作状态。栈雀不掌握设施真相，也不解释许澈、主线供电或后续章节。

## Windows 可复现制作

需要 Windows 10 / 11、Windows PowerShell 5.1、已安装且可由 `System.Speech` 枚举的离线 **zh-CN** 声线，以及本项目 Node 环境。不假定 Windows 的所有在线或 OneCore 声音都能由桌面 System.Speech 访问；以列表为准，不修改系统注册表。

在仓库根目录先列出声音：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1 -ListVoices
```

首次完整生成：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1
node scripts/voice-assets.mjs --process
node scripts/voice-assets.mjs --check --strict
npm run dev
```

`Bypass` 只作用于这次 PowerShell 进程，不更改机器或用户的持久执行策略。脚本本身使用 ASCII；中文从 JSON 显式按 UTF-8 读取，兼容 PowerShell 5.1 的默认编码行为。

脚本会为角色选择可用的 zh-CN 声线，并在有多个候选时优先分开；只有一个声线时明确警告，两个角色仍采用不同速率、滤波和混音参数。若没有匹配中文声线则停止，绝不悄悄改用英语发音。可从列表复制确切名称，显式指定 `-ZhanqueVoice` 和 `-HengwuVoice`；也可把名称写入数据 `voice.windowsName`，以固定本机制作配置。具体声音名取决于本机安装，仓库不假装预装某个声音。

只重录一句可用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1 -Ids C01-L01-ZQ-006
node scripts/voice-assets.mjs --process
```

原始输出位于忽略目录 `.cache/voice/raw/`，格式为 22,050 Hz、16 bit、单声道 PCM WAV。`production.json` 记录实际 Windows 引擎、声线、文化、语速、原文和文件 SHA-256。局部重录合并元数据，保留其他句子的记录。

`--process` 核对原文与哈希，应用各角色的简单离线高通/低通、峰值归一化及首尾 10 毫秒淡变，写入 `assets/voice/l01/*.wav` 和 `manifest.json`。只使用 Node 内置模块，无 ffmpeg、在线转换或重型依赖。标准 PCM WAV 可直接由 ArkGlide/Web Audio 解码，无须额外有损编码。静音占位、损坏文件、不合规格或过长文件会拒绝。

准备游戏时，`loadVoiceAssets()` 仅打包实际存在且校验通过的 WAV。缺失台词保持字幕路径；`--check --strict` 在配音未齐时返回非零，适合本地配音交付检查。录音确认后提交处理后的 WAV 和 manifest；原始缓存和引擎依赖不入库。

本轮未实际运行 Windows PowerShell，也未进行真实 TTS 声线试听、字幕与音频口型节奏或不同电脑解码测试。首次本地生成后必须完成试听：检查中文读音、停顿、广播清晰度、两角色辨识度、音量及句子是否适合当时的操作节奏。

## 当前素材清单

以下目标文件全部 **待本地 Windows 生成**，实际配音打包数量为零：

```text
assets/voice/l01/C01-L01-ZQ-001.wav
assets/voice/l01/C01-L01-ZQ-002.wav
assets/voice/l01/C01-L01-HW-001.wav
assets/voice/l01/C01-L01-ZQ-003.wav
assets/voice/l01/C01-L01-HW-002.wav
assets/voice/l01/C01-L01-ZQ-005.wav
assets/voice/l01/C01-L01-ZQ-006.wav
assets/voice/l01/C01-L01-ZQ-007.wav
assets/voice/l01/C01-L01-ZQ-008.wav
assets/voice/l01/C01-L01-HW-003.wav
assets/voice/l01/C01-L01-ZQ-009.wav
```

可在任意平台运行 `node scripts/voice-assets.mjs --check`，取得实际存在、缺失及校验结果。当前 `node --test tests/dialogue.test.mjs` 的 11 项测试覆盖串行队列、事件防重、过期、暂停、恢复、选项、缺素材、拒播和 WAV 制作校验。测试中的合成波形只存在临时目录，用于验证 PCM 算法，未作为角色配音交付；单元测试不等于 Windows TTS 制作实测或真人体验验收。


## 实际机械反馈文件（非语音）

四个文件均由本项目 `scripts/feedback-assets.mjs` 的确定性波形算法原创生成，22,050Hz、单声道、16bit PCM；工程准备会打包并以 `audio:ID` 原生预载。它们是临时机械反馈，不模仿人声，也不计入11句WinTTS配音进度。

| 资产文件 | 长度 | 触发 |
| --- | --- | --- |
| `assets/audio/prototype/mechanism-turn.wav` | 0.32秒 | 首次握住遮板手轮 |
| `assets/audio/prototype/mechanism-inspect.wav` | 0.18秒 | 松开检视百叶 |
| `assets/audio/prototype/mechanism-connect.wav` | 0.48秒 | 遮板到位且原生门对启用 |
| `assets/audio/prototype/mechanism-return.wav` | 0.42秒 | 上侧配重闩释放 |

语音V开关控制对白，机械反馈走独立混音总线。已结束的机械句柄不会再次pause/resume；播放异常只记录诊断，不能阻止机构运动、折口启用或通关。真实设备上的音量/音色与正式音效仍待试听。
