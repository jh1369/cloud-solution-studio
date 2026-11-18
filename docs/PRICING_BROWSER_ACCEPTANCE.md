# Pricing Studio 浏览器验收记录

## 2026-11-18 私有站发布在线修复

- **生产部署** Sites 第 6 版呈现 `succeeded`，部署源码 `0cdb286b139b359e25d2b90692428a1092cbc12b`。发布包使用 GitHub `c60138e` 的在线版本 `0.3.2-dev`。原站访问范围经核对仍限所有者。[原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)
- **部署前验证** 发布用 Worker 的在线首页标记 `0.3.2-dev`，已有离线下载文件与归档逐字节相符。两组 Chromium 156.0.8078.79 分批场景通过，10 份实际下载的 XLSX 用 openpyxl 重开核对五张表。82 项 JavaScript、4 项 Python 检查通过。
- **待验** 第 6 版登录后工作台与生产报价、导出仍待实测。以下首批 503、延迟、真实核价和下载证据均来自本地环境。生产下载件 0 份。

## 2026-11-18 在线分批核价与 Excel

执行人 Codex。审核基线 `main/a69bb13106b83d5bee1cfcff4810a1bdc7087b14`。修复源码 `45770a63bb43c654ae861944cea9ce87c1fa395f`，本地页面和 package.json 显示 `0.3.2-dev`。以下本地检查使用 Debian Chromium 156.0.8078.79、Playwright 和 openpyxl 3.1.5。

| 场景 | 基线复现 | 本地修复版实测 |
| --- | --- | --- |
| 11 个虚构 SKU，首批 10 项返回 503 | 浏览器未发出第 11 项的请求 | 通过。第二批实际发出；等待时两个入口均导出原小计 90 USD，结束后均为 110 USD。首批 10 项的旧证据和时间逐行相同，包含 1 项过期、1 项缺价。 |
| 首批 8 项成功、2 项 Pending，第二批延迟 | 页面为 90 USD，顶部实际下载件为 250 USD | 通过。第二批返回前两个入口均为 90 USD，结束后均为 270 USD。单价、SKU、时间、证据及 Pending 空金额已核对。 |
| 页面打开后跨过有效期 | — | 通过。仅推进测试页时钟，点击两个入口分别导出，页面和工作簿均为 11 项 Pending、空金额，保留原核验时间。 |
| 本地 Web + Worker 主流程 | — | 通过。选择仓库虚构 CSV、XLSX 各 4 行，文字 PDF 2 行。导入未确认、三模式重新确认、15% 折扣、中译英及重载清空均实测。PDF 的来源页 1、2，用量 1,460、730 小时，折后账期小计 463.27 USD，年度空白。 |
| 真实官方核价及连接失败 | — | 通过。本地 Worker 请求华为云官方公开接口，按需、包月、包年各 3 项，共 9 项成功。比对返回产品、单价、证据、时间与下载件。另在浏览器中阻断一次请求，页面出现英文失败提示，失败前后 Pricing 和 Quotation 表逐行相同。 |
| 生产站登录后的工作台 | — | **阻塞。** 本轮从私有入口进入 OpenAI Welcome back，安全登录请求未完成。Sites 第 5 版部署状态为 succeeded，部署源码 `fff0d1fe414b09464089a4f6734b6a03f56738ff` 对应 `0.3.0-dev`。登录后的页面版本、上述生产流程和下载仍待验；生产下载件 0 份。 |

本地真实公开价小计（USD），顺序为折后月费或月均、年度情景、首期预付：按需 507.64 / 6,091.57 / 空白；包月 383.72 / 4,604.59 / 383.72；包年 321.18 / 3,854.20 / 3,854.20。11 SKU 故障测试使用独立的虚构费率。

每个导出均等待浏览器下载事件后保存。openpyxl 重开本地 19 份工作簿（分批及失效场景 10 份，主流程 9 份），核对 Input、Service Mapping、Public Pricing、Quotation、Assumptions。[下载件大小、SHA-256、场景和金额](evidence/pricing-browser-acceptance/online-batch-0.3.2-dev.json)

复跑分批用例：在 `pricing-studio/web/` 运行 `python -m http.server 4173 --bind 127.0.0.1 --directory public`，然后用可加载 Playwright 的 Node 环境运行 `CHROMIUM_PATH=/usr/bin/chromium node tests/browser/batch-refresh.cjs`。测试只向 loopback 提交虚构请求。另行运行的真实核价使用同一 Worker 的本地 HTTP 适配器。本轮本地集成构建复用上轮归档的下载资源，未生成离线包。

### 先前验收记录


2026-11-18（Europe/Berlin）。实测基线为 `main` 的 `eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0`，包版本为 `0.3.0-dev`。测试期间合入了调研文档 `b40a6ca`。三项修复在候选包 `0.3.1-dev` 上复验。测试使用 Debian Chromium `156.0.8078.79` 的真实桌面会话、虚构资源清单、华为云公开目录和独立故障夹具。

## 2026-11-18 重试 · 在线版优先

执行人 Codex。GitHub `main` 实查为 `227ff50d2dcfc4fd77e86e749bc9f5604eaeeddb`，网页候选包 `0.3.1-dev`。Sites 最新保存版本为第 5 版，部署状态为 `succeeded`，部署源码 `fff0d1fe414b09464089a4f6734b6a03f56738ff` 与已归档的 `0.3.0-dev` 发布记录一致。实际页面版本待进入工作台读取。

| 研究文档第 4 节待验项 | 本轮私有在线版结果 |
| --- | --- |
| 浏览器与入口 | 共享桌面 Chromium 156.0.8078.79 打开生产站，显示 Sign in required。点击 Continue with ChatGPT 到达 OpenAI 的 Welcome back。重试同样到达登录页。 |
| 虚构文件导入 | 登录阻塞。待核对 CSV、XLSX 各 4 行，文字 PDF 的用量、页码及数量边界。 |
| 确认与金额 | 登录阻塞。待查三模式切换后重新确认、15% 折扣、预付、摊销和 Pending 空金额。 |
| 官方核价 | 登录阻塞。待查真实刷新和失败提示，比较失败前后的官方产品、地区、模式、币种、核验时间和金额。 |
| 双语、下载与重载 | 登录阻塞。本轮生产下载件 0 份。登录后逐一重开五表核对页面读数及价格证据，再核对重载清空。 |
| 离线启动与有效期 | 根据用户最新决定暂停。暂停前从上述 SHA 下载 ZIP 并解压，866,718 字节，SHA-256 与下方归档一致。Thunar 双击打开 Mousepad；Chromium 原生“打开文件”选择同一 HTML 后显示 “This page is blocked / Your organization doesn’t allow you to view this site”。用户本机尚未执行。 |

生产验收需在执行测试的同一浏览器登录。通过下方私有站点入口选择 Continue with ChatGPT，用有访问权的账号完成安全登录，返回 Pricing Studio 工作台后交还控制。下列本地 HTTP 结果和 12 个下载件来自上轮。

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

候选版本在 `pricing-studio/web/` 执行 `npm run release:offline`，83 项 JS 和 34 项 Python 测试通过，0 失败。环境为 Node 24.22.1、Python 3.12.14、openpyxl 3.1.5。相同源码重建得到相同 ZIP。候选源码及离线包已合入 `main`，提交为 `836b740`。GitHub 下载的 ZIP 与实测归档逐字节相同。私有生产站当前为 `0.3.0-dev`。[候选版提交](https://github.com/jh1369/cloud-solution-studio/commit/836b740de649b63dc9c915ff8d7e16fbadb42de4) · [开发状态](DEVELOPMENT_STATUS.md)
