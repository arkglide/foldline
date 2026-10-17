# Portal 2 方法研究与 Foldline 的原创边界

查阅日期：2026-10-17。本文是设计研究，未声称本轮亲自完整游玩 Portal 2，也不使用其内容作为 Foldline 的素材或谜题模板。

## 来源及证据强度

1. [Portal 2 developer commentary](https://theportalwiki.com/wiki/Portal_2_developer_commentary)：Portal Wiki 托管的**游戏内开发者评论转录**。发言来自 Valve 开发者，但网页是第三方转录；本文按评论标题和署名定位，仅概括方法，不大段转载。
2. [Portal 2 章节/关卡导航](https://theportalwiki.com/wiki/Portal_2)：第三方作品索引；已读取页面中的 Single-player 章节与子单元列表，用来核查“章节不是单个房间”，不把导航项机械等同于谜题数。
3. [Valve Developer Community：Portal 2 level creation](https://developer.valvesoftware.com/wiki/Portal_2_level_creation)：本轮请求被挑战页拦截，**未读到正文，不作为结论依据**。没有绕过访问限制。

以下“作品观察”和“对本作的提案”均与开发者原话分开；“引入→理解→运用→变化→组合→挑战”是本项目采用的工作框架，不冒称 Valve 发布的固定六步公式。

## 章节组织的启示

导航显示单人战役有九章，各自包含多个测试/设施/剧情单元：

| 参考作品章节 | 在章节组织上的作用（本文归纳） |
| --- | --- |
| The Courtesy Call | 重新认识操作、空间与设施状态，教学与剧情开场并行 |
| The Cold Boot | 逐项建立新装置语法，允许稳定因果实验 |
| The Return | 复用并组合已知规则，不以每章一新道具划分内容 |
| The Surprise | 在既有机制熟悉后改变目标和预期 |
| The Escape | 进入生产设施，环境功能成为行动目标 |
| The Fall | 改变尺度、材料与历史层次，提供探索和认知重整 |
| The Reunion | 深化新近学会的规则，重新连接较早的目标 |
| The Itch | 综合挑战与节奏调节交替，熟悉机制进入不同语境 |
| The Part Where… | 利用提前教学完成高潮，避免临场灌输关键规则 |

这些是参考作品的组织观察，**不对应 Foldline 九章的一一改名**。本作不采用“测试者苏醒→人格机器复活→接管→坠入旧实验室→复仇”的剧情。章节边界应来自本作设施功能、玩家认知和行动后果。

## 从可核查评论提炼的方法

| 评论标题 / 开发者 | 可核查的设计经验 | Foldline 的具体处理 |
| --- | --- | --- |
| [Portal Carousel / Alex Vlachos](https://theportalwiki.com/wiki/Portal_2_developer_commentary#Portal_Carousel) | 把等待轮转改为玩家主动选择，能更清楚地教学并让熟练玩家更快完成 | 第一章折口由操作手柄启用；不让玩家等广播结束或等固定循环撞中出口 |
| [World Portals / Eric Tams](https://theportalwiki.com/wiki/Portal_2_developer_commentary#World_Portals) | 顿悟需要难度和信息的平衡；关卡顺序与结构在测试中反复调整 | 章节候选可删改；灰盒阶段前不冻结完整关卡数量；不因已建模型拒绝回退 |
| Nonlinear Progression / Greg Cherlin | 原先线性空间使玩家看不到后续目标、忘记相关要素；压缩空间并让出口靠近起点有助整体推理 | C01-L03 入口能看见高处联络厅，观察路线绕回入口；不是到房间尽头才知道目的 |
| Fizzling Out / Tejeev Kohli | 减少无关分区，并把关键孔洞移到合适视高，解决了理解障碍 | C01-L02 检修折口与备件在同一视野建立联系；窄口规则由尺寸显示；不靠小字讲解 |
| Emancipation Grid / Bronwen Grimes | 规则如果缺少足够交互反馈，即使多次经过也未必被学会 | 坞座接通、折口失效、物体释放均有独立形状、机械运动和声音反馈；不是只换灯色 |
| [Hotel Hell / Randy Lundeen](https://theportalwiki.com/wiki/Portal_2_developer_commentary#Hotel_Hell) | 设施状态可通过玩家正在经历的空间变化揭示，而非先解释背景 | 玩家供电时看见远侧维护卷闸下降；随后亲自走到其背面观察影响 |
| Turret Building Machine / Aaron Nicholls | 把反复提及的制造过程做成可探索设施，让建筑功能讲故事 | 接驳、承载与调度具有看得见的物流去向；设施不是一组无用途的测试箱 |
| Decorating Aperture / Laura Dubuk | 材料、标识和道具的年代变化可表达设施历史 | 本作以防潮材料、反复修补的接驳框、不同年代的安全旁路表达长期公共维护，另建原创材质语言 |
| The Ascent / Chris Chin | 视线向上、尺度打开与探索可在密集解谜后重新组织情绪 | 章节间用有操作目标的检修眺台/走廊换节奏；不复制原作的地下巨构演出 |
| [Elevator Fatigue / Marcus Egan](https://theportalwiki.com/wiki/Portal_2_developer_commentary#Elevator_Fatigue) | 连续复杂谜题会使玩家疲劳，需要节奏变化 | 每章插入可观察后果或实际维护的 Sequence；不是每关都以电梯广播结尾 |
| [Misleading Fixations / Jess Cliffe](https://theportalwiki.com/wiki/Portal_2_developer_commentary#Misleading_Fixations) | 玩家可能被新装置吸引而忘记已学工具，情境重现能唤回知识 | 后期卡点先调查注意力与可见信息，不立即新增提示文字或更多装置 |
| [Preparing For Wheatley's Lair / Alireza Razmpoosh](https://theportalwiki.com/wiki/Portal_2_developer_commentary#Preparing_For_Wheatley.27s_Lair) | 高潮需要的操作应在无压力情况下提前学过 | 第八章完成结局所需的隔离、交接和备用路训练；终章不引入限时新机制 |
| Horrible Accents / Erik Robson | 玩家正想逃离时不会停下听长对白，团队选择删对白 | 广播短、不中断控制；重要事实即使漏听，也能从机关与后续现场理解 |

评论中的**具体布局和解法只用作证据，不移植到本作**。例如，本作不复制单孔屏障谜题，而是借用“控制视觉噪声、调整视高、测试玩家实际理解”的方法。

## 转化为可验收的设计要求

1. 入口先给可辨认目标、障碍和可操作因果，接着才让玩家推理连接方法。
2. 一次引入一个关键关系；相同机制至少在不同单元中经历迁移和重新理解。
3. 保留玩家拥有顿悟的空间。提示优先突出对象/关系，再提示规则，最后提供可选明确提示；不默认报答案。
4. 设施段落有用途：操作阀门改变风声、回访封闭线、建立实体备用路等；不能以走路和听台词充当游戏内容。
5. 关键叙事要有“此前状态→玩家动作→可见变化→可回访后果”，至少两个相互独立的环境证据。
6. 每关实际测试视线、路线和失败恢复；一条自动化最优路径不能证明谜题公平。
7. 灰盒及真实游玩完成前，时长、顿悟与节奏都只是设计假设。

## 原创性核对

- 世界：城市空间运输与防灾设施，不是秘密测试机构；玩家是有工作目标的检修员，不是实验对象。
- 冲突：旧的登记制度与真实现场不一致，恢复供电可能剥夺维护通路；不以讥讽杀人 AI、人格核心换位或实验室复仇为主线。
- 空间：斜井、调蓄井、交错工廊、货运层、接驳庭和防潮建筑；拒绝白色测试室连续排布。
- 操作语法：一对受锚面约束的折口、接驳匣、机械锁存/持续供能、可回收的实体通路；不以无目的箱子压板串关。
- 视觉/声音：层叠矩形折口与折线标识、湿润矿物色、手工补修、局部机械声和短工作广播；不使用蓝橙椭圆、原作道具剪影、字体标志或台词节奏。
- 终局：通过亲手建立供给/撤离/共管的不同路径承担代价；没有复制原作的首领战或终场奇观。

本核对是创作约束，不等于已完成美术或法务验收。后续每个关卡仍须独立审查，不能以“参考方法”为由保留高度相似的具体谜题。
