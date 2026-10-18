# ArkGlide API 核查与设计边界

核查日期：2026-10-17。M0 结论：现有接口足以支撑**受约束的单人折口、跨门抓取和设施机关设计**；不能仅据接口核查宣布 Foldline 可玩、达到 Portal 2 的物理保真度或支持任意复杂组合。下文 M0 证据保留其原始范围；M1 的 L01 集成结果另列于文末。

## 来源、基线与实际执行

- 游戏仓库原始 HEAD：`9c442638d8a596a3ea21b65db1b7a23e7249a623`，原先只有 README 与 LICENSE，没有已有游戏代码可验证。
- 引擎：[arkglide/arkglide](https://github.com/arkglide/arkglide)，核查固定快照 **`da8ea1cf098ad99ccc89451d34bf4e272cdc15aa`**（当时 main）。下文链接固定该快照，不把未来 main 的变化混入证据。
- 在仓库外 `/tmp/foldline-m0-research/arkglide` 只读研究源码并安装研究依赖，不作为游戏子模块、不向游戏仓库复制引擎或示例。
- 环境：Debian 13 / Linux x86_64，Node.js 24.19.0，npm 11.9.0。引擎 `.nvmrc` 为 20，package 要求 Node `>=20.19.0`；本轮使用的 24 满足范围，但没有复验 Node 20。
- 依照引擎锁文件执行 `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/foldline-m0-npm-cache`；禁用的是安装生命周期脚本，并未关闭 TLS 或 lockfile integrity。测试直接读取源码与仓库自带 Jolt，无须生产构建或重编译 WASM。

实际执行：

```sh
# 在上述固定引擎快照根目录；结果写入临时 api-check.tap，保留 Node 退出状态。
node --test --test-reporter=tap --test-concurrency=1 \
  tests/portals.test.mjs tests/composition.test.mjs tests/triggers.test.mjs \
  tests/foundations-projection.test.mjs tests/foundations-state.test.mjs
```

| 本轮执行结果 | 数量 |
| --- | ---: |
| tests / pass | 79 / 79 |
| fail / cancelled / skipped / todo | 0 / 0 / 0 / 0 |
| Node 退出状态 | 0 |
| 用时 | 约 6.3 秒 |

测试使用 Babylon NullEngine 与真实 Jolt 绑定，部分状态由夹具受控设置。它们是**现有接口回归**，不是浏览器画面、完整键鼠通关、Foldline 首次游玩或人工验收。本轮没有运行浏览器、导出、生产构建、WASM 编译或游戏场景。源码 checkout 在核查后无 tracked 修改。

## 固定证据入口

- [类型与 ScriptContext](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/src/types/arkglide.d.ts)
- [视角/门/抓取约定](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/docs/view-and-portals-api.md)
- [玩法基础约定](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/docs/gameplay-foundations-api.md)
- [输入/音频/UI](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/docs/third-full-api.md)
- [静态导出/动态资源](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/docs/fourth-batch.md)
- [传送门测试](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/tests/portals.test.mjs)
- [信号/运动/光学测试](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/tests/composition.test.mjs)
- [区域触发测试](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/tests/triggers.test.mjs)
- [投射/平面测试](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/tests/foundations-projection.test.mjs)
- [关卡/存档测试](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/tests/foundations-state.test.mjs)

上游 [roadmap 中的旧 Foldline 短篇计划](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/docs/roadmap.md) 仍写六个房间、20～30 分钟。**本仓库以用户本轮规模和阶段约束覆盖该旧游戏计划**；上游只提供接口事实，不提供本作制作授权。

## 能力映射

“已回归”仅表示上述 79 项中的相关用例通过；“源码可用”表示本轮读取声明/实现/文档但未独立跑该能力的运行用例；“游戏层待做”不是缺少引擎接口。

| 设计需要 | 已确认的 API / 实现 | 本轮证据与限制 | 本作采用方式 |
| --- | --- | --- | --- |
| 第一人称与鼠标锁定 | `input.requestPointerLock/isPointerLocked/getMouseDelta`；`cameras.createRig`；`physics.addCharacter` | 相机与角色已回归；真实鼠标锁定未跑。锁定需用户手势，失焦/暂停会释放 | 首次点击只取得控制，不兼作开门/抓取；拒绝锁定有继续提示，不假装成功 |
| 空间连接和视窗 | `portals.create/place/link/setEnabled`、`addSurface`、`watch`、`onTraverse/onBlocked` | 孔径、动量、关闭退让、眼身跨侧等已回归；渲染像素和设备手感未跑 | 初期仅竖直矩形折口；玩家与接驳匣都登记 traveler；安全落脚区在两侧 |
| 锚面 | 独立 BOX 平板；静态独立单材质模型可显式登记 `regions` 平面 | 部分平面与体积用例已回归；不是任意模型自动 CSG，不能注册后任意缩放 | 装饰建筑与锚面碰撞分离，先用稳定平板；不许直接向任意弯曲墙体打洞 |
| 跨门观察/拾取 | `cameras...ray`、`portals.raycast` → `hit/segments/path/truncated` | 穿门总射程与路径已回归；不是直线距离近就一定够得着 | E 拾取只接受实际命中与路径，不越过玻璃；不得把预算截断当有效命中 |
| 有碰撞的跨门搬运 | `interaction.grab(entity,{path,holder,...})`；句柄 `setRay/release/active` | 专项覆盖 remote grab、真实路径障碍、门关闭释放、眼身异侧。不是瞬移背包 | 传入 `trace.path`，对物体 `watch`；距离、力和质量为游戏配置，狭口留余量 |
| 高度与惯性 | `movementMode:'inertial'`、`setVelocity/addImpulse`、门的速度映射 | 墙/地面转换和角速度已有回归；并非任意高速保证 | C03 才引入落差；每次实际验证速度区间、落地区、失败恢复，禁止靠计算草图承诺成功 |
| 坞座/触发区域 | `triggers.create`、`getEntities/contains/query`、`filterEntity` | 原生占用/离开/异常隔离已回归；为离散采样，高速可能漏过 | C01 固定步采样，静置且已松手才锁存；高速终点另用 shapeCast，不能把区域当万能连续碰撞 |
| 机关因果与锁存 | `signals.create/gate/onChange/flush` | AND/OR/NOT/XOR 为无环派生图，回调有预算，源状态不自动存档 | 锁存、保持式坞座、复位和剧情阶段由游戏定义；恢复时重建图并 flush |
| 门、平台、卷闸 | `motion.create`，`setTarget/setPaused/getState/restore`，kinematic 刚体 | 反转、原生承载和存档进度已有回归；不会自动防夹或规划安全路径 | 关门前检测占用/扫掠；堵门停住或退回，不能压死玩家推进剧情 |
| 光路校验 | `optics.addReflector/trace` → `segments/energy/truncated` | 原生法线反射和穿门路径已回归；没有内建伤害/开门 | C04 非致命校验束；可见光束与接收器由游戏层组合，能量/预算不足不触发成功 |
| 承载投射 | `portals.projectVolume/shapeCast`；`visuals.createMesh` + 原生凸碰撞 | 凸体积、遮挡和孔径回归通过；局部障碍可能保守截断，不是任意体积布尔 | C06 的承载带由游戏生成与回收碰撞体；宽度、转角、安全余量待专项灰盒 |
| 定向货流 | `fields.create/update/setEnabled`，`filterEntity` | 源码/文档可用；本轮 79 项不构成该力场的独立运行验证 | C07 首先只运货，不把角色升空；穿门后按各段方向更新力场；开发前需专项复验 |
| 环境反馈/广播/字幕 | `audio.play`、音量总线、`visuals...`、`ui.create` 等 | 源码/文档可用；音频受浏览器手势、声音优先级和资源就绪影响 | 明确的字幕/机械反馈不依赖播放成功；跨门音源传播、口型和配音编辑器不假定存在 |
| 关卡单元生命周期 | `levels.register/load/unload/find/onChange`；预制体局部 ID | 加载失败保留旧关卡、引导实体保留与清理已回归 | 第一章优先一个连贯预制体；跨章在真实闸廊/升降机处加载，不声称九章同时流式常驻 |
| 保存与重试 | `saves.register/capture/restore/save/load`；`storage.read/write` | provider、稳定局部 ID、拓扑/加载冲突检测已回归 | 保存机关源值、锁存、广播旗标、物件归属等；动态资源需 provider 重建，存储失败显示可重试状态 |
| 独立发布 | `npm run export:game -- 项目.arkglide 空输出目录`；HTTP 服务 | 文档/脚本可用；本轮未导出游戏 | 后续单关通过后再验证编辑器/静态包一致、资源加载和子路径部署；当前不生成游戏包 |

## 明确不承诺的能力

1. 任意曲面开孔、运行时任意网格 CSG；本作使用显式锚面。
2. 任意重力方向控制；角色仍世界 Y 向上。视角转动不等于重力改变。
3. 链条两端长期分处折口两侧的连续关节求解。`watchAssembly` 是受约束的整组原子穿越，不作为本作必需谜题。
4. 无限递归、无限门数、高速复杂堆叠的逐帧精确模拟；预算耗尽是错误/限制，不是成功路径。
5. 凝胶、流体、水压/真实电网、连续可破坏建筑、联网合作、自动剧情编辑器、通用 NPC 寻路和跨门声学。供电/风压用可观察且一致的离散机关状态模拟；若以后需要更多能力，另立任务。

## 游戏架构提案（仅设计，不实施）

- 持久引导作用域：输入/玩家、关卡登记、存档 provider、事件路由和暂停。当前区域作用域：门/物件/触发器/声音/动态投射，离开时清理。
- 章节不直接等于 `levels.load` 次数。第一章六单元在同一空间资产中连接；以后可按已设计的实体交通节点分块，不用每扇门强制加载。
- 关卡局部稳定 ID，事件用如 `c01.busCommissioned` 的命名；引用逻辑 ID，不持久化临时运行实体句柄。
- 第一章切换服务折口时，先确保旧路已有实体返回路、没有半穿越/持物，再释放旧对；不能静默覆盖正在用的折口。规则详见第一章事件设计。
- 恢复顺序须与引擎生命周期联合验证：加载稳定关卡 → 恢复引擎状态 → provider 恢复/重建源值与表现 → flush → 下一固定步重新采样触发器 → 解除控制锁。不得在 `levels.load` 进行中保存。
- 内存中的 `saves.capture` 可用于会话重试；持久写入失败不能声称已保存，暂停中保留重试和错误提示。浏览器清站点数据后不能保证存档。

## 技术风险与后续验证门

| 风险 | 已选择的设计缓解 | 仍需实际验证 |
| --- | --- | --- |
| C01-L02 小折口卡匣/穿门拉力 | 0.8×0.9m 折口，0.48×0.36×0.55m 单匣；单次转角、无堆叠 | 抓取路径、旋转、任意丢放、门关闭、原生碰撞及恢复；失败时扩大容差或修改空间，不加瞬移作弊 |
| C01-L03 看不见落点/跳跃绕过 | 高低观察点、宽锚面、实心回路与至少 6m 的侧向隔离 | 实际相机 FOV/胶囊/跳跃/带物组合，必要时改跨度和遮挡 |
| 递归视窗成本与晕动 | 起始预算：一对活动折口、深度 2，明确低质回退选项 | 实际目标设备帧耗时、近门画面、回正/视角舒适度；此预算尚非性能保证 |
| 卷闸/门碰撞叙事 | 安全占用检测、延后闭合、状态到位才播结果 | 堵门、重试、后台恢复、低帧率；不得只通过计时器假定关完 |
| 动态投射和货流 | C06/C07 另立技术验证，简化凸截面和速度范围 | 有效宽度、端点改变、回收旧碰撞、场方向/过滤及预算；现在不扩建引擎 |
| 跨章回访一致 | 单一设施图与状态 provider，按同一局部布局复用 | 加载边界位置/声音/门状态吻合，错误和卸载无残留 |

技术准入与体验准入是两回事。一个接口用例通过，不会自动把涉及它的关卡标成“设计可行性已实测”。

## 发布约束

引擎快照 [LICENSE](https://github.com/arkglide/arkglide/blob/da8ea1cf098ad99ccc89451d34bf4e272cdc15aa/LICENSE) 为 **AGPL-3.0**；本游戏现有 MIT 文件不消除引擎和第三方的许可义务。导出链含许可复制步骤。正式发布前须确认组合、分发、源代码提供及素材授权方案；本轮未改变许可，也未发布运行包。

## M1 · L01 原生集成记录

本轮仍固定 `da8ea1cf098ad99ccc89451d34bf4e272cdc15aa`，通过 `scripts/engine.mjs` 获取独立缓存 checkout 并校验精确 SHA、已跟踪文件无修改与依赖锁指纹；不修改引擎源码。`scripts/prepare-game.mjs` 使用官方 `normalizeProject`、runtime 同步及 `createStaticGame` 导出本地 HTTP 文件，不执行完整编辑器构建、不调用 ZIP 生成。

游戏使用 `physics.character`、`cameras.createRig`、`portals.addSurface/place/link/watch/raycast`、`motion.create`、`saves.capture/restore` 及原生输入/所有者清理。通关路径没有脚本写玩家坐标、切镜头或区域瞬移；只有 R/跌落重试恢复原生入口快照。出口区域只判定完成，不搬运玩家。

M1 浏览器检查是在 Chromium/WebGL2 中发送键鼠输入，读取原生遍历事件、角色/相机与资源遥测，并实际截取画面。覆盖双向及反复穿越、门缘碰撞、部分跳跃边界、实体楼梯、暂停/重试/重载与卸载；完整结果、浏览器版本、原始日志及限制见 [L01 记录](../m1-c01-l01.md)。这不是重新执行 M0 的 79 项引擎测试，也不覆盖未来抓取、自由放门、升降平台或目标设备性能。

实际接入修正：timeScale=0 时原生输入禁用，故首次点击先恢复模拟一帧再请求鼠标锁定；暂停菜单 R 使用所有者跟踪的键盘监听；遮板移开后才执行原生安装射线；梯闩移至远离 B1 的位置，避免 1.8m 真实跨门交互射线提前命中。以上属于输入菜单和关卡布局，没有以 L01 特例替代引擎物理。本轮未确认需要引擎重构的通用缺陷。


## M1-R1 · 随行设备与离线对白

仍使用同一固定引擎，没有复制或修改引擎源码。通过官方 `project.scripts` 和原生 ESM 模块加载器注册关卡、对白、随行模块；JSON 台词数据生成项目内 `.js` 数据模块，不添加构建依赖。`visuals.createMesh/createMaterial/setPose` 构成栈雀的12片临时实体和5个材质，不建碰撞、不做NPC寻路。世界姿态从原生第一人称相机导出，只平滑局部挂载/折翼，靠近已启用门口时收折；玩家穿越仍由原生 portals/physics 完成。

对白使用 `audio.play` 的实际句柄状态、暂停/恢复和专用混音总线；字幕由数据事件队列管理。provider升为2以包含新增百叶/对白消费状态，恢复停止旧音频、清队列并保留玩家语音/字幕偏好。机械音效调用单独捕获错误，已结束句柄不再pause/resume，音频失败不能阻塞机关。

标准16bit PCM WAV可直接加入 `content.audio` 和官方导出音频Map。实际交付4个确定性原创机械原型音效；11句System.Speech配音均待Windows本地生成。处理工具核对原文、元数据及SHA256，不能用静音占位冒充完成。Windows脚本及声线试听未在Linux实测；方法及清单见 [语音制作](../voice-production.md)。R1的自动化检查与截图以 [R1记录](../m1-r1-review.md) 为准，不把历史79项或旧M1三项当成本轮结果。


## M1-R2 · 双语字幕与持久偏好

保持固定引擎及原生ESM注册方式，新增游戏层 `dialogue-preferences.js`。`ctx.storage.read(key)`异步返回JSON或null，`write(key,json)`返回Promise；opaque iframe通过原生host桥接，不直接访问localStorage。导出gameId取自稳定projectId，正常同源可跨播放器重进/刷新保留选项。存储调用在设置变化时发出，销毁阶段不再新写；读写失败降级，不阻塞关卡。存储禁用或站点数据被清理时不能承诺持久化。

原生音频句柄决定有声字幕结束，切换语言只更新HUD，仍播放同一英语文件。实际英语WAV0/15，Node受控句柄、PCM夹具不计作配音或试听证据。原始/成品metadata升英语v2，避免稳定ID误用旧中文录音。对应针对性/浏览器结果见[R2记录](../m1-r2-review.md)，未重跑历史79项引擎测试，不扩张引擎能力。

## M1-R3 · 正式视觉候选与公开渲染边界

固定SHA仍为`da8ea1cf098ad99ccc89451d34bf4e272cdc15aa`。核查原生`scene-runtime.js`的glTF导入、PBR材质库（albedo/normal/metallicRoughness及uvScale）、lightType与环境设置；`visuals.createMaterial/createTexture/apply(includeChildren)/createMesh`可用于共享材质与紧凑栈雀。官方`createStaticGame`接收model/texture buffer Map，资源在本地生成包内，无在线素材依赖。

项目公开设置无bloom/tone mapping/雾参数，未臆造API。当前以两盏点光、环境光、原生glTF静态顶点烘色、小面积PBR金属和canvas轻微saturate/contrast实现最小画面统一；没有引擎修改、私有渲染器访问或额外屏幕采样通道。自动化测试中的renderer读取仅用于检查/性能研究，不进入游戏实现。实际能力证据与限制见[R3记录](../m1-r3-review.md)。
