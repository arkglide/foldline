# C01-L02素材

复用L01已经下载并登记许可的少量材质，不复制文件或增加新的远程运行依赖：

| 使用文件 | 来源/作者 | 许可 | 用途 |
| --- | --- | --- | --- |
| `../l01/concrete023-color.jpg` | [ambientCG Concrete023](https://ambientcg.com/a/Concrete023)，Lennart Demes | CC0-1.0 | 地坪与防潮墙体底色 |
| `../l01/metal032-color.jpg` | [ambientCG Metal032](https://ambientcg.com/a/Metal032)，Lennart Demes | CC0-1.0 | 钢构、托台与既有栈雀外壳 |
| `signage.svg` / `signage.png` | Foldline原创排版，DejaVu Sans由浏览器栅格化 | 本仓库MIT | 检修区、A2孔径、锁存坞、密封备件窗标识 |
| `game/l02-project.mjs`中的几何/匣子附件 | Foldline原创工业组件组合 | 本仓库MIT | 栏框、检修柜、供电母线、托台、采光带、匣子把手和护边 |

原下载URL、许可快照和完整来源在[原素材记录](../l01/README.md)及其manifest。此目录manifest记复用文件/新增文件SHA256和大小。没有新增工业模型包、正式NPC模型或未经许可的素材。

`node scripts/l02-signage.mjs`用已有Playwright/Chromium离线重建PNG（Linux默认`/usr/bin/chromium`，可用`PLAYWRIGHT_CHROMIUM_EXECUTABLE`覆盖）。这是美术维护工具，不随游戏启动运行；换系统字体可能改变栅格像素，需要重新更新manifest。源SVG保留编辑性，运行包只用PNG。

场景静态组件合为8个原生glTF批次；匣子主体为原生动态刚体，把手/护甲为其子级无碰撞视觉网格。实体窗、托盘和门均有相应原生碰撞。不以子级视觉部件施力或跨墙取物。
