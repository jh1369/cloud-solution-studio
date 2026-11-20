# Cloud Solution Studio 开发状态

> Codex 与 ChatGPT 的共享项目状态依据。以实际代码、可复现测试和 Git 提交为准；需求、规划和其他工作区的会话记录不自动等于仓库已完成。

## 1. 当前版本、基线与整体进度

| 项目 | 当前状态 |
| --- | --- |
| 更新日期 | 2026-11-20，Europe/Berlin |
| 当前优先目标 / 模式 | Huawei EU-Dublin 的迁移报价与按版本真实回归，单 Agent |
| 本轮检查基线 | `main` / `36aec0ba7e2eaa79a2cf818d3cb8e015de9b0b18`，含 [PR #22](https://github.com/jh1369/cloud-solution-studio/pull/22) |
| 后续同步权限 | 用户授权充分验证并完成任务后直接合入 GitHub，通过检查的版本自动部署原私有站点，保持访问范围 |
| 规范仓库 / 分支 | `jh1369/cloud-solution-studio` / `main` |
| 本次集成前基线 | `c8261feec774bed955f782ec2e1ed918cd37a025`，原有 13 个初始化提交 |
| 当前网页版本 | 在线源码及原私有站第 17 版均为 `0.3.15-dev` |
| 原 Python CLI 版本 | `pricing-studio/pyproject.toml`：`0.1.0`，保留原业务代码 |
| Sites 部署源码 | `46e6451311bb920c633ad50d2688c5b430d5bd95`（私有站第 17 版） |
| 整体进度 | ECS 受限升配与候选排序，RDS 主备迁移方案及独立存储，DCS 容量与节点小时换算，CSS 托管节点与独立存储 |
| 本轮同步范围 | `0.3.15-dev` 的 112 行真实回归、Pending 原因和对比分析。 [真实回归记录](HUAWEI_REAL_REGRESSION.md) |
| 上轮离线归档同步 | GitHub `main` 已接收候选版源码及离线包提交 `836b740de649b63dc9c915ff8d7e16fbadb42de4`。从该提交和 `main` 分别下载 ZIP，均为 HTTP 200、866,718 字节，与实测归档逐字节相同。[候选版提交](https://github.com/jh1369/cloud-solution-studio/commit/836b740de649b63dc9c915ff8d7e16fbadb42de4) |

V0.1.1 历史迁入时，9 个浏览器资源及 Worker 与部署版本字节一致；`SOURCE_PROVENANCE.json` 只记录该历史基线。该迁入证据不表示当前版本；V0.3 运行资源与独立 Sites 发布目录逐字节核对，部署源码另记如上。`public/` 为源码，`dist/` 仍是被忽略的构建产物。

## 2. 已完成的功能

| 功能 | 当前实现与边界 | 仓库证据 |
| --- | --- | --- |
| 安全及协作规则 | 禁止敏感资料进入仓库；任务结束更新状态；重大架构变更联动 README/路线图；Push 需明确授权 | `AGENTS.md`、`SECURITY.md` |
| Python CLI 基础映射 | CSV→JSON，8 条产品族映射；SKU/价格待复核，没有费用计算 | `pricing-studio/src/pricing_studio/cli.py` |
| 网页输入 | 文字、标准 CSV/XLSX、特定 AWS 账期用量表及文字版 AWS 账单 PDF。非标准表支持同源本机模型分批、校验、带来源的编辑式预览 | `pricing-studio/web/public/app.mjs`、`inventory-batches.mjs`、`inventory-import.mjs`、`scripts/local_inventory_api.mjs` |
| AWS 官方来源规格 | EC2、RDS、ElastiCache、OpenSearch 精确型号查询。版本化公开记录保存来源日期、URL 和摘要，供标准化、模型上下文和导出共同使用 | `aws-specs.mjs`、`aws-spec-data.mjs`、`scripts/build_aws_specs.py` |
| 产品及规格候选 | Huawei ECS、EVS、限实例费 RDS、Redis DCS、专享弹性 ELB、CCE、公网/私网 NAT 和动态 BGP EIP 支持限定的自动选型及价格匹配。保留人工选型及规格复核 | `huawei-match.mjs`、`huawei-dcs-specs.mjs`、`huawei-infrastructure-specs.mjs`、`huawei-eip.mjs`、`engine.mjs` |
| 计费模式分离 | AWS 原计费仅作来源记录；华为云目标仅有按需、包月、包年；支持逐项及批量切换，切换后需重新确认 | `engine.mjs`、`app.mjs` |
| 官方公开价格 | `eu-west-101` / USD；快照有 543 个按需、495 个包月、494 个包年计划。EIP 保留阶梯证据，新增 RDS 和 CSS 存储核对 1 GiB 与 100 GiB 的独立询价。保存 SKU、单位、请求/响应、来源和核验时间 | `public/catalog.json`、`scripts/build_catalog.py` |
| 价格刷新 | 固定官方端点、服务端产品白名单；按目标计费模式分组请求；验证失败不生成价格 | `worker.mjs` |
| 费用与情景 | 支持范围内的按需用量、独立月/年订阅价、手动折扣、首期预付、包年月均摊销。已确认报价、条件估算、Pending 独立展示，用户可按同配置和目标方案批量复核 | `engine.mjs`、`huawei-match.mjs`、`ui.mjs` |
| 账单用量边界 | 累计实例小时不反推台数；来源账期不自动外推全年；订阅需明确目标数量/每盘容量 | `engine.mjs` |
| Excel 导出 | Input、Service Mapping、Public Pricing、Quotation、Assumptions。保留非标准导入的来源和官方规格证据。实例与关联费用分行，Pending 金额空白 | `public/excel.mjs` |
| 构建与测试 | Python 标准库构建 Worker，浏览器依赖随包提供。在线候选的自动测试及 CLI 结果见本轮记录 | `web/scripts/`、`web/tests/`、`pricing-studio/tests/` |
| 源码可追溯 | 记录原部署源码提交和运行文件 SHA-256；不上传构建产物或部署身份 | `web/SOURCE_PROVENANCE.json` |

公开价格快照不是客户报价。没有覆盖的服务、计费模式、单位、映射或过期价格必须继续 Pending，不得按零合并成完整报价。

## 3. 当前集成状态及后续工作

- Python Updater 从官方计算器发现 PDF 并校验来源、结构、SKU、地区、币种、单位和计费证据。通过的首版及更新自动发布。异常最多检查三次。无法确定的价格保留 Pending。
- SQLite 保存原 PDF、不可变目录及检查历史。最近检查、最近成功核验、最近发布版本及时效状态分别记录。候选受阻或失败后新报价暂停，历史报价继续使用原快照。
- Python `publish` 将有效目录与当前状态写入私有对象存储。Worker 校验版本、哈希及 48 小时有效期后返回目录。模拟存储与本地 workerd 已验证，生产绑定待接入。
- 生产站已验收 TCP EU-DE 的简单 ECS、EVS 和 RDS 按需报价及 Excel，Huawei 三种模式回归已通过。[在线验收](PRICING_BROWSER_ACCEPTANCE.md) · [TCP 运维计划](PRICING_V03_TCP.md)

### 先前 V0.2 集成记录（历史）


- V0.2 本地集成：价格证据/时效/单位校验、极小单价精度、异常输入 Pending、严格资源数量、三模式独立询价及汇总分精度已回归；紫黑双语 UI 和 Excel 展示已接线。规范 GitHub 仓库未 commit/Push；随后经明确授权部署至原私有 Sites。
- ECS/EVS/RDS 新增架构、内存、OS、引擎和存储复核提示；未知磁盘类型无自动推荐，仍须人工确认，不能保证跨云等价。
- 真实浏览器导入→下载未验收：`sites-preview start` 中继 readiness 超时，未产生可打开的 URL。详见 [MVP 验收记录](PRICING_MVP_ACCEPTANCE.md)。下列 Multi-Agent 内容为此前启动时的历史记录，并非本轮并行任务。

### 前一轮 V0.2 Multi-Agent 工作记录（历史分工，待集成审查）

前一轮曾按用户授权真实启动 Lead + 3 个 Subagent。以下为历史任务与文件边界，保留已有未提交改动；当前已改为单主 Agent，不能据此继续或重启并行任务。

| Agent / 实际任务名 | 当前任务 | 独占修改边界 |
| --- | --- | --- |
| A / `pricing_engineer` | 公开价格与三模式计费审查；必要的引擎/适配修复；覆盖缺口方案 | `web/public/engine.mjs`、`web/worker.mjs`、`web/scripts/build_catalog.py` |
| B / `frontend_engineer` | 接续用户选定 A 紫黑 UI 草稿及中英文切换，改进导入/确认/金额/导出 | `web/public/` 中 index/style/app/i18n/ui/excel 六个展示文件 |
| C / `qa_engineer` | 独立虚构价格/资源回归，重点单位、金额、过期、Pending 及语言展示 | `web/tests/**`，必要时原 Python `tests/**`；不改实现 |
| Lead | 合同协调、差异审查、最终构建/整体测试、统一状态 | 根规则/文档、包元数据、构建协调及溯源记录 |

- 当前 UI/i18n 草稿在请求 Multi-Agent 前已存在，原样保留并交由 B 接续；不是已完成或已发布的 V0.2。
- A 已报告待验证问题：价格区域/币种/单位/证据/未来时间校验、极小单价精度、异常输入与 SKU 候选风险；不得在修复和 QA 之前标记解决。
- B 已确认接手 6 个前端文件；C 已开始构建独立合成价格夹具并与 A 协调契约。
- 当前只完成启动与职责分配；V0.2 整体回归结果尚未产生，历史 42+1 测试记录仅属于 V0.1.1。
- 根 AGENTS 已记录角色边界。跨边界变更须先与 Lead 协调，构建产物由 Lead 统一生成，子任务不争写共享状态文档。
- 本轮无 commit、Push、部署或发布；Lead 收集结果后再更新完成情况、测试和未解决问题。

### 原有待集成事项

- 本次将已部署 V0.1.1 通用代码迁入规范仓库；原有状态文档和维护规则随同同步。
- 原 Python/openpyxl/SQLite 原型仍未集成；不能因网页实现已迁入，就声称仓库有 Python Excel 引擎或 SQLite 存储能力。
- 登录后的浏览器端到端导入、切换模式、在线核价、下载流程尚待验证；平台部署成功和服务端打包测试不能代替该验收。
- 后续继续 Pricing Studio 方向，优先改进验证、单位模型、计价覆盖与可重复测试；其他 Studio 仍是规划。

## 4. 未完成需求与优先级

| 优先级 | 任务 | 完成标准 |
| --- | --- | --- |
| DCS 采购边界 | 指定可用区的供货确认 | 区域公开价格用于估算。指定可用区或跨可用区要求须有独立的放置证据 |
| P1 / 模型质量 | 提升陌生表头和混合描述的识别 | 独立追踪模型行分类、字段命中和确定性恢复，保留模型超时、错误和人工复核路径 |
| P1 / 报价覆盖建议 | RDS 数据盘和超额备份 | 独立核验实例、盘型与备份计费证据，按相应计量口径导出分项费用。[覆盖率分析](HUAWEI_QUOTE_COVERAGE.md) |
| P2 / 独立任务 | Python CSV starter 数值与单位问题 | 不进入当前报价 MVP；继续保留原逻辑，独立修复 NaN/Infinity 与数量/单位，不重复开发 Python 报价系统 |
| P1 | SKU/能力复核 | 补充 ARM/x86、OS/许可、引擎/版本、AZ 主备及关联资源差异；不将 CPU/内存接近视为完全等价 |
| P1 | 官方 BSS 适配与接口治理 | 明确受支持官方端点/字段、注入认证客户端；不自动发现凭证；当前使用公开计算器询价适配 |
| 后续 / 待决策 | 原 Python / SQLite 目标 | 当前优先 Web + Worker；未授权迁移或新增重复计价系统 |
| 已完成（本地） | 正向测试与真实快照过期分离 | 虚构资源/价格独立夹具；保留精确到期、未来时间、币种、单位和证据回归 |
| 已完成（本地） / 持续维护 | 单位及输入回归扩展 | 已覆盖 CSV/XLSX、数量、容量、累计用量与账期；真实浏览器导入仍待完成 |
| P2 | 扩大计价覆盖 | 对阶梯存储、流量、请求、日志、Kafka 参数等逐服务建模；缺价 Pending |
| P2 | CI/文档维护自动化 | 若获授权再增加；不自动 Push、部署或上传业务文件 |
| 后续 | PPT Studio / Web Demo Studio / Cloud Live Lab | 当前仅占位 README；未经需求确认不扩展方向 |

## 5. 关键技术决策

1. 保持 Web + Worker，V0.3 增加 TCP 目录阶段；Python CLI starter 未改。Python 3.12 仅用于构建/公开目录适配；新增 Node 本地 HTTP 适配复用同一 Worker，不另建报价引擎。
2. 原 Python 包声明 `>=3.10`、无运行依赖；原始 Python 3.12/openpyxl/SQLite 全套目标尚未统一实现。版本号分别记录，不能混淆。
3. `public/` 为受版本控制的网页源码和依赖；生成 `dist/`、`.openai/` 部署配置和临时导出不入库。构建和测试不需要站点身份、凭证或网络询价。
4. 服务族映射、SKU 复核、价格证据、计费计算和导出按职责分离。映射必须人工确认，缺失或不可信价格不生成有效金额。
5. AWS 源计费与华为云目标模式独立。包月/包年使用独立官方订阅价，不以按需小时价乘算；包年月均仅为摊销，不是月付选项。
6. 快照有效期 7 天；刷新固定到官方欧洲站端点，币种/产品身份验证失败则 Pending。价格依据包含模式、周期、区域、单位、时间。
7. 用户文件在浏览器内存解析。核价刷新仅传递批准的 Huawei 产品 ID。本机模型适配器由同源回环服务提供，真实清单及报价保留在获准隔离环境。OpenAI API 适配器仅提供服务端虚构数据测试入口。
8. ChatGPT 负责规划、设计、公开云能力分析及评审；Codex 负责实现、测试与状态更新。共同依据本文件同一分支/提交版本，不假定会话自动同步。
9. 历史 GitHub 授权不自动延续；本轮用户明确授权 V0.3 GitHub 同步，并授权后续检查通过的版本自动部署原私有 Sites，访问范围不变。默认单主 Agent。金额逐行 HALF_UP 到分，小计按行分值汇总；年度/摊销舍入口径明确写入 Excel Assumptions。

## 6. 已知问题与风险

- **Python starter 已知问题未改动：** `float()` 配合 `< 0` 不能拒绝 NaN/Infinity；原样例存储数量与 `usage_hours` 语义不充分，不能直接用于财务计价。
- 网页只支持有限的规则式描述、规格族和账单 PDF 布局；扫描 PDF、任意格式和自由自然语言不保证识别。未知字段需补充。
- 模型建议需对照来源，陌生表头和复杂描述可能留待用户补充。OpenSearch 有来源型号记录，CSS 暂无可验证目标价格；RDS 和缓存需补齐引擎、版本、拓扑和独立存储计费证据。
- 441/400/400 是验证过的计价计划记录数，不代表服务功能覆盖全部 AWS，也不代表每个服务都有三种模式。未覆盖项目保持 Pending。
- 公开计算器接口可能变化、限流或不可用；官方单价有效不等于映射、可售性或客户折扣得到承诺。
- 正向财务测试已改用虚构有效夹具；生产公开快照仍严格到期 Pending。本次只实测核心 3 服务 × 3 模式，不能外推整个目录的实时可售性。
- 本机 Chromium 已复验模型导入、批量确认及下载。私有生产用站点授权核对发布内容和公开 EIP 计划。本轮离线验证范围为既有下载附件的字节比对。 [历史浏览器中继记录](PRICING_BROWSER_ACCEPTANCE.md)
- 当前代理环境下 Node 24 在线核价需启用已有环境代理支持（`NODE_USE_ENV_PROXY=1`）；初测 502，启用后 9/9 成功。未修改生产 Worker 的网络/安全逻辑。
- RDS 架构常标 Review Required；版本、主备、存储/备份需人工复核与单列。EBS gp2/gp3→GPSSD 不保证性能等价；IOPS/快照不可用容量价替代。
- 第三方浏览器依赖为已部署版本的既有分发文件，保留许可头及 SHA-256；其升级和安全更新需单独评审。见 `web/THIRD_PARTY_NOTICES.md`。
- 当前没有 CI、自动同步或 DLP 服务。`.gitignore` 不能阻止已跟踪或强制添加的敏感文件；每次发布需审查实际文件和 diff。
- 原私有 Sites 的身份和访问配置未放入 GitHub；下载源码不会自动取得该站点的管理或访问权限。

## 7. 最近一次测试与同步检查

### Web V0.3.15-dev

- 在 `pricing-studio/web/` 使用 Node 24.22.1 和 Python 3.12.14 构建 Worker，沿用既有下载附件。执行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，151 项通过、0 项失败。执行 `PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication`，41 项通过、0 项失败，2 项因缺 boto3 跳过。原 CLI 在 `pricing-studio/` 通过 1 项。
- Chromium 156.0.8078.79 用 24 行虚构 Excel 实际导出两阶段统计。单组复核前后，主费用确认数为 1 和 2，条件估算为 15 和 14，Pending 均为 8。两份 JSON 通过配对校验。导入、复核和导出流程产生 0 个网络 POST。单测覆盖额外字段、未知原因和不一致计数的拒收。
- 原私有站第 17 版部署成功。复核为所有者访问，5 个线上资源与部署源码逐字节一致。对照既有 TCP 目录及下载归档通过。 [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)
- 2026-11-20 在获准隔离环境中用真实参考清单完成两阶段回归。首次导入和方案复核后均为 112 行识别、85 行有候选、11 行确认、74 行条件估算、27 行主费用 Pending，另有 63 项关联费用 Pending。两份五表下载的来源、价格证据、金额与页面一致。 [真实回归记录](HUAWEI_REAL_REGRESSION.md)

### Web V0.3.14-dev

- 在 `pricing-studio/web/` 使用 Node 24.22.1 / Python 3.12.14 构建 Worker 成功。运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，148 项通过、0 项失败。旧下载附件按实际响应字节核对。
- 在 `pricing-studio/web/` 执行 `PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication`，41 项通过、0 项失败、2 项因缺 boto3 跳过。原 CLI 在 `pricing-studio/` 用 `PYTHONPATH=src python3.12 -m unittest discover -s tests` 通过 1 项。
- 本地打包 Worker 使用公开产品号核验 17 个实际计划，覆盖 ECS、RDS 实例和存储、DCS 主备、CSS 实例和存储；币种、单位、模式和收费均与随包证据一致。CSS SAS 包月的两种存储容量样本未通过线性核验，相应计划保持 Pending。
- Chromium 156.0.8078.79 实际导入 24 行虚构 Excel，三类报价分开显示。ECS、RDS、DCS、CSS 分组复核后，8 项主费用和 4 项独立存储费确认。修改折扣使相关确认失效。openpyxl 3.1.5 重开复核前后两份五表工作簿，核对来源小时、节点小时换算、金额和缺项空白。 [覆盖率及官方证据](HUAWEI_QUOTE_COVERAGE.md#0314-dev-四类迁移报价复测)
- 原私有站第 16 版发布成功。13 个线上资源与源码逐字节一致，生产独立复核 17 个公开计划。所有者范围、既有 TCP 快照核验时间与摘要、旧下载附件均相符。托管模型路径返回 HTTP 404。 [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

### Web V0.3.13-dev

- 在 `pricing-studio/web/` 构建 Worker 成功。Node 24.22.1 下执行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，执行 141 项，通过 141 项，失败 0 项。覆盖标准表直通、长表完整性、模型结构与数值、超时和重试、来源规格、条件金额、批量确认和三种计费模式。离线附件独立用既有 ZIP 字节核对。
- 在 `pricing-studio/web/` 以 Python 3.12.14 执行 `PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication`，通过 41 项，失败 0 项，缺少 boto3 的 2 项跳过。在 `pricing-studio/` 以 `PYTHONPATH=src python3.12 -m unittest discover -s tests` 验证原 CLI，1 项通过。
- Chromium 156.0.8078.79 用两工作表、69 条虚构资源验证分批、错误响应后重试、跨批沿用模型表头、人工修正及标准 CSV 直通。openpyxl 3.1.5 重开下载的五表，核验物理行号、累计用量、字段出处、条件金额及 Pending 空白。
- 实际本机模型为 llama.cpp b12521、Qwen2.5-1.5B-Instruct Q4_K_M。两工作表虚构测试中完成结构化回包、人工补齐用量及导出，得到 1 项确认、2 项条件估算和 1 项 Pending。陌生表头下模型只识别部分资源，列映射仍需人工。获准隔离回归验证所有来源行和用量可追溯、同规格批量重匹配、页面与五表小计一致。客户数据、报价和回包留在隔离环境。
- OpenAI API 适配器通过虚构请求的替代传输测试。本机模型端点只在同源回环工作台启用。
- 生产站第 15 版核对 16 个线上资产、5 个公开 EIP 计划、原 TCP 快照的核验时间和摘要、既有下载附件及托管模型端点的 HTTP 404。访问范围仍为原所有者。 [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

### V0.3.1 最新候选

`pricing-studio/web/` 执行 `npm run release:offline`，83 JS + 34 Python 全通过，0 失败。实际 Chromium 本地在线流程、三模式核价成功与故障、12 个工作簿的独立校验、两个版本 ZIP 下载均有证据。私有生产登录和本机文件打开仍待复验。[本轮验收记录](PRICING_BROWSER_ACCEPTANCE.md)

### V0.3 目录阶段（上轮）

规范仓库 `pricing-studio/web/` 执行 `npm run release:offline`：**82 JS + 34 Python 全通过、0 失败**，Node 24.22.1 / Python 3.12.14 / pdfplumber 0.11.9。新增真实微型虚构 PDF、目录更新/审批/回滚/并发、Adapter、HTTP 检测/本地 bridge 和本地调度配置检查；旧 Huawei 回归继续通过，engine.mjs 和正式 catalog.json 未改。完整 TCP 公共 PDF 的最终解析结果逐字段匹配已归档候选。0.3.0-dev HTML/ZIP 已生成，0.2.0-dev 旧归档不变。

浏览器：本轮已启动桌面能力后重试 managed preview，仍 relay readiness 超时，未产生可打开 URL，status stopped。未进行浏览器 UI 流程，不以 116 个自动检查代替。原生部署 succeeded，GitHub SHA/文件树及公开 ZIP 下载已核验；2026-11-18 生产入口为 ChatGPT 登录页，未验证登录后的 UI。


日期：2026-11-17。测试均在迁入后的规范仓库中执行：Python 3.12.14，Node.js 24.22.1。

### 离线包本轮（最新）

规范仓库 `pricing-studio/web/`：npm test 为 72 JS + 8 Python 全部通过，0 失败（Python 含 4 目录适配 + 4 离线封装）；build:offline 生成 4,776,812-byte HTML 和约 0.86 MB ZIP。脚本语法、无外部运行资源、原价/时间保留、ZIP 白名单及哈希检查通过。

真实 file:// 验收受云浏览器 URL 策略拒绝和原生 AT-SPI 不可用限制，未完成真实双击/文件选择/下载，未尝试绕过。离线版不能在线核价，七天时效仍按原时间执行，过期 Pending；本轮不部署或 Push。

### V0.2 核心验收（此前）

工作目录 `pricing-studio/web/`；`npm test`：72 项 JavaScript + 4 项 Python 目录适配通过，0 失败；构建成功。新增 8 项 MVP 模块验收及独立 Worker 响应回归。另 openpyxl 独立读取三本实际导出文件，五 Sheet/金额/预付/Pending 检查 3/3 通过。

真实官方 API：Node 24 启用已有代理后，通过打包 Worker 刷新 ECS/EVS/RDS 各三模式，共 9 个 VERIFIED、0 Pending、HTTP 200；Python 直接官方请求独立核对 9 个均与快照一致。未更新正式目录。

真实浏览器：预览中继 readiness 超时，**阻塞，未验收**；未用单测冒充。可复现步骤、舍入政策、测试数据/金额与限制见 [验收记录](PRICING_MVP_ACCEPTANCE.md)。未重跑原 Python CLI；无提交/Push/部署。

### 网页 V0.1.1（历史，非本轮结果）

工作目录：`pricing-studio/web/`。

```bash
npm test
```

构建成功；42 项通过、0 项失败。覆盖三种目标模式、AWS 源方式分离、独立月/年价格、订阅数量/容量、模式切换复核、Pending、过期、账期、Excel、Worker 白名单/错误和打包资源。Worker API 测试 mock 上游，未在本次测试重新请求官方实时价格。

### 原 Python CLI（历史，非本轮结果）

工作目录：`pricing-studio/`。

```bash
PYTHONPATH=src python3.12 -m unittest discover -s tests -v
```

1 项通过、0 项失败；原 Python 源码、测试及包配置保持不变。

### V0.1.1 入库与发布检查（历史）

- 9 个运行资源和 Worker 源文件 SHA-256 与原 Sites V0.1.1 一致；路径迁移、构建输出忽略策略及说明文档分别审查。
- 构建使用 `public/` 生成忽略的 `dist/server/index.js`，无 `.openai/hosting.json` 也能完成测试；未上传 Worker 产物或私有部署身份。
- 按明确文件清单检查源码、公开目录证据、合成测试和文档；不包含客户资料、内部 PPT、真实账单/报价、数据库或凭证。规则扫描不等同于完整历史安全审计。
- GitHub 同步由本次明确授权触发；已通过 GitHub API 核实 `main` 的源码同步提交 `73baa615e800598255f1ba0ecf5f89ca4a49ef42`，文件树 `e5131af7d2dedbc607793e74a0ce0f74e19cc2cf` 与本地一致，工作树干净。生成的 Worker 和本地验证输出仍被忽略。未执行站点重部署、工作流触发或自动发布配置变更。

## 8. 下一步开发计划

真实回归显示 RDS 账单尺寸缩写影响 10/27 项主费用 Pending。隔离试算证实这 10 项已有可用 AWS 来源规格及 Huawei 条件估算。优化优先级还包括 ECS 兼容目录及 DCS、RDS、CSS 的方案确认和独立费用证据。 [真实回归分析](HUAWEI_REAL_REGRESSION.md#优化讨论优先级)

Huawei 欧洲站覆盖率优先补齐 RDS 数据盘和备份，随后为 ELB/EIP 分项和 OBS。每项建设以可验证的官方价格和独立计费单位为依据。[覆盖率分析](HUAWEI_QUOTE_COVERAGE.md)

1. 在有持久磁盘的托管 Linux 启用 Python 定时任务，核对官方当前 PDF，自动发布不可变目录与状态。将 Worker 接入对象存储读取和时效校验。
2. 为合并、跨页、阶梯和 ELB 等复杂条款增加确定性校验。证据不足的条目继续 Pending。
3. 从单一区域的少量简单 SKU 接入 TCP 自动报价，逐项核对映射、计费单位、配套成本及 Excel 证据，并固定报价所用目录版本。

## 9. 任务变更记录

### 2026-11-17 — 建立项目状态与跨环境维护机制

- **新增：** 本文，作为 Codex/ChatGPT 的共享状态依据；基于实际仓库、13 个提交和本地验证填写。
- **修改：** 根目录 `AGENTS.md` 增加任务开始/完成规则、安全复核、架构文档联动、角色分工和明确 Push 授权要求；`README.md`、`docs/ROADMAP.md` 添加状态文件入口。
- **删除：** 无。
- **业务逻辑：** 无变更；此前独立工作区的计费模式开发保持原状。
- **验证：** 本仓库现有 1 项测试通过、8 行虚构输入冒烟检查通过；数值边界问题已复现并登记；Markdown 结构/链接/变更范围已核查。
- **未解决：** NaN/Infinity、单位模型、完整报价链路、独立工作区迁入与登录后网页验收等，见第 4、6 节。
- **下一步：** 先审阅同步文档，继续计费修正与安全迁入规划。
- **同步状态：** 本地未提交、未 Push；未向 GitHub 或其他远程仓库写入本轮变更。

后续任务在本节追加同样字段，并同步更新前面的当前状态；Git 历史保留经授权同步的旧版本。

### 2026-11-17 — 发布网页计费修正版 V0.1.1

- **新增：** 独立网页可见 V0.1.1 标识、页面资源版本标识，以及部署包三种目标模式的回归检查。
- **修改：** 将此前已完成但未发布的 AWS/华为云计费分离、包月/包年独立官方价格、预付/摊销展示及 Excel 字段发布到原 Sites 私有网页。
- **删除：** 华为云目标选择器中的 AWS reserved/spot 选项；源记录保留。
- **测试：** 独立网页 42 项通过，构建和部署包检查通过；规范仓库业务代码无变更，未重跑其历史 1 项测试。
- **未解决：** 登录后网页端到端测试、未覆盖的计价服务和向规范仓库安全迁入。
- **下一步：** 确认用户页面显示 V0.1.1，验证登录后流程，再评审通用代码迁入方案。
- **同步状态：** Sites 部署成功；规范 GitHub 仓库仍为本地文档修改，未 commit/Push。

### 2026-11-17 — 经用户授权将 V0.1.1 同步到 GitHub

- **新增：** `pricing-studio/web/`，包含已部署 V0.1.1 的通用前后端源码、官方公开价格快照、第三方浏览器依赖、构建/查询脚本、42 项测试及运行资源校验清单。
- **修改：** 根目录 README、路线图和本状态文件改为基于已集成网页的实际进度；一并同步此前已编写的根 AGENTS 协作维护规则。
- **删除：** 无已有业务代码删除；生成 Worker、部署身份、账单、报价、数据库和凭证未纳入迁入范围。
- **业务逻辑：** 网页运行资源/Worker 源码与 Sites V0.1.1 字节一致，仅适配源码/构建/测试路径；原 Python CLI 未改动。
- **验证：** 规范仓库中 42 项网页测试通过、1 项原 Python 测试通过，构建成功；源码校验、变更范围、文档和安全检查完成。
- **未解决：** 登录后端到端验证、Python starter 数值/单位缺陷、快照到期的测试夹具策略和原 Python 技术目标整合。
- **下一步：** 使用规范仓库共同维护，从登录后流程验证和已登记缺陷继续迭代。
- **同步结果：** 经用户本次明确授权，代码已 Push 到 GitHub `main`，提交 `73baa615e800598255f1ba0ecf5f89ca4a49ef42`；远端 SHA 和文件树已核对一致。本次文档补充确认结果，不授权后续自动 Push。


### 2026-11-17 — 启动 Pricing Studio V0.2 Multi-Agent 工作流

- **新增：** 真实 Agent A/B/C 并行任务、独占文件修改边界、接口协调和 Lead 集成门禁。
- **修改：** 根 AGENTS 将优先级更新为 Pricing Studio V0.2；ROADMAP 和本状态记录工作流与未发布状态。既有紫黑 UI / i18n 草稿交由 Agent B 保留接续。
- **删除：** 无。
- **测试：** 本启动阶段仅核查代码基线与规则；V0.2 回归待三 Agent 结果收集和 Lead 构建后执行，不复用 V0.1.1 的 42+1 通过记录冒充完成。
- **未解决：** A 提出的价格有效性与精度风险待修复/独立验证；前端 app 接线与中英文流程仍在开发。
- **下一步：** 收集三 Agent 报告，统一接口、审查修改并运行全量回归，随后更新本文。
- **同步状态：** 全部本地进行，未 commit/Push/部署/发布；任何新发布需用户明确授权。


### 2026-11-17 — 启用 Token-Efficient Development Mode

- **修改：** AGENTS 改为默认单主 Agent；必要并行先说明收益并取得新同意；按状态及相关代码读取上下文、单一任务最小修改、先针对性测试后集成回归、精简输出及状态增量记录。ROADMAP/当前状态同步取消默认 Multi-Agent。
- **新增/删除：** 新增效率规则；移除过时的默认并行执行要求。安全与发布门禁保持原样。
- **检查：** 协作工具查询无运行中 Subagent；文档结构/规则/差异检查通过；本次前后业务文件指纹一致。仅文档变更，未运行业务测试。
- **未解决/下一步：** 上轮价格、前端和 QA 的本地改动仍需单主 Agent 逐项集成审查，再执行相应测试；不将旧测试记录当作 V0.2 验收。
- **同步：** 未 commit、Push、部署或发布；模型选择仅在运行环境真实支持时使用，不声称已切换模型。


### 2026-11-17 — V0.2 报价 MVP 可靠性与验收（单主 Agent）

- **新增：** ECS/EVS/RDS 双语规格复核点及 Excel Mapping Review；共享分精度小计；同一 Worker 的本地预览适配；虚构 CSV、8 项 MVP 模块验收、2 项 Worker 回归、4 项目录适配测试及简洁验收记录。
- **修改：** 集成此前本地价格证据/精度/Pending 修复和双语 UI；按需资源数量收紧为正整数，未知 EBS 类型不自动推荐 GPSSD；失效价格不显示有效标识/单价；汇总超限清空金额；包版本 0.2.0-dev；README/ROADMAP 同步。正式公开目录与原 Python CLI 未改。
- **删除：** 无功能删除；移除旧 V0.1.1 UI 标记断言，保留行为检查。
- **测试：** 初始完整基线 61 通过 / 1 旧 UI 断言失败；最终 npm test 为 72 JS + 4 Python 适配测试通过 / 0 失败。openpyxl 三种模式实际导出核验 3/3；官方接口经 Worker 9/9 VERIFIED，Python 直接核对一致。运行环境 Node 24.22.1 / Python 3.12.14。原 Python CLI 未重跑。
- **未解决：** 真实浏览器 E2E 被预览中继超时阻塞；其余模块/API 成功不能替代。RDS 版本/主备/存储、EVS 性能等价仍需人工；未覆盖服务缺价继续 Pending。Node 本地代理适配及复现细节见 PRICING_MVP_ACCEPTANCE。
- **下一步：** 先完成真正浏览器验收，再按失败项迭代核心服务；保持 Web + Worker 和当前 MVP 方向。
- **同步与安全：** 仅本地未提交；未 commit/Push/部署/发布。只使用通用源码、公开产品信息及虚构测试数据；生成 XLSX/检查摘要仅在被忽略 outputs/ 内，未读取客户文件/凭证。 `git diff --check` 通过；26 个变更/新增源码、文档、夹具文件已纳入检查，常见凭证模式无命中，暂存区为空；这不等同于完整 DLP 审计。


### 2026-11-17 — 按明确授权重新部署 V0.2 候选版

- **授权/结果：** 用户“重新部署网页我看看效果”。原 Sites 项目和 owner-only 私有访问不变；原地址 https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site 部署成功。包仍为 0.2.0-dev / UI V0.2.0，未把候选版标为已完成 MVP 验收。
- **新增/修改/删除：** 无新增、删除或修改业务功能。将上一轮已审查的 public/、Worker、构建/测试源码同步至独立 Sites 发布目录，替换其历史 dist/ 源码布局；规范仓库仅更新发布状态/README/ROADMAP。Sites 源码提交 `64eaa80dea73b608d4c409c373394151d5f22641`。
- **测试：** 本轮在 `/workspace/sites/pricing-studio` 运行 npm test：72 JS + 4 Python 目录适配测试通过，0 失败；源码与规范仓库运行资源逐字节一致，构建、包清单与 diff 检查通过。规范仓库业务源码未改，未重复其上一轮测试。
- **发布证据：** 原生 Sites 已确认授权部署；具体内部部署/版本标识保留在 Sites 运行环境，不纳入公开仓库；原生 Sites 返回 succeeded 和生产 URL。发布包只含 hosting manifest 和同一源码构建的 Worker。
- **浏览器/未解决：** 实际打开生产地址，到达 Sign in required / Continue with ChatGPT；未登录、未绕过访问控制，因此未验证登录后的新版 UI 或完整导入→导出流程。原本地预览中继问题仍未修复。用户可使用获授权 ChatGPT 账号打开站点试用。
- **安全/同步：** 未读取客户材料/云凭证；只发布通用源码和官方公开目录；生成测试报价和日志不在包中。Sites 短期传输凭证仅经隐藏 stdin/内存使用；未写文件。Sites 源码传输为此次部署所需，不是 GitHub Push；规范 GitHub 未 commit/Push。
- **下一步：** 登录后验收 UI、中英文切换及报价/Excel 流程；按实际问题最小修复。继续保留 Pending 和人工规格确认边界。


### 2026-11-17 — 可下载的独立离线网页

- **新增：** `scripts/build_offline.py` / `npm run build:offline`，生成单文件 `outputs/offline/Pricing-Studio-V0.2-Offline.html`（4,776,812 bytes）及 ZIP（约 0.86 MB）；ZIP 含虚构 CSV、双语说明、第三方声明和哈希清单。无需用户安装软件/启动服务器/登录。4 项独立封装检查。
- **修改：** app 增加嵌入数据/Blob PDF worker 的离线初始化路径、双语离线状态/时间说明、禁用在线核价；Excel Assumptions 记录离线交付。沿用同一 JS 价格引擎与现有 UI，未改计价公式。README/ROADMAP 同步。
- **删除：** 无功能删除；生成文件不依赖外链脚本/样式/模块加载，不添加重复 Python 报价系统。
- **测试：** 规范仓库 `pricing-studio/web/` 运行 npm test，72 JS + 8 Python 全部通过 / 0 失败，Node 24.22.1 / Python 3.12.14；build:offline 成功。新增检查包含全部内嵌经典脚本语法、无外部运行资源、快照逐项不变、ZIP 白名单与 SHA-256。正式目录未刷新、时间未延长、未访问客户资料/云凭证。
- **真实浏览器限制：** 尝试以桌面打开生成文件，原生输入返回 AT-SPI provider unavailable；Cloud Browser 明确拒绝 file:// 协议，已停止尝试，未绕过安全策略。未完成实际双击、CSV/XLSX 文件选择、Excel 下载或离线 PDF worker 的浏览器验收；自动检查不替代这些步骤。
- **价格/使用边界：** 内置官方快照仍按原 verifiedAt 起 7 天有效；过期、缺价、未确认保持 Pending。离线 HTML 不能实时核价，过期需新版离线包或网页版核价；CSP connect-src none 禁止自动联网。只保存语言偏好，刷新后资源清单清空。
- **下一步：** 用户下载并以现代 Chrome/Edge/Firefox 打开，先用虚构样例验证导入→确认→三模式→Excel；收集实际故障后最小修复。继续当前 Pricing MVP。
- **同步/安全：** HTML/ZIP 和构建输出为本地忽略产物；源码改动未 commit/Push，未部署、未上传任何远程仓库；原私有 V0.2 候选站点保持上轮部署。产物清单/哈希和常见凭证模式检查通过，暂存区为空；常规变更/产物审查不等于完整 DLP 审计。


### 2026-11-17 — 修复离线包下载交付（待发布授权）

- **发现/纠正：** 用户点击此前 `/workspace/...` 链接无法下载。那些是云端开发路径，不是持久文件附件；此前不能声称已完成可下载交付。浏览器共享文件说明也明确共享路径不自动成为用户附件；当前工具无通用附件发送接口。
- **新增：** 原 Web 页面双语“下载离线版 ZIP”按钮；Worker 构建附带同源 `/downloads/Pricing-Studio-V0.2-Offline.zip`，响应 application/zip + attachment 文件名 + no-store，可供浏览器正常下载；新增完整字节比对/ZIP magic/HEAD/404 回归。
- **修改：** 构建从同一源码封装离线包再嵌入 Worker；离线 HTML 移除仅服务端可用的下载自身链接。报价引擎、官方目录与原始验证时间未改。删除功能：无。
- **测试：** 规范仓库 pricing-studio/web 执行 npm test：73 JS + 8 Python 通过，0 失败；ZIP 五文件白名单/校验和、GET 精确字节、Content-Type/Disposition/Length、HEAD 无正文、未知文件 404 和 diff 检查通过。未测试线上下载，路由目前未发布，不能提供未上线 HTTPS 链接冒充可用。
- **安全/状态：** 包含通用页面、原官方公开价格、第三方声明和虚构 CSV，不含账号/hosting 配置、用户资料或凭证；不改变原私有站点的访问策略。未 commit、Push、部署，规范 GitHub 不变。
- **待确认/下一步：** AGENTS 第 80 行要求每次发布明确授权；当前先完成可审查下载修复，等待用户允许部署原私有站点下载入口。获准后同步独立 Sites 发布目录（需包含新增 build_offline.py、test_offline.py、THIRD_PARTY_NOTICES.md 等），构建验证并部署；不 Push GitHub。真实本地 file:// 验收限制仍保留。


### 2026-11-17 — 每版本离线交付规则与当前版本 GitHub 同步（完成）

- **授权：** 用户明确要求后续每个完成版本提供可分享的离线网页，并“当前的版本先同步到github”。本次允许 GitHub commit/Push；不包含网站再部署，不开启后续自动同步。
- **新增：** AGENTS 长期离线交付规则；release_offline.py / npm run release:offline；版本化 HTML/ZIP、双语说明、虚构样例、源文件/产物 SHA-256、版本索引及 3 项归档回归。归档 releases/pricing-studio/v0.2.0-dev/ 为当前候选版，可供同事下载后直接分享。
- **修改：** 从 package.json 派生文件名、离线可见版本及 manifest；ZIP 可重复生成相同字节；旧归档不同内容时拒绝覆盖，需升级版本。服务端预备下载路由改为稳定路径、附件名自动带版本。集成此前已测试但未提交的 V0.2 UI/计价/下载改动；本轮未改价格公式或正式目录时间。
- **删除：** 无业务功能删除；归档产物不包含 hosting/账号配置、云凭证、客户资料、实际报价导出或原上传文档。仅通用代码、公开价格、虚构 CSV 和依赖声明可公开。
- **测试：** 规范仓库 pricing-studio/web 执行 npm run release:offline：73 JS + 11 Python 全部通过、0 失败；测试覆盖确定性重建、版本/源哈希一致及旧归档不可覆盖。原 Python starter 未改/未重跑。真实浏览器 file:// 验收限制继续保留；不以自动测试冒充。
- **交付边界：** 内置官方单价仍保留原验证时间/七天时效，过期/缺价/未确认保持 Pending。文件无需账号，离线不能在线刷新。公开 GitHub 文件才是可验证的下载路径；云端工作区链接不是附件。
- **同步结果：** 39 个白名单文件经审查后提交并 Push 到 jh1369/cloud-solution-studio main，源码/交付提交 `f3aae16453c43a0221e02220d6b0efaa01da0d3f`；GitHub API 核对 SHA 及文件树成功。真实公开 ZIP 下载 HTTP 200、862412 bytes、SHA-256 `e590a70f1aaa677976bac054030fdcbefed1c1d584c266070c058552b57445b6`，与归档完全一致。
- **下一步/限制：** 同事可从 releases/pricing-studio/v0.2.0-dev 下载 ZIP 后共享文件。继续真实浏览器导入/导出验收；网站未重新部署，预备下载按钮仍未上线。本次授权仅用于此次 GitHub 同步，后续不自动 Push 或部署。


### 2026-11-17 — GitHub 同步确认记录

- **新增/删除：** 无业务功能增删。**修改：** 本状态及 README/路线图补记本次已经成功的远端同步和 ZIP 下载验证，避免继续显示“执行中”。
- **验证：** GitHub main SHA、远端源码树及归档 ZIP blob 与本地一致；公开 ZIP HTTP 200、application/zip、字节/SHA-256 匹配。上一代码提交的 73 JS + 11 Python 测试全部通过，本次仅文档确认未重复业务回归；diff 检查通过。
- **安全/状态：** 常见凭证模式无命中、ZIP 白名单和源/产物哈希核对完成；不等同完整历史 DLP 审计。本确认随文档提交同步，未部署站点；用户要求的版本离线交付规则已入 AGENTS。
- **未解决/下一步：** file:// 的真实浏览器验收限制仍保留；不要把已验证下载或自动化测试写成完整 MVP 验收。以后每版本先生成可分享文件，其他发布继续等待对应授权。


### 2026-11-17 — V0.3 TCP 官方 PDF 目录与 Catalog Auto Update（发布准备）

- **新增：** Provider Adapter（Huawei 兼容包装/TCP 校验/报价快照固定）；离线 PDF 结构化提取；泛型 Catalog Updater、官方页面发现、SHA/修订/获取/价格版本追溯；新增/删除/价格/计费规则差异，首版/异常/复杂/失败/回退/并发门禁；本地 SQLite 历史及版本审批；小型中英文状态卡；Hosted 检测 API 和本地持久 Updater bridge；每日 cron/systemd/Windows 配置生成器（未安装）。
- **修改：** 包版本 0.3.0-dev；离线版本包含 TCP 状态与明确的“TCP 报价未接线”说明。补充 TCP V0.3 计划/操作者文档/公开候选目录。AGENTS 按用户最新要求记下检查后自动部署原私有站点的站立授权；本轮另获 GitHub 同步授权。Huawei engine.mjs、原正式 catalog.json、原 Python starter 未改。
- **删除：** 无业务功能删除；Alibaba/Tencent 未实现，无重复 Python 报价系统。
- **公开数据验证：** 官方 calculator 页实际发现当前 PDF，与给定 URL 下载的 1,609,264 bytes / 115 页文件同 SHA。最终 parser 对本地留存 PDF 重跑，结果与不可变候选目录逐字段一致（catalog SHA-256 da73a233d7dba93e28355c487422cd9280ee5159d953d333dd25c9aac9c736ff）。覆盖与 Pending 数量见第 3 节。真实初始目录仍 Pending；没有人为假批准。
- **定向/回归：** 先通过 PDF 和更新核心测试，再集成调度。第一次完整回归 82 JS + 30 Python 通过；补充异常列/连续未批准版本比较/旧版误批准防护后，最终 release:offline 为 82 JS + 34 Python 全通过 / 0 失败；离线版本已归档。一次在仓库根目录误调用 npm 因无 package.json 失败，已在 web/ 正确执行；未把该次误调用记为测试通过。Cron 定向测试曾错误把说明注释当命令检查，已修正；原始重复 SKU 会导致早期提取失败，已改为保留重复证据并 Pending，而非静默去重。
- **已知限制：** TCP 完整报价/映射/阶梯金额未启用；36 月价格保留但需审核。EIP 不含完整流量设计，RDS/ELB/物理/GPU/许可/备份规则需人工；本地日任务需在用户机器安装，Hosted 检查无持久云状态，只检测文件。HTTP 预览 relay 超时、file:// 策略限制仍不当作通过。
- **同步/下一步：** 完成离线版本、复核可公开文件后按本轮授权 Push 并自动部署原私有 Site；实际提交/下载/部署结果随后补记。仅公开产品数据与虚构样本；没有读取客户文件、内部 PPT 或云凭证，运行 DB/PDF/日志不入库。


### 2026-11-17 — V0.3 检查完成与发布准备

- **检查：** 116 个自动检查通过；最终真实 PDF 重解析与候选归档一致。新增本地调度配置已生成（cron/systemd/Windows），没有替用户安装任何任务。候选数据仍未人工批准；结构校验 3,397 条不等于可生成 TCP 报价。
- **交付：** releases/pricing-studio/v0.3.0-dev/ HTML/ZIP/manifest/说明已生成；版本名和指纹一致，旧版归档保持不变。
- **发布权限：** 用户已明确授权当前任务 GitHub 同步，以及检查后每版本自动部署原私有站点；不再重复询问同一部署。保持现有访问范围，无客户或内部材料。
- **状态：** 当前安全复核/同步发布中，尚不写“部署成功”；后续记录实际源码提交、HTTP 下载校验与原生部署结果。

- **发布前核验：** 44 个显式白名单文件/公开候选 gzip/离线 ZIP 已审查，常见凭证模式无命中；产物及源指纹全部匹配，ZIP 只含五个允许文件，原 Huawei engine/catalog 与旧 V0.2 归档无变更。独立 Sites 发布目录运行 npm test：82 JS + 34 Python 通过、0 失败。未包含原始 PDF、SQLite 数据库、输出日志、客户清单或部署凭证。


### 2026-11-18 — V0.3 发布与同步结果确认

- **新增/删除：** 无业务功能增删。**修改：** 状态、README/路线图补记已成功的发布；本次仅文档变更，不继续扩展报价功能。
- **GitHub：** 11-17 已将 44 个白名单文件提交并 Push：`8777743e497a8014dfb9e61574690238981fa1bd`；11-18 再核对 main，GitHub 文件树 `fa15ffd153f26d6467c8eeb7da16ae5e3ac06f62` 与本地相同且未截断。
- **离线交付：** [V0.3 ZIP](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/releases/pricing-studio/v0.3.0-dev/Pricing-Studio-0.3.0-dev-Offline.zip) 已真实 GET 验证 HTTP 200、application/zip、866,490 bytes；SHA-256 `f1c0f96b4fea48fb211ea3d3f3045cf83f8f49c134dcf54d1f29a815f089bd4e` 与本地一致。旧 V0.2 归档未改。
- **网站：** [原私有站点](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/) 已从 Sites 源码 `fff0d1fe414b09464089a4f6734b6a03f56738ff` 构建，原生发布 succeeded；11-18 状态复查仍 succeeded。访问范围不变，无新增分享或公开访问。发布包只含既有 hosting manifest 与同一源码构建的 Worker；凭证未写入源码/文档/包。
- **测试/安全：** 规范仓库 release:offline 与独立发布目录 npm test 均为 82 JS + 34 Python 全通过、0 失败（执行日期 11-17）；本次文档确认仅做 diff/变更范围核查，不重复业务测试。实际浏览器 11-18 打开生产地址停在 ChatGPT 登录页，不算导入/切换/刷新/下载端到端通过；未绕过认证。
- **未解决/下一步：** TCP 初始目录仍未人工批准，完整 TCP 自动报价/映射/Excel 属下一阶段；复杂规则继续 Pending。调度配置生成并经过测试，但须在用户实际机器安装，托管检查只发现文件变化且无持久目录提升。继续真实浏览器验收与价格审核后再接入 TCP 计价；不把目录交付写成全功能完成。


### 2026-11-18 — Pricing Studio 调研与 Codex 交接

- **新增：** [同类工具调研与开发参考](PRICING_STUDIO_RESEARCH.md)，包含功能优先级、验收矩阵、Skill 建议及 Codex 单项任务。**修改：** 本文增加开发参考入口和交接记录。**删除：** 无。
- **验证：** 基于 `main` / `eed9a72` 和公开资料核对。检查 Markdown、文件链接和提交范围。本次为 `0.3.0-dev` 文档交接，未运行应用测试或重新验收浏览器。
- **下一步：** 完成在线与离线浏览器验收，再处理两项 TCP 目录更新问题。**同步：** 本条随调研文档提交至 `main`。

### 2026-11-18 — 在线与离线浏览器验收及三项修复

- **新增** 真实浏览器验收记录、截图、12 份 Excel 的核验摘要、虚构 XLSX/PDF、本机复验步骤、PDF 来源页码回归和 `0.3.1-dev` ZIP/HTML 归档。
- **修改** 修复连接中断的双语核价失败提示、短视口报价卡无法直接滚到导出、两页 PDF 的完整行来源页码。AGENTS 记录完成且充分验证后可直接合入 GitHub 的授权。**删除** 无功能删除。
- **验证** Chromium 156 在本地 4173 实际选择 CSV/XLSX/PDF、切换并确认三模式、按模式核价成功、模拟上游失败和实际连接断开、导出与重载。独立重开 12 个下载文件逐项核对，候选 ZIP 下载与归档一致。`npm run release:offline` 为 83 JS + 34 Python 全通过、0 失败。
- **限制** Sites 中继 readiness 仍超时。原私有生产站的安全登录未完成，等待获准账号登录。离线单页先用 loopback HTTP 加载，停服务后导入导出预检成功。浏览器从本地文件打开未通过，等待用户本机反馈。详细状态见 [验收记录](PRICING_BROWSER_ACCEPTANCE.md)。
- **交接** 候选提交 `836b740` 已合入 GitHub `main`，保留上游文档提交 `b40a6ca`。同步前已审查 26 条文件路径，核对版本清单、归档内容、虚构样例和截图。从 GitHub 下载的 ZIP 的 SHA-256 为 `95dee41f900893de3e7774e454e589fba8b918ebb48bab6d0d142da0b7953376`。另下载核对了虚构 XLSX 和两个 PDF。私有生产站为 `0.3.0-dev`。新对话从上面的两项验收继续。[验收清单](PRICING_BROWSER_ACCEPTANCE.md)


### 2026-11-18 — 重试私有生产验收，离线工作暂停

- **新增、删除业务功能** 均无。**修改** 仅更新本状态及浏览器验收记录。根据用户本轮决定，优先现有在线站点。
- **基线与平台核对** GitHub main `227ff50d2dcfc4fd77e86e749bc9f5604eaeeddb`，候选包 0.3.1-dev。Sites 最新第 5 版部署成功，源码 `fff0d1fe414b09464089a4f6734b6a03f56738ff` 对应 0.3.0-dev。
- **实测** Codex 使用共享桌面 Chromium 156.0.8078.79，两次从私有生产入口进入 OpenAI 登录页。登录后版本、虚构导入、三模式、在线核价、失败提示和导出仍阻塞。生产下载件 0 份。上轮本地 HTTP 的 12 份下载件单独保留。
- **范围与同步** 离线原生文件打开受环境策略限制，用户已暂停该项。尚无本轮生产业务缺陷可定位。未改运行代码，未重跑业务回归。本次提交仅同步两份文档；站点部署继续沿用上表记录。P0 下一步是获准账号进入工作台后完成在线矩阵；两项 TCP 问题继续单独跟踪。

### 2026-11-18 — 在线分批核价与 Excel 一致性修复

- **修改** 每批独立尝试，只收集当前批次内通过价格证据校验的结果，全部批次结束后一次更新。两个导出入口与页面使用同一份目录，导出时统一检查有效期。在线候选版本 0.3.2-dev。**新增** 11 个虚构 SKU 的 Chromium 回归及下载核验摘要。**删除** 无。
- **复现及复验** 审核基线首批 503 后遗漏第 11 项；第二批等待中页面 90 USD、XLSX 250 USD。修复后两个场景通过，失败项保留原证据，过期和缺价行金额为空。10 份分批下载和 9 份在线主流程下载均已重开五表。真实华为云公开核价按三种模式各成功 3 项。[浏览器验收及复跑命令](PRICING_BROWSER_ACCEPTANCE.md)
- **回归** 在 `pricing-studio/web/` 运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，82 项通过、0 失败。运行 `python -m unittest discover -s tests -p test_catalog.py`，4 项通过、0 失败。Node 24.22.1、Python 3.12.14。按本轮范围跳过离线打包和验收。
- **同步与阻塞** 本次提交同步经过本地回归的在线修复源码 `45770a63bb43c654ae861944cea9ce87c1fa395f` 及证据。生产站仍需获准账号完成登录，工作台版本及生产下载件待实测。在线候选尚未部署。两项 TCP 问题继续单独处理。


### 2026-11-18 — 私有站发布在线修复

- **发布** Sites 第 6 版私有部署成功。14 个网页资源及 Worker 源码逐字节核对 GitHub `c60138e`，所有者访问范围复查通过。沿用第 5 版的 `0.3.0-dev` 离线 ZIP，下载路径及归档 SHA-256 已通过构建产物测试。
- **部署前回归** 在 Sites 发布目录构建 Worker，82 项 JavaScript 和 4 项 Python 检查通过。两组 Chromium 分批场景通过，实际下载 10 份 XLSX 并重开核对五张表。
- **验收进度** 私有站登录后的工作台验收留待后续会话。本次验收任务的已完成部分为发布和本地回归。[当前验收记录](PRICING_BROWSER_ACCEPTANCE.md)

### 2026-11-18 — 生产功能验证

通过 Sites 官方服务访问测试第 6 版 Worker。实际浏览器导入、确认、三种计费模式、折扣、双语和重载通过。生产官方核价 9 项成功，9 份下载件用 openpyxl 重开核对五张表。浏览器模拟连接中断后，价格证据和报价保持一致。用户随后确认其浏览器打开私有站后直接进入工作台。本轮验收通过，首次登录与回跳经确认跳过。[验收记录](PRICING_BROWSER_ACCEPTANCE.md)

### 2026-11-18 — TCP 自动发布核心

- **新增** 首版自动发布、异常复查、独立核验时钟和生效状态，以及 CLI 原子导出 `publication`。发布和检查决定同事务写入 SQLite。
- **修改** 以最近发布版本评估变化。大幅价格变化需要较新修订和第二次一致的官方取证。异常结构、规则变化、目录回退以及核验失败保持 Pending，历史目录和固定报价快照可追溯。更新 Web 状态卡与 Worker 检测。Huawei 引擎和价格目录沿用原实现。
- **删除** CLI 人工审批命令和报价校验中的审批依赖。已有历史审批数据保留供追溯。
- **测试** 在 `pricing-studio/web/` 使用 Node 24.22.1、Python 3.12.14 和 pdfplumber 0.11.9。运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，83 项通过。用 `python -m unittest discover -s tests -p <文件名>` 分别运行 `test_catalog.py`、`test_catalog_updates.py`、`test_tcp_pdf.py`、`test_schedule.py`，共 30 项通过，另通过 CLI 空库状态导出实测。均为 0 失败。
- **验证边界与同步** 使用虚构价格及 PDF。构建测试 Worker 时复用既有归档，离线构建及验收暂停。本次交付经核验的 GitHub 开发源码，私有站部署为 0.3.2-dev。云端调度、对象存储发布、真实 PDF 新规则验证和 TCP 自动报价属于下一阶段。

### 2026-11-18 — TCP 真实官方目录初始化

- **新增** 官方源的首版及重复发布证据、9 个独立原文对照样本、KMS/EVS/OBS 范围回归。**修改** KMS 的明确专属条款只保留在对应诊断中，EVS GP SSD v2 条件只隔离命中的价格行，OBS 提前删除费按条件费用处理。解析器版本为 `tcp-pdf-0.3.0-3`。**删除** 无。
- **实测** 官方 2026-10-09 修订的 PDF 在隔离 SQLite 中自动发布，`currentVersion=tcp-2026-10-09-c88c0aff01e08ade-tcp-pdf-0.3.0-3`、`effectiveState=ACTIVE`。重复检查为 `UNCHANGED`，核验时间更新至 `2026-11-18T14:58:38.490856+00:00`，价格及来源证据逐项相同。模拟超过 48 小时的时钟，目录转为 `STALE`，已固定快照仍可追溯。[覆盖与抽样核对](PRICING_V03_TCP.md)
- **回归** 在 `pricing-studio/web/` 使用 Node 24.22.1、Python 3.12.14、pdfplumber 0.11.9。83 项 JavaScript 与 34 项 Python 通过，0 失败。JavaScript 使用 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`。Python 运行 `test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule`。官方文件变化、价格异常和解析失败使用可控虚构夹具。Huawei 计费与 Excel 回归通过。
- **交付边界与后续** 本轮同步经检查的源码、测试和公开证据摘要。原始 PDF、SQLite 与运行输出留在隔离工作区。本轮验证的是目录资格和有效期。推荐在带持久磁盘的托管 Linux 上运行上游更新任务，经对象存储交付 Worker，再接入少量 ECS、EVS 和 RDS 的报价映射。[托管计划](PRICING_V03_TCP.md#managed-scheduling-and-delivery-plan)

### 2026-11-18 — TCP 在线目录发布与读取

- **新增** Python `publish`、S3/R2 条件写入适配、Worker 目录和在线状态接口。目录以 SHA-256 为键，包含已核验价格行和原始证据。SQLite 继续保存完整快照。
- **修改** Worker 状态由实际对象存储提供，官方文档检查仍只检测变更。发布开始标记 Pending，目录写入并回读后才切换生效指针。Worker 在返回前复核当前对象和有效期。**删除** Worker 的构建时状态回退。Huawei 报价和 Excel 使用原有实现。
- **回归** 在 `pricing-studio/web/` 使用 Node 24.22.1、Python 3.12.14、pdfplumber 0.11.9 和 boto3 1.40.67。运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，92 项通过。Python 的 `test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule` 和 `test_catalog_publication` 共 42 项通过。均为 0 失败。额外通过本地 workerd 与模拟 R2 验证虚构 PDF 到接口、Pending 及过期 ETag 条件写入。构建 Worker 时复用既有 ZIP，离线开发及专用测试暂停。
- **同步与部署** 本条记录随 GitHub main 的在线发布源码交付。已记录的私有站仍是 0.3.2-dev，本轮未部署或创建云资源。下一阶段在获准的托管环境接入持久 SQLite、定时器和私有对象存储，完成真实官方目录的云端验收。[发布契约和运维计划](PRICING_V03_TCP.md#online-publication-contract)

### 2026-11-18 — TCP EU-DE 按需报价

- **新增** 在线目标平台选择、ECS 和 RDS 的少量精确配置映射、EVS 确认产品名后的简单容量核价，以及 TCP 的五表 Excel。页面和工作簿共用计算结果，月度与来源账期分列，待复核金额留空。GP SSD v2、IOPS 和吞吐量保持待复核。
- **修改** 用有效官方目录验证地区、SKU、配置和计费单位。私有站首次发布使用现有核验快照，原核验时间为 `2026-11-18T14:58:38.490856+00:00`，有效至柏林时间 11 月 20 日 15:58:38。可用的 Worker 存储绑定优先。**删除** 无。
- **验收** Chromium 156.0.8078.79 和 openpyxl 3.1.5 重开生产真实下载件。9 行虚构资源中 4 行计价、5 行待复核，月度 €43.71，来源账期 €1.14。两个 Excel 入口和过期场景均通过。Huawei 按需、包月、包年各实际下载并重开。96 项 JavaScript 和 42 项 Python 回归全部通过。[浏览器证明](PRICING_BROWSER_ACCEPTANCE.md#2026-11-18--tcp-eu-de-按需报价)
- **同步与部署** GitHub main 接收本轮源码与虚构夹具。私有站第 7 版 `0.3.3-dev` 已成功部署。沿用原站点访问范围和离线 ZIP。正式对象存储绑定、连续核验、并发发布及检测时间戳留待后续。未同步下载件、原始 PDF 或 SQLite。

### 2026-11-18 — Huawei 规格匹配与本机模型导入

- **新增** ECS、EVS、DCS 和 RDS 实例的规则匹配。同区同计费目录存在唯一符合规格的记录时自动选用，按公开价格证据校验和计算。未指定的通用 ECS 配置与普通 SSD 的估算假设可见。部署模式、节点数、复杂性能要求和无法确认的价格进入 Pending。人工选型优先。**删除** 无。
- **修改** 非标准 UTF-8 CSV 和多工作表 XLSX 在本机服务使用结构化模型预览，保留原始单元格、工作表和行号。用户确认后才计价。标准模板继续直接导入。托管站提供手动预览，本机模型通过独立环回适配器配置。TCP 报价路径和离线归档沿用既有版本。
- **回归** 在 `pricing-studio/web` 使用 Node 24.22.1 运行线上测试 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，103 项通过。Python 3.12.14 的目录、核验、PDF、调度和发布五组共 42 项通过，0 失败。本机 Qwen 实际完成两个非标准场景。Chromium 下载后由 openpyxl 重开核对，使用真实公开目录及虚构输入。生产站三个公开价格查询成功。[浏览器验收](PRICING_BROWSER_ACCEPTANCE.md#2026-11-18--huawei-规格匹配与智能导入)
- **同步与部署** GitHub 分支 `feat/huawei-pricing-import`，私有站第 8 版 `0.3.4-dev`。正式用户自行配置可信本机模型、限制浏览器来源并使用本机认证。模型预览有范围限制，不保证所有表格字段可自动识别。客户文件、模型权重、下载工作簿与凭证均留在受控环境。[模型配置](../pricing-studio/web/README.md#model-assisted-csv-and-excel-on-the-user-machine)

### 2026-11-18 — Huawei Redis 单机估算与多服务验收

- **实现** 明确 Redis 容量且拓扑未指定时，只从当前区域和计费模式选唯一兼容的单机 SKU。页面和 Excel 的估算假设字段均显示「按单机估算，部署模式未指定」。缺数量仍可推荐 SKU，报价金额留空。显式拓扑、主备多解、容量或架构冲突及无效价格继续 Pending 或沿用原明确约束匹配。手动选择优先。**删除** 无。
- **自动测试** 在 `pricing-studio/web` 使用 Node 24.22.1 先运行 `node --test tests/huawei-import.test.mjs`，8 通过、0 失败。仅在线构建复用旧附件后运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，104 通过、0 失败。Python 3.12.14 以 `python3.12 -m unittest discover -s tests -p <suite>.py` 跑 `test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule`、`test_catalog_publication`，42 通过、0 失败。
- **浏览器验收** Chromium 156.0.8078.79 与 openpyxl 3.1.5。使用仓库固定的公开目录及虚构 10 行混合 CSV，在本地 HTTP 和私有站均执行导入、核价和真实下载，重开每个工作簿的五张表。4 行计价合计 USD 355.80，6 行 Pending。手工改主备并确认后 USD 368.21。模拟过期后 10 行金额均为空。未发现 ECS、EVS、RDS 本次用例的独立缺陷。[验收明细](PRICING_BROWSER_ACCEPTANCE.md#2026-11-18--huawei-redis-单机估算)
- **同步与实际部署** 评审基线 `c4f34d337150b6cfb4855e75c6a23633d4eb5d8b`，GitHub 分支 `fix/huawei-redis-default`。私有站第 9 版 `0.3.5-dev` 实际生效，生产浏览器通过 Sites 服务访问验收。固定目录原验证时间保留，测试未调用实时核价。离线开发、打包和验收继续暂停。

### 2026-11-18 — Huawei EVS 每盘容量编辑

- **新增** 在线 EVS 的每盘容量输入和双语冲突提示。规格文本与导入或填写的每盘容量不一致时，即使确认了 SKU，也保持 Pending，页面和 Excel 的报价金额留空。
- **修改** 重新从编辑后的规格提取每盘容量，保留独立盘数和账单用量。按需优先使用已填账单用量，整月估算使用当前每盘容量。包月、包年使用当前每盘容量及各自的官方费率。自动匹配和手动确认路径均覆盖。**删除** 无。
- **自动测试** 在 `pricing-studio/web` 运行 `node --test tests/huawei-import.test.mjs`，11 通过、0 失败。Node 24.22.1 运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，107 通过、0 失败，含 DCS、ECS、EVS、RDS、Excel 和 Worker。Python 3.12.14 运行 `python3.12 -m unittest discover -s tests -p <suite>.py`，`test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule`、`test_catalog_publication` 共 42 通过、0 失败。离线构建和专用测试暂停。
- **浏览器验收** Codex 用 Chromium 156.0.8078.79 和虚构输入在本地与生产站分别实际编辑、下载，每处 5 份工作簿均以 openpyxl 3.1.5 重开核对五张表。单盘 100→200 GiB，按需月参考金额 USD 10.44→20.88。混合清单中两块各 200 GiB 的报价为按需 USD 41.76/月、包月 USD 40.00、包年 USD 416.00，包年月均 USD 34.67。另一行按需计费使用独立导入的 80 GB-month。三模式的页面与 Excel 月均小计分别为 USD 50.11、60.00、52.00，包年首期合计 USD 624.00。显式容量冲突在三个模式均留空，填写为 200 GiB 后恢复。两处工作簿逐字节一致，混合包年工作簿 SHA-256 为 `01e619b550dc31c9009f1c73ad42f8e954813bb9b615a73439142a0d8d335b68`。验收使用固定公开目录和固定时间，未调用实时核价。
- **同步与实际部署** 源码、回归及本文通过 `fix/huawei-evs-capacity` 交付。私有站第 10 版 `0.3.6-dev` 已实际生效，生产 Chromium 使用 Sites 服务访问验收，所有者访问范围复查通过。TCP 和离线版本继续暂停。

### 2026-11-18 — Huawei EVS 独立计费用量与 DCS 容量编辑

- **新增与修改** EVS 规格文本分别提取每盘容量、带计费单位的用量和盘数。独立导入或填写的用量保留，缺用量仍可按整月估算。包月与包年继续按每盘容量计价。DCS 重新提取编辑后的规格容量，独立导入或填写的容量与规格冲突时金额留空。手动 SKU 保留确认流程，并核对已知容量；缺数量仅推荐 SKU，单机估算假设继续显示。**删除** 无。
- **自动测试** 在 `pricing-studio/web` 用 Node 24.22.1 运行 `node --test tests/huawei-import.test.mjs`，13 通过、0 失败。运行 `node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs`，109 通过、0 失败。Python 3.12.14 以 `python3.12 -m unittest discover -s tests -p <suite>.py` 跑 `test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule`、`test_catalog_publication`，42 通过、0 失败。
- **本地浏览器** Chromium 156.0.8078.79 实际下载 7 份 XLSX，openpyxl 3.1.5 重开核对五表。EVS 每盘 100 GB、1 块、80 GB-month 按需 USD 8.35，包月 USD 10.00、包年 USD 104.00。CSV 和 XLSX 编辑规格至 200 GB 后仍保留独立用量 80 GB-month。Redis 2G 改 4G 与直接输入一致，匹配 `redis.single.xu1.large.4` 和 USD 49.64/月。含 ECS、EVS、DCS、RDS 的清单为 4 行计价、1 行 Pending，月均小计 USD 269.25。实际本机 Qwen 分析虚构多 Sheet XLSX，预览修正后确认，Excel 核对源表、行号、原始字段、SKU、用量、金额与 Pending 空值。
- **生产浏览器与部署** 私有站第 11 版 `0.3.7-dev`，Site 源码见顶部状态。Codex 通过 Sites 服务访问使用相同 Chromium 执行文本、CSV、XLSX 及私有站手动预览路径，确认无模型请求。7 份真实下载逐一重开五张表，与本地逐字节一致。多 Sheet 下载 SHA-256 为 `3ad9d9f1f6190b9f83aa2e9ba37555942941dd811c66e784bfabb6c8a53092d6`。价格使用固定的已验证公开快照，登录交接与实时核价未重测。所有者访问配置复查通过。
- **源码与离线包** 开发分支 `fix/huawei-storage-cache-input`，交付 `0.3.7-dev` 在线源码、测试与状态记录。离线继续暂缓，GitHub 归档仍是 `0.3.1-dev`，私有站下载附件保留 `0.3.0-dev`。TCP 另行验证生产调度与存储接入。

### 2026-11-19 — Huawei 在线规格和本机导入复核

- **新增** ECS 显式系列匹配、私网 NAT 限实例费匹配。非标准输入支持模型建议表头映射、目标区域、原表头追溯和逐行字段核实。未经核实的计价字段随报价作为 Pending。
- **修改** DCS 和 EVS 容量编辑区分规格派生值与独立填写值。ECS、DCS、RDS 对冲突参数保留复核。手动 SKU 切换计费模式时保留同一 SKU，缺独立方案则留待确认。标准模板绕过模型，非标准路径校验字段来源并复用同页最近四次成功分析。**删除** 无。
- **自动测试** 在 `pricing-studio/web` 使用 Node 24.22.1 构建在线 Worker，`PRICING_OFFLINE_ARCHIVE` 指向仓库旧 ZIP。`node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs` 共 114 通过、0 失败，含 Huawei 专项 18 项。Python 3.12.14 运行 `python3.12 -m unittest discover -s tests -p '<suite>.py'` 的 `test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule` 和 `test_catalog_publication`，40 通过、0 失败、2 项因缺 `boto3` 跳过。父级 `pricing-studio` 运行 `PYTHONPATH=src python3.12 -m unittest discover -s tests`，1 项通过。离线发布和专项测试暂停。
- **浏览器验收** Chromium 156.0.8078.79、Playwright、openpyxl 3.1.5。标准与非标准导入、纠正错列、同页复用、多计费模式、页面部分小计、实际下载和五表重开通过。华为云官方核价 9 项通过。超时用浏览器注入，异常结构由本机模拟服务实际返回。[验收记录](PRICING_BROWSER_ACCEPTANCE.md#2026-11-19--huawei-在线规格和本机导入复核)
- **待办与同步** `0.3.7-dev` 作为在线候选经 `feat/huawei-pricing-import` 提交 GitHub 草稿 PR。P0 在获准的本机模型运行时验证更新后的 schema 与两类导入。P1 保持复杂部署、许可、附属费用和目录缺项 Pending，后续按官方证据扩展。生产站继续运行 `0.3.6-dev`。验收仅用虚构清单，模型权重、验收下载件及凭证留在仓库外。

### 2026-11-19 — Huawei 在线基线整合

- **新增** 定向回归包括带计费单位的 EVS 原始用量、独立导入用量、容量编辑、用量范围和 Redis 手选容量差异。服务覆盖沿用 ECS、EVS、Redis DCS、限实例费的 RDS 及 PR #14 中已有的私网 NAT。
- **修改** 统一 `app.mjs`、`engine.mjs`、`huawei-match.mjs` 的容量来源及编辑状态。EVS 按需读取实际用量，包月和包年按每盘容量乘盘数。来源冲突或 Redis 手选规格容量不符时，页面与 Excel 的报价金额留空。保留 #14 的区域和拓扑校验、手选 SKU 确认及模型预览验证。资源卡 `ui.mjs` 保留统一容量入口，状态文档保留两轮各自的验收记录。
- **删除** 两套重复的容量来源字段。统一的容量状态由文字解析、模型导入和手工编辑共用。
- **自动测试** 在 `pricing-studio/web` 用 Node 24.22.1 运行 `node --test tests/huawei-import.test.mjs` 通过 21 项。在线构建通过，`node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs` 通过 117 项。Python 3.12.14 运行 `python3.12 -m unittest discover -s tests -p '<suite>.py'` 的 `test_catalog`、`test_catalog_updates`、`test_tcp_pdf`、`test_schedule`、`test_catalog_publication`，40 通过、2 项因缺 `boto3` 跳过。父级 `pricing-studio` 运行 `PYTHONPATH=src python3.12 -m unittest discover -s tests` 通过 1 项。上述命令均无失败。
- **浏览器** Chromium 156.0.8078.79 与 openpyxl 3.1.5 核对 15 份真实下载。Redis 2 GB→4 GB→4 GB 主备自动切换 SKU。EVS 两块盘、每盘 100→200 GB，保留 80 GB-month 按需用量，金额 USD 16.70。三种计费模式各有 3 个 SKU 实时询价通过。非标准 CSV 和多表 Excel 经本机模拟端点验证预览修正、确认、核价和导出。当前环境缺可用的真实本机推理运行时与权重，真实模型复验保留待办。[浏览器验收](PRICING_BROWSER_ACCEPTANCE.md#2026-11-19--huawei-主线整合验收)
- **后续覆盖** 先用真实本机模型复验两类虚构文件。再按官方目录和独立计费证据补充 Redis 版本与拓扑、EVS 性能型用量和 RDS 存储及备份。ELB 和 CCE 仍需手动选型，OBS 缺目录费率，跨区、复杂带宽与流量等缺项保持 Pending。
- **同步** GitHub 确认 PR #13 和 #14 均为 Merged。#13 的修复随 #14 一次合入，`main` 的 Web 代码基线为 `0dbd72463b21e3f85d9ac879fd4de897d5241237`，版本 `0.3.8-dev`。之后追加了本文状态记录。生产站仍以最近记录的独立发布为准。[PR #13](https://github.com/jh1369/cloud-solution-studio/pull/13) · [PR #14](https://github.com/jh1369/cloud-solution-studio/pull/14)

### 2026-11-19 — Huawei 自动报价覆盖率分析

- **新增** 面向 `0.3.8-dev` 的覆盖矩阵、虚构混合清单、Pending 分类和三个长期覆盖建议。**修改** 本文优先级。**删除** 无。交付内容为仓库文档。[覆盖报告](HUAWEI_QUOTE_COVERAGE.md)
- **测试** 在 `pricing-studio/web` 以 Node 24.22.1 运行 `node --test tests/huawei-import.test.mjs`，21 通过、0 失败。用实际随包目录和现有导入、匹配、报价逻辑执行 32 行虚构 CSV。Chromium 156.0.8078.79 导入该清单及两份虚构 AWS 样式 XLSX，三份下载均以 openpyxl 3.1.5 重开验证。主清单月均小计 USD 801.70，Pending 金额为空。两份 XLSX 使用不同虚构资源标识及公式或数值来源成本，均为 2 项计价、2 项 Pending 和 USD 127.95 小计。
- **结果与边界** 主清单识别 31 / 32、自动匹配 13 / 32、计价 12 / 32、Pending 20 / 32。4 行需架构或输入复核，16 行为现有能力缺口，其中 13 行缺项目已验证价格、10 行缺计费规则，两者重叠 10 行。报价采用随包已验证费率，欧站原始目录用于候选发现。真实模型、生产及离线验收沿用各自记录。
- **长期优先级** RDS 数据盘和超额备份优先，其次为专享 ELB/EIP 分项与 OBS 标准单 AZ 按需。EVS 性能费率需补足明确来源。覆盖率报告和本条状态记录为本轮 GitHub 同步范围。

### 2026-11-19 — Huawei DCS 官方产品规格元数据

- **新增** `0.3.9-dev` Web + Worker DCS 规格端点、版本 1 元数据、15 分钟区域规格证据和 8 条带版本的官方文档候选。规格关联沿用现有官方核价、费用计算与三种计费。**修改** DCS 自动和手选规则、页面证据、五表 Excel 的 Service Mapping 和 Public Pricing。**删除** 在线 DCS 从价格描述推导规格的分支。 [接口与扩展点](../pricing-studio/web/README.md#official-dcs-product-specifications)
- **定向与完整回归** 在 `pricing-studio/web` 用 Node 24.22.1 和 Python 3.12.14，设置 `PRICING_OFFLINE_ARCHIVE` 为已发布的 `0.3.1-dev` ZIP 后执行 `npm run build`。`node --test tests/dcs-specs.test.mjs tests/huawei-import.test.mjs` 29 通过，`node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs` 125 通过。已归档 ZIP 单独逐字节核对通过。`PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication` 40 通过、2 项缺 `boto3` 跳过。父级 `pricing-studio` 执行 `PYTHONPATH=src python3.12 -m unittest discover -s tests` 1 通过。以上 0 失败。
- **实际官方接口** 在 EU-Dublin 对 ListFlavors 发起无认证请求，返回 HTTP 401。公开询价对下表三个 SKU 逐模式验证，3 组均 HTTP 200，9 / 9 通过产品、地区、币种、单位与计费证据检查。费率与仓库现有快照相同。公开询价确认费率。区域可售性验收待认证响应。 [ListFlavors](https://support.huaweicloud.com/eu/api-dcs/ListFlavors.html) · [公开询价](https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource)

| 虚构规格输入 | 匹配的规格编码 | 实际官方单价 USD，按需每小时 / 包月 / 包年 |
| --- | --- | --- |
| 2 GB 单机 x86 | `redis.single.xu1.large.2` | 0.034 / 16.75 / 167.53 |
| 2 GB 主备双副本 x86 | `redis.ha.xu1.large.r2.2` | 0.068 / 73.10 / 728.09 |
| 4 GB Redis Cluster 双副本三分片 x86 | `redis.cluster.xu1.large.r2.4` | 0.182 / 125.28 / 1247.70 |

- **浏览器与 Excel** Chromium 156.0.8078.79 跑通实际页面、Worker 和下载。模拟 ListFlavors 验证三种规格、容量和拓扑编辑、三模式报价、三副本手选及重回自动匹配。混合清单 5 行计价、3 行 Pending，月均小计 USD 302.50。禁用服务端认证后由标准 CSV 导入同三个规格，3 行均显示文档候选和认证原因。openpyxl 3.1.5 重开两份下载，确认五表、三种计费单位和款项、两类来源及 Pending 金额空白。
- **边界** 模拟响应检验 Arm 缺价格关联、版本或分片不匹配、可用区缺失、区域不符、认证失败、API 超时、重复候选及证据过期。当前重点是 EU-Dublin 的 Redis DRAM 普通实例。跨可用区部署承诺、QPS、计费阶梯及没有确切单位的带宽要求仍要复核。真实区域可售结果待获准的认证复验，私有站当前以最近发布记录为准。
- **同步与后续** 本轮源码分支 `feat/huawei-dcs-product-specs`，`main` 同步以包含本条记录的提交为准。本轮使用存档离线附件做在线构建。ECS、RDS、ELB 的后续接入复用产品证据结构，各自补充官方维度和 SKU 关联。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [服务扩展点](../pricing-studio/web/README.md#official-dcs-product-specifications)

### 2026-11-19 — Huawei DCS 无账号公开报价

- **新增** 将 2025-11-03 版欧站规格表 1、2、3、5、7 的 90 条记录及两个三副本示例纳入文档快照。当前可精确关联 71 个按需、92 个包月和 92 个包年方案。**修改** 唯一文档规格关联 `eu-west-101` / `USD` 的独立报价证据，保留规格编辑、手选、显式假设和五表导出。**删除** ListFlavors 路由、IAM 配置与规格证据刷新计时器。 [规格与匹配规则](../pricing-studio/web/README.md#official-dcs-product-specifications)
- **自动测试** 在 `pricing-studio/web` 用 Node 24.22.1、Python 3.12.14，指定现有 `0.3.1-dev` 离线附件执行 `npm run build`。`node --test tests/dcs-specs.test.mjs tests/huawei-import.test.mjs` 通过 26 项。`node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs` 通过 122 项。`PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication` 通过 40 项，2 项缺 `boto3` 跳过。父级 `pricing-studio` 的 CLI 测试通过 1 项。以上 0 失败。
- **公开询价** 无账号、Token 或 Cookie 的真实公开请求覆盖 2 GB 单机 `redis.single.xu1.large.2`、2 GB 主备 `redis.ha.xu1.large.r2.2` 和 4 GB 双副本三分片 `redis.cluster.xu1.large.r2.4`。每个 SKU 三种模式各一次，9 / 9 验证通过。单位、地区、币种和来源与随包快照一致。 [欧站公开询价](https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource)
- **浏览器与 Excel** Chromium 156.0.8078.79 加载构建的 Web + Worker，未配置华为云账号及 IAM Token。通过容量、拓扑编辑、8 GB 主备手选、三模式公开刷新和过期价格回归。混合清单含 ECS、EVS、RDS 与 DCS，6 行计价、4 行 Pending，月均小计 USD 402.51。非标准 CSV 与多表 Excel 使用注入的模拟本机模型完成导入。openpyxl 3.1.5 重开 4 份实际下载，验证五张表、规格及价格证据、原始行号和 Pending 空白。真实本机模型复验沿用独立待办。
- **版本与部署** 在线源码 `0.3.10-dev` 由 `fix/huawei-dcs-public-quotes` 交付。原私有站第 12 版发布 `succeeded`，生产资产与发布源码逐字节核对，生产公开询价 9 / 9。所有者访问范围复查通过。原生产下载附件逐字节核对通过，TCP 目录保留原校验时间与 SHA-256。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)
- **剩余边界** 区域公开报价提供 EU-Dublin 估算。需确认带指定 AZ、跨 AZ、无匹配 Arm 或多副本规格，以及无有效价格的条目。优先扩展 RDS 数据盘和备份、ELB/EIP 与 OBS 的独立计费覆盖。 [覆盖率分析](HUAWEI_QUOTE_COVERAGE.md)

### 2026-11-19 — Huawei ELB、CCE 和公网 NAT 自动规格匹配

- **新增** 对照欧站公开规格自动匹配专享弹性 ELB 基础实例、六档 CCE Standard 管理、Autopilot 管理与明确购买的资源包，以及公网和私网 NAT 实例。四档公网 NAT 已分别核验 1 与 2 个计费日的公开 USD 费率，采用整计费日用量。EIP 识别覆盖典型 Elastic IP 与 VPC 描述。 [规格来源与覆盖范围](HUAWEI_QUOTE_COVERAGE.md#0311-dev-覆盖率复测)
- **修改** 在 DCS 已有产品规格证据基础上共用规格到价格连接。手选后重新校验输入和计费模式。ELB LCU、CCE 节点/存储/网络、NAT EIP 等关联费用可单列 Pending，页面与 Quotation 小计使用同一组结果。**删除** 无。
- **覆盖率复测** 原 32 行虚构 CSV 在 `29f5d3c` 与 `0.3.11-dev` 上分别得到识别 31 → 32、自动匹配 14 → 18、计价 13 → 16、Pending 19 → 16。当前部分月均小计 USD 1,029.09。公网 NAT 小时用量行需补计费日，仍匹配到规格。 [复测口径与 Pending 分布](HUAWEI_QUOTE_COVERAGE.md#0311-dev-覆盖率复测)
- **自动测试** `pricing-studio/web` 使用 Node 24.22.1、Python 3.12.14，通过 `npm run build`，构建引用已有 `0.3.1-dev` 附件。`node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs` 在线项 129 通过。全量 JS 执行中唯一失败项读取本轮未生成的 `0.3.11-dev` 离线 ZIP。`PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication` 通过 41 项，2 项因缺 `boto3` 跳过。`pricing-studio` 下 `PYTHONPATH=src python3.12 -m unittest discover -s tests` 通过 1 项。
- **浏览器与 Excel** Chromium 156.0.8078.79 使用实际构建页面和 Worker 测试标准 CSV、人工选型及编辑、过期和三模式。真实欧站公开刷新通过 8 / 8，未使用华为云账号、Token 或 Cookie。七类服务混合样例含 10 个原始资源行，拆分后 8 项计价、10 项 Pending，小计 USD 729.41。openpyxl 3.1.5 重开 4 份实际下载并核对五张表、计费模式、来源、分项和空白金额。
- **版本与发布** 在线版本 `0.3.11-dev` 由 `feat/huawei-infrastructure-auto-match` 交付。原私有站第 13 版发布成功，复核访问范围为所有者。13 个生产资产与发布源码逐字节一致。生产 14 / 14 个公开计划核价通过，包含 ELB、CCE Standard/Autopilot、四档公网 NAT 日价、网关订阅价和私网 NAT 小时价。TCP 快照的核验时间与 SHA-256、原下载附件均通过比对。GitHub 同步以包含本记录的 `main` 合并提交为准。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)
- **覆盖边界** ELB LCU、EIP、OBS、RDS 数据盘与备份、EVS 性能与快照及 CCE 的工作节点和网络等费用仍需独立核价。主控拓扑、来源用量、目标服务类型或性能要求不明确时需确认。当前优先核验 RDS 数据盘及超额备份。 [后续优先级](HUAWEI_QUOTE_COVERAGE.md#后续优先级)

### 2026-11-19 — Huawei 欧站 EIP 与 AWS 账期用量表

- **新增** `0.3.12-dev` 的 `19_bgp` 固定带宽三种计费模式、`12_bgp` 按需出公网流量和 `5_bgp` 按需闲置地址费，共五个独立验证计划。支持 ECS、ELB、NAT 的关联费用，使用 `eip_ref` 核对同一费用的引用。新增 AWS 账期用量表识别，将已核实的小时计量保留为累计来源账期，并保存原始行号。 [公开价格证据](HUAWEI_QUOTE_COVERAGE.md#0312-dev-eip-覆盖率复测)
- **修改** Worker 按官方规格及固定样本复验整笔 EIP 费率和阶梯。页面和 Excel 使用同一批独立费用结果。明确绑定显示地址保留费豁免，未知用量或冲突关联保持 Pending。**删除** 无。
- **覆盖率** 原 32 行虚构 CSV 的自动匹配从 18 增至 20，成功计价从 16 增至 18，Pending 从 16 降至 14。第 24、25 行分别增加 USD 129.94、USD 10.26，部分月均小计 USD 1,169.29。 [复测详情](HUAWEI_QUOTE_COVERAGE.md#0312-dev-eip-覆盖率复测)
- **自动测试** `pricing-studio/web` 使用 Node 24.22.1 / Python 3.12.14。指定既有存档附件后 `npm run build` 成功；`node --test --test-skip-pattern='Offline package is a byte-exact ZIP attachment' tests/*.test.mjs` 通过 136 项在线测试。`PYTHONPATH=tests python3.12 -m unittest test_catalog test_catalog_updates test_tcp_pdf test_schedule test_catalog_publication` 通过 41 项，2 项缺 `boto3` 跳过。`pricing-studio` 下 `PYTHONPATH=src python3.12 -m unittest discover -s tests` 通过 1 项。在线发布沿用存档离线下载。
- **浏览器验收** Chromium 156.0.8078.79 验证标准 CSV、ECS/ELB/NAT 关联 EIP、五个真实计划的三模式公开刷新、超阶梯及过期价格。隔离环境用实际附件复现通用导入上限报错及修复后的完整导入、账期部分报价和下载。openpyxl 重开四份虚构报价及隔离区内的实际报价，核对五表、行号、计费证据和 Pending 空白。公开回归使用 73 行虚构用量表。 [虚构回归](../pricing-studio/web/tests/huawei-eip.test.mjs)
- **交付** 开发分支 `feat/huawei-eip-quoting`，GitHub 以包含本记录的 `main` 合并提交为准。原私有站第 14 版已发布，所有者访问范围复核通过。13 个线上资产与源码逐字节一致。生产端 5 / 5 个 EIP 计划及其询价样本通过核验，原 TCP 快照和下载附件均通过比对。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)
- **覆盖边界** 动态 BGP 以外的 EIP、共享带宽、流量包，以及超过核验上限或欠缺单地址月度口径的流量仍需复核。AWS 用量表中的陌生规格、RDS 架构和版本、缓存引擎与容量、CSS 无价格等条目保留 Pending。目录后续优先覆盖 RDS 数据盘和超额备份。 [后续优先级](HUAWEI_QUOTE_COVERAGE.md#后续优先级)

### 2026-11-19 — Huawei 本机智能导入与 AWS 来源规格

- **新增** 按工作表分批识别非标准 CSV/XLSX，校验每批行身份及合并完整性，保留原始单元格和字段证据。公开知识库收录 EC2 1,096 个、RDS 435 个、ElastiCache 107 个、OpenSearch 234 个精确型号。模型上下文只附此批匹配的 AWS 记录。 [公开规格和来源](../pricing-studio/web/README.md#aws-source-specifications-and-conditional-quotes)
- **修改** 直接导入 AWS 账期表复用官方来源记录。目标只使用现有 EU-Dublin 价格引擎，保留累计账期用量，按来源配置和目标报价方案批量复核条件估算。页面和五表分别汇总确认金额及条件金额。**删除** 单次模型预览 60 行上限，由分批和完整性约束替代。
- **验收与边界** 自动计价需要同时核验 AWS 来源规格与适用的 Huawei 价格。RDS 仍需引擎、版本和部署参数，数据盘及备份需独立报价。ElastiCache 节点内存不能确定 DCS 缓存容量或拓扑。CSS 暂缺核验过的目标计划。测试记录见第 7 节。
- **同步与部署** 开发分支 `feat/aws-ai-inventory`，GitHub 主线以包含本条记录的合并提交为准。在线 `0.3.13-dev` 已部署到原私有站第 15 版，下载附件沿用既有归档。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

### 2026-11-19 — Huawei Pending 原因评审

- **新增** 公开评审文档，以八个虚构示例说明 ECS、RDS、DCS 和 CSS 的首个阻塞原因、所需证据及待讨论问题。**修改** 覆盖率报告和开发状态加入评审入口。**删除** 无。 [Pending 原因评审](HUAWEI_PENDING_REVIEW.md)
- **验证** 在 `pricing-studio/web/` 使用 Node 24.22.1 复核八个虚构示例并执行 `node --test tests/aws-ai-inventory.test.mjs tests/huawei-import.test.mjs`，26 项通过、0 项失败。核对文档链接及提交范围。核价依据为随包目录。
- **剩余问题** 来源字段缺失、ECS 候选歧义及 CSS 目录缺口仍待评审。此次为文档同步，运行基线为 `0.3.13-dev` 和原私有站第 15 版。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/)

### 2026-11-19 — Huawei 四类 AWS 迁移报价

- **新增** ECS 受限升配和最多三个验证候选，AWS C3 架构证据、RDS 账单型号缩写、DCS 可用容量依据、CSS 普通 OpenSearch 节点与独立存储费。目标参数按来源配置分组设定，保留来源、用户确认和假设标记。
- **修改** 原报价引擎沿用证据校验，DCS 源节点小时与目标整体实例小时分列。RDS 与 CSS 的实例和存储分开。原始账期用量保留，价格或方案变更使相关确认失效。**删除** ECS 替代方案依赖严格等规格的限制，保留架构、OS 及许可校验。
- **验证与待确认** 24 行虚构清单有候选从 4 行升至 16 行，分组复核后主费用 8 行确认。Aurora、UltraWarm、部分架构或 OS、RDS 超额备份及 CSS 部分存储计费保留 Pending。真实清单由所有者自行在私有站复验，反馈采用公开脱敏模板。 [验证结果](HUAWEI_QUOTE_COVERAGE.md#0314-dev-四类迁移报价复测) · [脱敏模板](HUAWEI_PRIVATE_ACCEPTANCE_TEMPLATE.md)
- **同步** 分支 `feat/huawei-migration-coverage`，GitHub 以包含本条记录的主线合并提交为准。在线 `0.3.14-dev` 已发布至原私有站第 16 版。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

### 2026-11-19 — Huawei 真实参考清单脱敏回归

- **新增** 浏览器内两阶段统计导出、统计校验器与真实回归记录。**修改** 每次 Huawei 在线更新的仓库验收流程，记录主费用与关联费用的状态和原因计数。**删除** 无。 [真实回归记录](HUAWEI_REAL_REGRESSION.md)
- **验证与待办** 定向单测、完整在线回归、虚构 Excel 浏览器导入和两次下载通过，见第 7 节。历史真实基线为 `0.3.13-dev` 首次导入的 11 行已确认、27 行条件估算、74 行 Pending。收到最新版的两阶段脱敏统计后，按同一清单比较候选覆盖与剩余原因，优先检查历史阻塞最集中的 RDS、DCS 和 CSS。 [所有者验收](HUAWEI_PRIVATE_ACCEPTANCE_TEMPLATE.md)
- **同步** 分支 `feat/huawei-regression-report`，GitHub 版本以包含本条记录的主线合并提交为准。在线 `0.3.15-dev` 已发布至原私有站第 17 版。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/) · [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

### 2026-11-20 — Huawei 真实参考清单隔离复测

- **新增与删除** 产品功能均无。**修改** 脱敏回归记录、覆盖率及本开发状态。实测基线为 `36aec0ba7e2eaa79a2cf818d3cb8e015de9b0b18`，Web `0.3.15-dev`。 [实测报告](HUAWEI_REAL_REGRESSION.md#2026-11-20-隔离回归)
- **验证** 在 `pricing-studio/web/` 以 Node 24.22.1、Python 3.12.14 构建 Worker 成功。比较两版引擎，使用 Chromium 156.0.8078.79 依次验证首导、四类方案复核、两阶段下载以及 ECS 临时确认与失效。`node scripts/validate_huawei_regression.mjs` 两份统计通过配对校验。openpyxl 3.1.5 重开 2 份五表文件，112 行原用量、175 行费用和 90 行 Pending 空金额核对通过。0 个外部或模型请求。文档交付沿用该 Web 版本的自动测试记录。
- **分析与同步** RDS 尺寸缩写、ECS 规格目录、DCS 可用容量和节点计量、CSS 版本及冷数据仍是主要缺口。分支 `docs/huawei-real-workbook-regression`，GitHub 以包含本条记录的主线合并提交为准。实测采用随包公开价格，运行版本为原私有站第 17 版。 [GitHub main](https://github.com/jh1369/cloud-solution-studio/commits/main/)
