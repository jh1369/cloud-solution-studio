# Cloud Solution Studio · Pricing Studio 同类工具调研与开发参考

> 本文供调研和验收参考。项目进度见[开发状态](DEVELOPMENT_STATUS.md)。每轮开发任务由用户在 Codex 会话中直接下达。

| 字段 | 记录 |
| --- | --- |
| 调研日期 | 2026-11-18，Europe/Berlin |
| 项目基线 | `main` / [`eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0`](https://github.com/jh1369/cloud-solution-studio/commit/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0) |
| 用途 | 同类工具调研、产品设计选项和验收参考 |
| 证据范围 | 厂商官方文档、产品公开页面、维护者仓库和项目 GitHub 文档。同类 SaaS 的登录后流程、本项目的浏览器和价格测试均未在调研中复验。 |

## 1. 产品定位与调研基线

面向云解决方案架构师，把一份资源清单或受支持的账单转为**可复核的目标云估算**。核心路径是 **本地导入 → 给出目标规格及原因 → 人工确认 → 用官方证据计价 → 导出含假设和待确认项的 Excel**。调研覆盖 AWS→Huawei EU 的现有流程，以及 TCP 小范围报价的可行性。

- **调研基线已有的 Huawei 功能。** AWS→Huawei 的 CSV、XLSX、限定文字 PDF 导入、人工确认、三种目标计费模式、折扣/预付/摊销、五 Sheet 导出和单文件离线包已有实现记录。V0.3 文档记录 82 项 JS + 34 项 Python 通过，私有站点部署成功。预览中继超时、站点登录后的流程和离线双击后的完整流程仍有验收缺口。[开发状态](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/docs/DEVELOPMENT_STATUS.md#L128) · [原验收记录](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/docs/PRICING_MVP_ACCEPTANCE.md#L5)
- **TCP 已有目录候选和更新框架。** 项目记录的候选覆盖 ECS、EVS、EIP、ELB、OBS、RDS。目录结构校验、人工批准和实际计价是不同状态。初始目录尚未批准，TCP 自动报价尚未接入。[TCP 设计与覆盖](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/docs/PRICING_V03_TCP.md#L5)
- **数据边界。** 客户资料、真实账单、真实折扣/报价和内部 PPT 留在用户本机、Git 仓库之外。开发和验证只使用公开价格、通用代码和虚构数据。在线官方核价仅传允许的产品标识及必要计价参数，离线运行不产生自动联网请求。[项目安全规则](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/SECURITY.md) · [当前 Web 数据流](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/pricing-studio/web/README.md)

## 2. 同类工具怎么做

下表的“可借鉴”是对本项目的建议。第三方比较页只作为工作流参考和公开价格异常的交叉线索，正式估算使用厂商官方证据。

| 工具 | 公开资料显示的做法 | Pricing Studio 可借鉴 |
| --- | --- | --- |
| Azure Migrate | 支持导入 CSV，分开评估目标准备度、规格、费用和置信度。只有规格、缺少性能数据时，业务用例按现有规格估算，将使用率标为未知。 | 显示“按现有规格”或“按性能建议”及依据。账单里缺少性能数据时不给出自动缩容建议。将技术兼容和价格覆盖分开。[CSV 导入](https://learn.microsoft.com/en-us/azure/migrate/tutorial-discover-import?view=migrate) · [评估报告](https://learn.microsoft.com/en-us/azure/migrate/assessment-report) |
| Google Cloud Migration Center | 支持快速估算和分组 TCO。报告可把服务组放在同一方案下，提供目标资源、迁移选项和成本，支持下载 CSV/Excel。 | 按应用或迁移批次分组，保留从目标资源反查源行的路径。先交付目标资源清单和月费，业务案例再加入迁移成本和方案对比。[快速估算](https://docs.cloud.google.com/migration-center/docs/generate-estimate) · [TCO 报告](https://docs.cloud.google.com/migration-center/docs/generate-tco-report) |
| Cloudamize | 产品资料展示用实际性能数据做跨 AWS、Azure、Google Cloud 的选型和 TCO 比较，费用分析可查看预计年度成本。 | 长期支持把“原规格迁移”和“有性能依据的优化”作为两个独立情景。先补可比的性能、存储和网络参数，再谈跨云节省百分比。[评估产品资料](https://www.cloudamize.com/wp-content/uploads/2022/04/Cloudamize-Feature-Sheet.pdf) · [预计年度成本说明](https://support.cloudamize.com/kb/analyze-projected-annual-cloud-costs) |
| AWS Pricing Calculator | 区分公开计算器和控制台内估算。控制台可导入历史用量，按不同费率口径建模公开价、折扣和购买承诺，并导出资源级 CSV/JSON。 | 源云历史账单、目标云公开价、手工折扣情景各有字段。持续费、首期现金支出、承诺总价和摊销分开展示，注明假设。[控制台用量导入](https://docs.aws.amazon.com/cost-management/latest/userguide/pc-workload-estimate.html) · [费率与导出](https://aws.amazon.com/about-aws/whats-new/2025/05/aws-pricing-calculator-discounts-purchase-commitments/) |
| comparison.cloud | 其公开方法页称定期核对厂商公开价格，T Cloud Public 行使用官方 PDF 中 EU-DE 的按需列。表格区分最后检查、最后价格变化和匹配覆盖。缺行时总额只是下限，比较口径有明确排除项。 | TCP 状态卡显示来源、区域、最后尝试、最后成功核验和现行目录版本。让用户看到“已计价小计 + 缺项”，按需基准只用于市场对照。[价格来源及限制](https://www.comparison.cloud/en/cloud-pricing) |
| Infracost | 面向 IaC 做变更前估算，公开列出支持范围和跳过项。用量驱动费用需要额外输入，可配置用量假设。 | 对未覆盖资源给出明确原因，给出同一份清单因计费模式或公开价版本变化产生的差异。避免用默认用量填满未知项。[支持范围](https://www.infracost.io/docs/supported_resources/) · [用量费用](https://www.infracost.io/docs/features/usage_based_resources/) |
| Vantage / FinOps FOCUS | Vantage 提供符合 FOCUS 的自定义提供商 CSV 导入。FOCUS 规范区分账单成本和按使用归集的有效成本，还定义了时间、币种、用量和计价数量等字段。 | 在源云标准化模型里保持账期、单位、源计费方式、账单成本和摊销成本的原始口径。AWS 已公布 CUR 2.0 和 FOCUS 1.2 导出选项，后续单独适配实际输入版本，内部字段可借用 FOCUS 1.4 的概念。[Vantage 导入](https://www.vantage.sh/blog/vantage-launches-support-custom-providers-finops-focus) · [FOCUS 1.4 字段](https://focus.finops.org/docs/specification/v1-4/columns/) · [AWS Data Exports](https://docs.aws.amazon.com/cur/latest/userguide/) |

**官方价格入口。** T Cloud Public 官方计算器并列展示按需和预留模式，并链接服务描述与价目表 PDF。保持从官方入口发现当前文档。Huawei EU 官方文档分别说明按需和包年/包月询价，现有公开核价链路及兼容性以仓库为准。[TCP 官方计算器](https://www.t-cloud-public.com/en/prices/price-calculator) · [Huawei 按需](https://support.huaweicloud.com/eu/api-oce/bcloud_01001.html) · [Huawei 包年/包月](https://support.huaweicloud.com/eu/api-oce/bcloud_01002.html) · [仓库价格契约](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/pricing-studio/web/README.md#L70)

## 3. 设计选项与验收参考

| 评估主题 | 设计要点 | 核验示例 |
| --- | --- | --- |
| **真实浏览器验收** | Huawei 工作流可在本地 HTTP（`npm run dev`）和私有托管环境分别验证。离线版恢复后可单独验证归档 ZIP 解压后的桌面文件运行。 | 每项结果对应源码 SHA、浏览器、版本、实际操作和下载的 XLSX。环境阻塞单独记录。 |
| **TCP 计费条款变更** | 在 TCP 解析器和差异判定中覆盖服务章节、跨页说明、脚注和最低计费时长等规则。区分纯金额变化与规则变化，无法可靠解释的情况进入复核。 | 虚构新 PDF 单价不变、最低计费从 60 秒改为 600 秒时触发 `PENDING_REVIEW`。旧批准指针和历史快照保持原样。普通金额变化遵守已有升级策略。[前轮问题位置](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/pricing-studio/web/scripts/catalog_updater/tcp.py#L233) |
| **TCP 审批与核验** | 记录检查尝试、最后一次成功核验和审批三个事实。新文档解析失败时，旧候选仍保留以供追溯，报价门禁按真实检查结果判断。 | 虚构 PDF 解析失败后，重新批准旧目录不能把 `CHECK_FAILED` 变成可计价状态，也不能刷新成功核验时间或延长价格有效期。测试使用隔离数据和数据库。[前轮问题位置](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/pricing-studio/web/scripts/catalog_updater/service.py#L74) |
| **TCP 小范围报价** | 在计费条款与审批可靠、初始目录通过人工复核后，可评估明确地区的 ECS、EVS、RDS 简单按需 SKU。沿用 Web 引擎，价格契约使用 TCP 自身的币种、单位、区域和条款。 | 用虚构清单走完 AWS→TCP 选型、确认、计价、Excel。人工按官方 PDF 页/行复算带来源的示例。预留、复杂阶梯、网络和配套资源逐项标注覆盖情况。Huawei 原有结果经回归保持一致。 |
| **导入和映射解释** | 增加列映射预览和可复核错误列表，再评估一个 AWS CUR 2.0 或 FOCUS 输入版本。给已支持服务显示推荐理由、技术差异、缺少字段及允许的替代规格。 | 部分无效行可定位到文件和行号。SKU、数量、每盘容量、总用量和计费期间可区分。只有账单汇总小时数时保留原值，台数等未知字段提示补齐。 |
| **场景对比和架构覆盖** | 保留五 Sheet 合同，在页面及 Assumptions 中组织按应用/批次分组、计费假设、缺失的必要配套项和已计价项数。成熟后增加并排的同口径场景。 | 可追溯每笔成本来自哪一条源行、目标 SKU、价格和假设。同币种同账期才能直接比较。跨币种分析需要显式汇率、来源和日期。缺项给出原因并保留部分小计。 |
| **迁移 TCO** | 在目标运行成本稳定后，加迁移服务、一次性搬迁/出网、并行运行、网络、支持、备份和许可。性能型选配单独使用可核对的指标。 | 费用按一次性、经常性和现金流拆开，给出基准期和对比期。阿里云、腾讯云以及通用 OCR 作为后续各自独立决策。 |

以下原则可用于比较报价设计。

- **映射。** 把 CPU 架构、vCPU/RAM、区域、OS/许可、数据库引擎/版本/高可用、盘容量/IOPS/吞吐作为适用的硬条件或复核点。按规格匹配只生成候选。切换目标计费模式后按当前流程重新确认。存储、备份、出网、公网 IP、负载均衡等按实际架构逐项列出必需依赖。
- **核价。** 每个可计价行要能定位到厂商、区域、SKU、币种、用量单位、计划和期限，以及官方 URL、版本/哈希或 API 证据、成功核验时间和有效期。PDF 还应保留页、表和原始单元格。当信息缺失、过期、条款不明或未确认时，保留 Pending 和空金额。仅官方明确为零时记零。
- **计算及交付。** 订阅价格使用独立的官方计划记录。每笔报价固定目录版本，明示来源账期、折扣和舍入口径，分列首期预付与月均摊销。离线交付启用时，版本化 HTML/ZIP 沿用线上计价引擎并保留快照原始有效期。[离线交付规则](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/AGENTS.md)

## 4. 浏览器验收参考矩阵

| 场景 | 证据参考 |
| --- | --- |
| 浏览器与运行方式 | 本地 HTTP、私有托管登录后和离线文件运行各有独立记录，注明实际 SHA、版本、浏览器和执行人。中继超时、登录阻塞或浏览器不支持 `file://` 可分别定位。 |
| 虚构 CSV、XLSX、受支持文字 PDF | 在页面选择文件，核对行数、源计费、规格、件数/容量/用量。留一个未覆盖或无法核实的条目，验证用户可见的 Pending 原因。 |
| 确认、三模式和金额 | 未确认时 Pending。逐次确认按需、包月、包年，核对模式切换后的确认状态、折扣、预付、摊销和小计。用现有虚构基准做独立预期，区分正式公开价格。 |
| 在线核价 | 在浏览器点击刷新。用明确标记的模拟响应稳定覆盖成功、失败及过期状态。另用允许的官方公开核价抽样记录实际返回，校验产品、模式、区域和币种。各通道分别记录。 |
| 双语、下载和重新打开 | 中英切换保留输入，重新加载清空资源清单。等待浏览器真实下载事件，保存 XLSX 并重新打开。逐一核对 Input、Service Mapping、Public Pricing、Quotation、Assumptions，比较页面金额、模式、证据及 Pending 空白。 |
| 离线和有效期（离线版恢复后适用） | 用常规桌面浏览器打开归档 ZIP 解压得到的 HTML，检查导入和下载、核价按钮状态。观察页面请求并在断网条件下复跑主流程。若归档内价格已过期，预期为 Pending。有效价计算另用明确标记的虚构快照验证。 |

项目已有可复用的虚构基准和五表预期。[MVP 费用与验收记录](https://github.com/jh1369/cloud-solution-studio/blob/eed9a72b2cb4bd2da6b518dd6b4ac8c03db456f0/docs/PRICING_MVP_ACCEPTANCE.md#L12)

## 5. 可选工具

| 适用场景 | Skill / 工具 | 用途 |
| --- | --- | --- |
| 浏览器流程 | **Playwright**。可选 [OpenAI 官方 Playwright Skill](https://github.com/openai/skills/tree/main/skills/.curated/playwright) 或 [Microsoft Playwright CLI 自带 Skill](https://playwright.dev/agent-cli/skills) | 两者选其一做首次真实浏览器操作与调试。用文件选择、操作截图、下载事件证明完成。验收路径稳定后，用窄范围 Playwright Test 固化回归，可由 `webServer` 启动本地服务，失败保存 trace。私有托管和实际桌面双击另留证据。 [Web server](https://playwright.dev/docs/test-webserver) · [下载](https://playwright.dev/docs/downloads) · [Trace](https://playwright.dev/docs/trace-viewer-intro) |
| 工作簿核对 | **Spreadsheets / openpyxl**。[openpyxl 文档](https://openpyxl.readthedocs.io/en/stable/tutorial.html) | 环境有 Spreadsheets Skill 时用于抽查表格；用 openpyxl 独立读取浏览器刚下载的 XLSX，核对表名、金额、单位、证据与空值。若将来引入 Excel 公式，再单独验证重算结果，读取缓存值只证明文件中保存了该值。 |
| TCP 价目表解析 | **PDF / pdfplumber**。[pdfplumber 文档及源码](https://github.com/jsvine/pdfplumber) | 环境有 PDF Skill 时用于定位 PDF 页面和视觉比对。沿用本地解析依赖，用虚构的合并、跨页、脚注、明确为零与 `n.a.` 样例 测试。浏览器账单 PDF 与 TCP 官方价目表分别验证。 |
| IaC 估算对照 | **Infracost Agent Skills**。[官方说明](https://www.infracost.io/docs/ai_editor_plugins/ai_skills/) · [源代码](https://github.com/infracost/agent-skills) | `scan` 和 `price-lookup` 适合以后以虚构 Terraform 做 IaC 预估对照。其流程可能需要 Infracost CLI 和账户。Huawei/TCP 正式价格仍走各自官方来源，真实账单不进入外部技能。 |
| 项目流程复用 | **项目自有 `pricing-studio-browser-acceptance`**。[Codex Skills 官方说明](https://learn.chatgpt.com/docs/build-skills) | 可以在 `.agents/skills/pricing-studio-browser-acceptance/SKILL.md` 固化实际跑通的入口、虚构样例、独立预期、证据输出和阻塞判定。仓库通用规则继续由 AGENTS/SECURITY 管理。另一个重复流程可在成熟后提炼为 `tcp-catalog-review`，输出差异和建议，保留人工批准。 |

本轮只比较并记录技能。后续选用时以 Codex 所在环境能否运行浏览器、读写测试下载文件和访问对应受授权入口为准。

## 6. 自动评审的工作方式

GitHub 的 Compare API 支持以两个 commit SHA 比较。CodeRabbit 的公开配置也使用逐次提交增量评审。项目的只读评审从最近一次完成评审的 SHA 汇总增量，向用户提供固定提交链接、问题证据和建议。读取失败与无差异分别记录。[GitHub Compare API](https://docs.github.com/en/rest/commits/commits#compare-two-commits) · [CodeRabbit 公开配置定义](https://github.com/coderabbitai/awesome-coderabbit/blob/main/schema.v2.json) · [Codex 评审规则](https://developers.openai.com/blog/custom-code-review-rules-for-codex)
