# Huawei Cloud Pricing Studio · Pending 原因评审

适用范围为 Web `0.3.13-dev`、EU-Dublin（`eu-west-101`）和 USD。以 PR #19 合入后的代码与随包目录为基线。以下示例使用公开型号和虚构输入，供复现当前阻塞原因。 [评审基线](https://github.com/jh1369/cloud-solution-studio/tree/66aff2b9c4df35f6019abbc48fb9bec76686aa84) · [华为云报价覆盖率](HUAWEI_QUOTE_COVERAGE.md)

## 当前阻塞原因

每行展示当前第一个阻塞原因。补齐字段后，报价引擎会继续校验规格、计费模式、价格证据和用量。因此同一资源可能在复核后出现另一项待确认原因。条件估算已有可用价格和待确认假设，页面和五表 Excel 均单独汇总。Pending 金额留空。 [报价校验顺序](../pricing-studio/web/public/engine.mjs) · [Excel 导出](../pricing-studio/web/public/excel.mjs)

| 服务 | 原因码 | 虚构复现 | 解除阻塞所需证据或决定 |
| --- | --- | --- | --- |
| ECS | `HW_AWS_NO_PLAN` | EC2 `m6g.xlarge`，Linux。已确认来源规格，目标目录缺同架构、同核数、同内存及同 OS 的方案。 | 核验 EU-Dublin 对应 SKU 及目标计费方式。若评估替代配置，需确认软件架构、许可和性能兼容性。 |
| ECS | `HW_AWS_PROFILE_ARCH` | EC2 `c3.large`，Linux。现有来源记录含 CPU 和内存，架构证据不完整。 | 补充能证明该型号架构的 AWS 官方规格，并更新来源规格记录。 |
| ECS | `HW_MULTIPLE` | EC2 `c5.4xlarge`，Linux。存在多个满足已知条件的 Huawei 候选。 | 比较候选系列及性能需求，由用户确认目标 SKU，选中后重新校验。 |
| ECS | `HW_AWS_OS_REVIEW` | EC2 `c6i.xlarge`，来源操作编码 `RunInstances:unknown`。 | 核对 AWS 平台操作字段或来源清单，确认 OS 和许可。 [AWS 平台操作编码](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/billing-info-fields.html) |
| RDS | `HW_DB_PARAMETERS` | RDS `db.t3.micro`，只有实例型号。 | 确认数据库引擎、版本、实例规格和部署模式。继续核对 Cloud SSD 与实例费范围。当前数据盘和超额备份仍需要独立计价。 |
| RDS／导入 | `HW_IMPORT_REVIEW` | RDS 清单数量列填入 `1.5`，且无可确认的计量语义。 | 对照原始单元格确认是资源数量、累计实例小时还是其他用量。订阅台数应独立确认。 |
| DCS | `HW_CACHE_ENGINE` | ElastiCache `cache.m6g.large`，只有节点型号。 | 先核实是否为受支持的 Redis 引擎，再提供实际缓存容量和单机、主备或集群拓扑。适用时核验版本、分片和副本。来源节点内存与目标缓存容量分别核对。 [华为云 DCS 规格](https://support.huaweicloud.com/eu/productdesc-dcs/dcs-pd-0522002.html) |
| CSS | `HW_NO_PLAN` | OpenSearch `m7g.large.search`。来源型号可以识别，现有目录在三个计费模式均无 CSS 计划。 | 核验欧站公开产品规格、SKU 和费率，明确节点、存储等费用项的计量规则。 |

ECS 精确候选按来源 CPU、内存、架构和操作系统筛选。旧代型号的架构证据缺口、多个候选的选型问题、目标目录缺计划，分别由不同检查返回。规格和计费方式通过后，过期价格证据会返回 `PRICE_EXPIRED`，刷新后仍按原规格和计费方式校验。目录缺口只反映本项目的核验覆盖。 [AWS 来源规格](../pricing-studio/web/public/aws-specs.mjs) · [Huawei 规格匹配](../pricing-studio/web/public/huawei-match.mjs) · [随包目录](../pricing-studio/web/public/catalog.json)

## 供评审讨论

1. **来源字段如何确认。** RDS 引擎、版本和部署方式以及 DCS 引擎、容量和拓扑，适合在导入预览里逐项显示原始单元格及建议值。可用虚构账期表比较补齐前后的原因码，并核对原始小时和资源数量各自保留。 [导入校验](../pricing-studio/web/public/inventory-import.mjs)
2. **ECS 候选如何收敛。** 对已有候选，可比较系列、性能约束和兼容性，再由用户选型。对缺候选的配置，新增覆盖以 EU-Dublin、USD、目标计费模式和有效公开费率为验收依据。超出已核验范围的替代方案需保留待确认状态。 [Huawei 欧站公开计算器](https://www.huaweicloud.com/eu/pricing/calculator.html)
3. **目录缺口从哪项费用切入。** CSS 可先评估节点实例费的公开证据，再单列存储。RDS 数据盘和超额备份、ELB LCU、OBS 等独立费用已有单独的公开覆盖记录。适用的验收口径是已报价费用能独立对账，缺证据的分项仍可单独展示。 [Huawei 报价覆盖率与费用优先级](HUAWEI_QUOTE_COVERAGE.md#后续优先级)

## 验证记录

在 `pricing-studio/web/` 使用 Node 24.22.1 和随包目录逐项复核上述八个虚构示例，价格校验时点取目录最后核验时间后 60 秒，以便独立复现原因码。另执行 `node --test tests/aws-ai-inventory.test.mjs tests/huawei-import.test.mjs`，26 项通过，0 项失败。 [AWS 智能导入用例](../pricing-studio/web/tests/aws-ai-inventory.test.mjs) · [Huawei 导入与匹配用例](../pricing-studio/web/tests/huawei-import.test.mjs)
