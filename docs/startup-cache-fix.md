# Windows 引擎缓存启动维护

2026-10-18。用户在已合并M1-R1后报告 `npm run dev` 被 `ArkGlide has tracked changes` 阻止。本次仅修复启动校验与新增缓存的换行配置，未修改游戏、引擎版本或引擎源码，不改变L01的人工验收状态。

## 原因与修复

Windows的Git常启用 `core.autocrlf=true`。固定引擎的 `scripts/sync-wasm.mjs` 将CRLF源文件和LF前后缀拼接，生成 `public/lib/arkglide_math.js`。第一次游戏准备会写这个文件；下一次启动，`git status --porcelain` 可以报告它已修改，但Git归一化后的内容差异为空，旧校验因此误报。

[engine.mjs](../scripts/engine.mjs)现在同时检查对HEAD的工作树内容差异和暂存差异，禁用外部diff/textconv。仅状态标记不再阻止启动；真实文本/二进制/暂存修改仍被拒绝并列出路径。额外检查暂存区可防止“暂存了修改，又将工作文件改回HEAD”被工作树比较漏掉。固定提交和独立checkout检查保留；游戏准备仍只接受固定SHA。

既有缓存及其Git配置不被改写，不执行reset、checkout恢复或清空。新建缓存仅在自身 `.git/config` 固定 `core.autocrlf=false`、`core.eol=lf`，不修改全局配置或 `FOLDLINE_ENGINE_SOURCE` 指向的原仓库。

## 本地恢复

更新本仓库的 `scripts/engine.mjs` 后，先保留 `.cache`，直接再运行：

```sh
npm run dev
```

若新报错明确列出了真实修改的文件，先检查并保留它们。需要重新下载时，可在CMD中将引擎目录重命名为一个尚不存在的备份名，再运行；例如：

```bat
ren .cache\arkglide arkglide-backup
npm run dev
```

此操作保留旧缓存及其中修改，新脚本重新获取相同固定版本。只备份引擎目录即可，不需要删除整个 `.cache`、游戏源码或语音素材。不要用 `git reset --hard` 掩盖真实修改。

## 本次实际验证

- `npm run test:setup`：8通过，0失败/跳过。覆盖既有Windows npm CLI调用、真实Git CRLF签出与混合换行误报、源码/二进制修改保留、暂存修改抵消工作树的情况、错误pin与嵌套checkout拒绝。
- 用真实固定引擎建立独立临时CRLF缓存，连续执行两次完整 `prepare-game.mjs`；首次因CRLF锁文件的缓存指纹不同，按lockfile实际执行了npm ci（161个包），第二次复用依赖；两次均生成136节点L01。Git状态确实报告数学运行时及Babylon许可证换行状态修改，内容与暂存diff均为空，启动成功，既有CRLF配置与生成文件字节保持不变。
- 临时HTTP服务返回200及正确固定SHA；Chromium实际启动原生播放器，L01初始化就绪、0脚本/page错误、栈雀12mesh/5材质、4个机械音频buffer。
- `node --check scripts/engine.mjs`、`git diff --check`通过。没有完整编辑器构建，没有重新执行与本次启动修复无关的整关通关测试。

原始运行记录及源码哈希见[启动证据](evidence/startup-cache-2026-10-18.json)。执行平台为Linux，CRLF来自Git真实签出转换，并非原生Windows系统实测；已实际执行一次锁定依赖安装和一次复用，不声称完成了原生Windows安装。原生Windows上的最终启动结果仍需用户确认。
