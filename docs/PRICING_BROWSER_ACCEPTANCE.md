# Pricing Studio 浏览器验收记录

2026-11-18（Europe/Berlin）。实测基线为 `main` 的 `eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0`，包版本为 `0.3.0-dev`。测试期间合入了调研文档 `b40a6ca`。三项修复在候选包 `0.3.1-dev` 上复验。测试使用 Debian Chromium `156.0.8078.79` 的真实桌面会话、虚构资源清单、华为云公开目录和独立故障夹具。

## 在线版

`npm run dev` 在 4173 启动，浏览器使用 `http://127.0.0.1:4173/` 的 Web + Worker。启用 Node 的环境代理支持后实际核价。独立检查 `GET /` 和 `GET /app.mjs` 正常。释放端口后运行 `NODE_USE_ENV_PROXY=1 sites-preview start <web 绝对路径>`，仍报 `relay could not open browser port 4173: timed out waiting for relay readiness`，随后 `sites-preview status` 为 stopped。共享 Chromium 访问本地服务成功，预览中继故障仍存在。原私有生产站 `0.3.0-dev` 打开到登录页，点击 Continue with ChatGPT 到 OpenAI 登录，共享浏览器的安全登录未完成，认证后的流程待复验。

| 场景 | 本地在线版浏览器结果 |
| --- | --- |
| CSV、XLSX 文件选择 | 通过。各 4 行。EC2 `m6i.2xlarge Linux` 为 2 台 × 730 小时，源计费 `reserved`。EBS `gp3` 保留 500 GB-month 用量与 500 GB 容量。RDS MySQL 保留规格、1 台、730 小时。S3 为 100 GB-month。 |
| 映射与切换 | 通过。确认前 4 项 Pending，金额为空。按需、包月、包年独立选择，每次切换清除确认。确认后 3/4 行可计价。 |
| 官方核价成功 | 通过。分别点击，ECS、EVS、RDS 每模式 3 项成功，共 9 项。修复版包年再次点击成功。 |
| 核价失败、缺价、过期、不支持 | 通过。测试专用 Worker 对上游模拟 503。浏览器显示中文失败提示，过期 ECS、缺价格 EVS、无包年报价 S3 为 Pending，部分小计 1/4。另实际停止本地 HTTP 后点击，显示英文失败提示，前后金额及验价时间相同。 |
| 15% 折扣、摊销、预付 | 通过。见下表。页面明确部分小计。 |
| 中英文切换与重载 | 通过。切换后保留已导入字段和改写的方案名。重载后 0 行，语言偏好保留。 |
| 文字 PDF | 通过。实际选择虚构 PDF，1,460 小时累计用量，无台数，来源账期费用有值、全年金额空白。两页虚构 PDF 的第二行来源页码基线误为 1，修复版导出为 2。 |
| Excel 下载与重开 | 通过。实际点击顶部及报价卡按钮。报价卡修复后，在 757 px 高视口可滚到按钮并下载。使用 openpyxl 独立重开。 |
| 私有生产站 | 阻塞。等待获准账号登录后复验。 |

公开价格来自华为云欧洲站 `eu-west-101`，币种 USD。下列金额为虚构资源方案的部分小计。

| 模式 | 未折月费或月均 USD | 折后月费或月均 | 年度情景 | 首期预付 |
| --- | ---: | ---: | ---: | ---: |
| 按需 | 597.22 | 507.64 | 6,091.57 | 空白 |
| 包月 | 451.43 | 383.72 | 4,604.59 | 383.72 |
| 包年 | 377.86 | 321.18 | 3,854.20 | 3,854.20 |

合计重开 12 个 Chromium 下载的工作簿，均检查 Input、Service Mapping、Public Pricing、Quotation、Assumptions。核对确认状态、官方产品 ID、价格来源、验证时间、单位及包月/包年的独立周期。使用 Decimal 根据下载件中的单价与输入独立复算 6 份报价，核对页面和 Assumptions，检查 Pending 费用单元格为空。原始导出保存在本地，仓库中的核验摘要列出每份下载件的大小、SHA-256 和场景结果。[下载件核验摘要](evidence/pricing-browser-acceptance/downloads-verified.json)

[在线报价卡导出截图](evidence/pricing-browser-acceptance/online-quote-download.jpg)

## 离线版

| 场景 | 结果 |
| --- | --- |
| 浏览器下载、解压、校验 | 通过。`0.3.0-dev` 866,490 bytes，`0.3.1-dev` 866,718 bytes。两版本 ZIP 均实际从网页下载，与各自归档逐字节一致。候选 ZIP SHA-256 为 `95dee41f900893de3e7774e454e589fba8b918ebb48bab6d0d142da0b7953376`。 |
| 双击、浏览器文件打开 | 阻塞。Thunar 双击 HTML 打开 Mousepad。选择用 Chromium 打开没有加载页面，Chromium 原生文件对话框选中同一文件后也未加载。用户本机实测待反馈。 |
| 单页功能预检 | 通过（loopback HTTP 初始加载）。加载候选 ZIP 对应的同一份 HTML 后停止 HTTP 服务，仍通过文件选择器导入 CSV/XLSX 各 4 行、文字 PDF 2 行。核价按钮禁用。包年 CSV 与账期 PDF 都实际下载 Excel，复核五张表和 PDF 页码。 |
| 原价格有效期 | 单页预检通过。界面、ZIP 清单和 Excel 沿用正式快照 `2026-11-17T10:08:32.992132+00:00` 与每条原验证时间，TTL 7 天。 |
| 本机完整流程 | 待用户执行。验证文件方式启动、断网导入、模式确认、导出及重载清空。 |

[离线单页预检截图](evidence/pricing-browser-acceptance/offline-bundle-precheck.jpg)

## 本机复验

1. 下载并解压 `0.3.1-dev` ZIP。另下载下方虚构测试文件后断网，双击解压出的 HTML。如双击打开编辑器，可在 Chrome 或 Edge 的“打开文件”中选择该 HTML。确认页面显示 `0.3.1-dev`。[下载候选 ZIP](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/releases/pricing-studio/v0.3.1-dev/Pricing-Studio-0.3.1-dev-Offline.zip)
2. 导入包内 `aws-fictional-mvp.csv`，再用相同数据的 XLSX 复验。各应有 4 行。切换中英文后清单应保留。分别切换按需、包月、包年，每次切换后须重新确认映射。核价按钮应禁用。过期、缺价和未确认行应为 Pending，金额留空。[虚构 XLSX](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/pricing-studio/web/tests/fixtures/aws-fictional-mvp.xlsx)
3. 导出 Excel 并打开核对本页所列五张表、页面小计和 Pending 空白。重载后应为 0 行。再导入文字 PDF，单页样例应显示 1,460 小时，两页样例的来源页应为 1、2。[虚构单页 PDF](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/pricing-studio/web/tests/fixtures/aws-fictional-bill.pdf) · [虚构两页 PDF](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/pricing-studio/web/tests/fixtures/aws-fictional-two-page.pdf)
4. 反馈操作系统、浏览器及版本、包版本、通过或失败的步骤。用户本机结果单独署为用户执行。

恢复生产复验时，在共享浏览器访问原站并选择 Continue with ChatGPT，使用获准账号登录后交还控制。[私有生产站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

候选版本在 `pricing-studio/web/` 执行 `npm run release:offline`，83 项 JS 和 34 项 Python 测试通过，0 失败。环境为 Node 24.22.1、Python 3.12.14、openpyxl 3.1.5。相同源码重建得到相同 ZIP。私有生产站当前为 `0.3.0-dev`。剩余验收和 GitHub 同步结果见[开发状态](DEVELOPMENT_STATUS.md)。
