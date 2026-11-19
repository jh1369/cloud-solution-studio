# Huawei EU-Dublin 真实清单验收模板

在私有站打开 Pricing Studio `0.3.14-dev`，选择 Huawei Cloud，导入工作簿。首次导入记录一组统计，确认同类目标方案后再记一组。非标准表可在预览核对字段。五表 Excel 供所有者在本地对账。 [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

按原始行号统计主费用。可选候选以 Service Mapping 的 Candidate Evidence 为准，三个报价状态以 Quotation 为准。关联费用按 Charge 另计。反馈只填版本、计数与原因码。

- Web 版本
- 验收日期
- 计费模式
- 阶段（首次导入／确认目标方案后）

| 服务 | 输入行 | 服务识别 | AWS 官方规格命中 | 有至少一个候选 | 已确认计价 | 条件估算 | Pending |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ECS | | | | | | | |
| RDS | | | | | | | |
| DCS | | | | | | | |
| CSS | | | | | | | |
| 合计 | | | | | | | |

| 独立费用 | 已确认 | 条件估算 | Pending |
| --- | ---: | ---: | ---: |
| RDS 数据盘 | | | |
| RDS 超额备份 | | | |
| CSS 数据存储 | | | |

| 服务 | Pending 原因码 | 数量 |
| --- | --- | ---: |
| | | |

三个状态的主费用计数之和应等于输入行数。可在本地抽查来源累计小时、DCS 目标实例小时、独立存储及 Pending 空金额。提交评审时发送上述统计即可。 [虚构回归与口径](HUAWEI_QUOTE_COVERAGE.md#0314-dev-四类迁移报价复测)
