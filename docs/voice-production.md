# L01 英语离线配音与双语字幕

M1-R2 的主要配音语言为**英语**；字幕可选简体中文、英语。当前 Linux 云环境没有 Windows System.Speech，也没有 PowerShell，**实际生成并接入的英语 WinTTS 配音为 0 / 15**。游戏保留缺音字幕回退；暂停菜单显示实际资源数量。没有静音占位、在线服务、浏览器即时朗读或 Linux 语音冒充 Windows 配音。4个现有机械音效单独计数。

## 数据、设置与播放合同

唯一对白源为 [l01-dialogue.json](../game/data/l01-dialogue.json)，格式版本2。每句保留稳定 `id`、`character`、`audioId`、`file`、`trigger` 和原有优先级/时长/过期规则，使用 `voiceText` 存英语配音原文，`subtitles.en` 必须与它完全一致，`subtitles.zh-CN` 是独立润色的中文。角色名用 `characters.*.names.en` / `names.zh-CN`；旧 `name` 留作中文兼容，不能据此选择配音语言。`characters.*.voice.culture = en-US` 表示首选制作语言；实际安装声音可为其他 `en-*` 文化，metadata 必须记录实际值。`delivery` 是短句表演意图，不能代替真实声音试听。

[dialogue.js](../game/dialogue.js) 继续使用原生音频、字幕队列及生命周期；同一时刻至多一条对白，句间0.65秒。事件每条关卡时间线仅消费一次，排队按优先级，过期或后续事件取消未播观察；`after` 让回应以前句实际开始为前提，前句没说就不凭空接话。对话不强制等待、不成为通关条件。可选句允许错过。

有音频时字幕随实际原生句柄结束，缺文件或拒播时使用 `duration`；切换字幕语言立即更新当前文字及角色名，**不会重播或切换英语音轨**。V / B 分别切换语音和字幕，L 切换中文/English；暂停页设置有双语文字。三项偏好通过原生项目 storage 保存，与关卡进度分开；R重试、读取检查点不覆盖选项，正常重新加载后恢复。存储不可用或数据损坏时保留可玩的默认/内存设置并显示诊断，不能阻塞关卡。

暂停冻结字幕时钟并暂停当前音频，恢复继续同句。检查点保留已消费事件及已开始句子；恢复停止旧句并清队列，不补播整段。销毁释放当前声音和临时队列。快照只读用于验证，不能用它触发剧情或替玩家通关。

栈雀走 `CompanionVoice` 总线，英语口吻好奇、会自我修正，在意可靠的实体通路；衡务走 `BroadcastVoice`，准确、克制，依据记录判断，没有反派威胁。栈雀的轻快程度来自适度语速、自然短句与现场反应，不能靠过分变调；衡务使用较窄离线带通表达广播质感。当前处理参数沿用原型，不宣称未经试听的声音已经自然、清楚或有鲜明演技。

## 完整英文对白与中文字幕

以下15句是数据的完整对照，不要求一次通关全部听到。`route.blocked` 的猜测/记录、`fold.ready` 的用途判断/纠正，以及返路与终点的回应来自实际事件；没有固定时间闲聊循环。

| ID | 角色 | 触发事件 | English voice / subtitle | 中文字幕 | 排队限制 |
| --- | --- | --- | --- | --- | --- |
| `C01-L01-ZQ-001` | Zhanque / 栈雀 | `court.enter` | Feet tucked in. Right. Let's see what still works. | 脚收好了。来，看看还有什么能用。 | 8 秒后过期 |
| `C01-L01-ZQ-002` | Zhanque / 栈雀 | `exit.seen` | There's the exit. I was hoping for one on our floor. | 出口在那儿。我还盼着它能跟我们在一层呢。 | 后续空间事件可取消未播句；10 秒后过期 |
| `C01-L01-ZQ-010` | Zhanque / 栈雀 | `route.blocked` | I think it's jammed. Quiet sort of jam, though. | 我猜是卡住了。不过，卡得还挺安静。 | 后续空间事件可取消未播句；10 秒后过期 |
| `C01-L01-HW-001` | Hengwu / 衡务 | `route.blocked` | No fault is logged. The stair gate is isolated. | 未记录故障。楼梯隔离门处于封闭状态。 | 仅前句已开始后可排入播放；后续空间事件可取消未播句；12 秒后过期 |
| `C01-L01-ZQ-003` | Zhanque / 栈雀 | `maintenance.observed` | Oh, that's where the line goes. Couldn't see that bend from out there. | 哦，原来线路通向这边。刚才在外面看不见这个弯。 | 后续空间事件可取消未播句；7 秒后过期 |
| `C01-L01-HW-002` | Hengwu / 衡务 | `fold.ready` | Fixed link established. Both landings confirmed clear. | 固定接驳已建立。两侧落脚区确认无障碍。 | 后续空间事件可取消未播句；12 秒后过期 |
| `C01-L01-ZQ-005` | Zhanque / 栈雀 | `fold.ready` | A loading bay, maybe? Those rails look familiar. | 会不会是装货平台？那种栏杆我好像见过。 | 延迟 4.2 秒；后续空间事件可取消未播句；10 秒后过期 |
| `C01-L01-HW-004` | Hengwu / 衡务 | `fold.ready` | That platform is registered as an inspection gallery. | 该平台登记为巡检廊。 | 仅前句已开始后可排入播放；后续空间事件可取消未播句；17 秒后过期 |
| `C01-L01-ZQ-006` | Zhanque / 栈雀 | `fold.crossed` | Oh. Up here already? I hadn't finished looking. | 咦，已经到上面了？我还没看够呢。 | 后续空间事件可取消未播句；10 秒后过期 |
| `C01-L01-ZQ-011` | Zhanque / 栈雀 | `upper.lookback` | There's the way we came in. Much easier to read the place from here. | 那儿就是我们进来的地方。从这儿看，整个庭院就好懂多了。 | 后续空间事件可取消未播句；9 秒后过期 |
| `C01-L01-HW-005` | Hengwu / 衡务 | `return.open` | Stair isolation released. The physical return route is open. | 楼梯隔离已解除。实体返回通道已开放。 | 后续空间事件可取消未播句；10 秒后过期 |
| `C01-L01-ZQ-007` | Zhanque / 栈雀 | `return.open` | A way back that doesn't need power. I'll take that. | 这条回去的路不用电。这个我喜欢。 | 仅前句已开始后可排入播放；后续空间事件可取消未播句；10 秒后过期 |
| `C01-L01-ZQ-008` | Zhanque / 栈雀 | `court.returned` | Same corner. I like it better with a way out. | 还是这个拐角。有了出路，看着顺眼多了。 | 后续空间事件可取消未播句；8 秒后过期 |
| `C01-L01-HW-003` | Hengwu / 衡务 | `level.complete` | Inspection circuit restored. Keep the manual route clear. | 巡检回路已恢复。请保持人工通路畅通。 | 20 秒后过期 |
| `C01-L01-ZQ-009` | Zhanque / 栈雀 | `level.complete` | Good. Someone else might need those stairs. | 那就好。说不定还有人要走这段楼梯。 | 仅前句已开始后可排入播放；延迟 4.2 秒；22 秒后过期 |

`maintenance.observed` 来自可选检视百叶实际到位；`upper.lookback` 来自上层实际回望，不把“走到高层”当作已经观察。栈雀不解释许澈或设施真相，也不提供解法。所有必要目标和机关状态仍须通过空间、机械及灯光独立理解；静音和无字幕均可通关。

## 从旧中文音频迁移

M1-R1 的11个ID在R2继续使用，**同ID不代表旧中文WAV可以继续用**。新原始 `production.json` 和处理后 `manifest.json` 均为版本2，标记 `spokenLanguage: en`，绑定英语 `voiceText`、角色、实际声线/culture、速率、音量和文件SHA-256。字幕中文与中文显示名不参与声音身份校验；只润色中文无需重录，修改英语原文必须重录。更改制作速率、音量或滤波也需要重新生成/处理。

如果以前生成过中文素材，先把 `.cache/voice/raw/` 和 `assets/voice/l01/` **移动备份到这两个有效路径之外**，保留旧录音和metadata，再重新生成英语。不要仅重命名WAV或手改旧manifest伪装英语。脚本会拒绝v1原始记录/manifest、中文culture、过期英语原文、错误角色、错误哈希和没有manifest的裸WAV。完全没有音频是正常的0/N字幕回退；不完整但合法的英语清单可部分打包。旧音频被明确拒绝时，应按此迁移，而非删掉校验。

## Windows 10 / 11 可复现制作

需要 Windows PowerShell 5.1、Node环境，以及能由桌面 `System.Speech` 枚举的离线英语声音。游戏玩家不需要TTS安装；只有素材制作机需要。Windows设置页、OneCore或在线朗读里的声音不一定对System.Speech开放，以本机脚本的实际列表为准；本流程不改注册表、不下载声线、不调用云服务。

在仓库根目录先列出全部已启用桌面声音：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1 -ListVoices
```

若列表中没有英语声音，请先在Windows完成适用的离线英语语音安装，再重跑列表；脚本会停止而不是把中文声音当成英语声音。默认首选 `en-US`，允许已安装的其他 `en-*` 声线；角色优先分配不同音色，宁可用第二个英语culture也不重复首个音色。只有一个英语声音时明确警告，速率/滤波的区别不能称为两条不同声线。

完整生成与检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1
node scripts/voice-assets.mjs --process
node scripts/voice-assets.mjs --check --strict
npm run dev
```

`Bypass` 仅作用于该PowerShell进程，不修改系统或用户的持久策略。脚本是ASCII源文件，显式以UTF-8读双语JSON，只把 **`voiceText`** 传给 `SpeechSynthesizer.Speak()`。它采用可靠普通文本路径，使用标点表达停顿，不要求SSML支持。当前角色SAPI速率为栈雀 `1`、衡务 `-1`，音量均 `95`，不作极端语速/音高调整。

可从本机列表复制实际名称，显式选角色声音；下列尖括号文本必须替换为自己的名称，仓库不假装预装某条声音：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1 -ZhanqueVoice "<installed English voice A>" -HengwuVoice "<installed English voice B>"
```

也可写入各角色 `voice.windowsName` 固定制作机配置；明确指定的名称若未安装、未启用或不是英语会报错。显式选同一条声音也会警告。

逐句重录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tts.ps1 -Ids C01-L01-ZQ-006
node scripts/voice-assets.mjs --process
node scripts/voice-assets.mjs --check
```

在PowerShell交互终端内一次选多句可使用 `& .\scripts\tts.ps1 -Ids 'C01-L01-ZQ-006','C01-L01-HW-002'`。局部生成只替换所选原始WAV；`production.json`合并未选句的旧记录，保留各句实际声线而非给全部旧录音套上新配置。随后 `--process` 校验并处理所有有记录的句子。若其他英语文本也改过，会列明过期句，需要补录对应ID；不会把过期声音静默打包。若合成中断，按相同ID重跑，再处理。

原始缓存为 `.cache/voice/raw/*.wav`，22,050Hz、16bit、单声道PCM。`production.json`记录Windows引擎、实际声音/culture、英语原文、语速、音量、SHA-256。原始缓存不入库。处理器只依赖Node内置模块，校验所有take后才写输出，施加各角色高通/低通、峰值归一化及首尾10ms淡变，写 `assets/voice/l01/*.wav` 和英语manifest。WAV直接供ArkGlide/Web Audio解码，无需ffmpeg、额外编码依赖或运行时TTS。

准备游戏仅打包实际存在且通过英语manifest验证的资源。`--check`报告现有/缺失；`--check --strict`在配音不齐时返回非零，用作完成素材交付的门槛。处理拒绝损坏、不合规格、静音或过长文件；这些检查不能证明人声发音自然，不能替代试听。试听认可后提交处理后WAV与manifest，重新 `npm run dev`；运行中的游戏不会自行调用Windows合成。

## 当前实际素材清单与验证边界

以下15句全部**待本地Windows生成**，实际英语配音为0/15：

```text
assets/voice/l01/C01-L01-ZQ-001.wav
assets/voice/l01/C01-L01-ZQ-002.wav
assets/voice/l01/C01-L01-ZQ-010.wav
assets/voice/l01/C01-L01-HW-001.wav
assets/voice/l01/C01-L01-ZQ-003.wav
assets/voice/l01/C01-L01-HW-002.wav
assets/voice/l01/C01-L01-ZQ-005.wav
assets/voice/l01/C01-L01-HW-004.wav
assets/voice/l01/C01-L01-ZQ-006.wav
assets/voice/l01/C01-L01-ZQ-011.wav
assets/voice/l01/C01-L01-HW-005.wav
assets/voice/l01/C01-L01-ZQ-007.wav
assets/voice/l01/C01-L01-ZQ-008.wav
assets/voice/l01/C01-L01-HW-003.wav
assets/voice/l01/C01-L01-ZQ-009.wav
```

任何平台可运行 `node scripts/voice-assets.mjs --check` 查看真实清单。新增 [voice-assets-r2.test.mjs](../tests/voice-assets-r2.test.mjs) 覆盖缺音、旧中文/裸WAV拒绝、英语culture与双角色配置、中文改写不失效、英文改写失效、角色/速率/原始及成品哈希、部分重录合并后的处理保留。测试只在临时目录创建非人声PCM夹具，**从未作为配音资产交付**；局部重录测试验证合并后的Node处理行为，不能声称在Linux执行了PowerShell的元数据合并或真实语音生成。对白与浏览器测试的本轮结果另见R2交付记录，不能把R1历史通过数当本轮结果。

当前未执行Windows PowerShell、实际英语声音枚举/合成、声线试听或Windows解码实测。首次本地生成后必须试听英语发音与停顿、两角区分、音量、广播可懂度和实际操作中的节奏；同时切换中文/English，确认字幕跟随同一条英语音频结束。关闭对白后仍应能理解本关。没有听到真实声音前，声线和演出保持**待人工验收**。

## 现有机械反馈文件（非语音）

四个文件由 [feedback-assets.mjs](../scripts/feedback-assets.mjs) 的确定性波形算法原创生成，22,050Hz单声道PCM，走独立机械总线；它们不计入15句英语配音进度。R2没有把它们改成配音替代品。

| 文件 | 长度 | 触发 |
| --- | --- | --- |
| `assets/audio/prototype/mechanism-turn.wav` | 0.32秒 | 首次握住遮板手轮 |
| `assets/audio/prototype/mechanism-inspect.wav` | 0.18秒 | 松开检视百叶 |
| `assets/audio/prototype/mechanism-connect.wav` | 0.48秒 | 遮板到位且原生门对启用 |
| `assets/audio/prototype/mechanism-return.wav` | 0.42秒 | 上侧配重闩释放 |

语音V开关仅控制对白，不静音机械反馈。已结束的机械句柄不再暂停/恢复；声音播放异常只记录诊断，不能阻止关卡操作。
