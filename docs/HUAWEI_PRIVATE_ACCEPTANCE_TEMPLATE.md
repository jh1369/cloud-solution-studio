# Huawei EU-Dublin 真实清单验收模板

在原私有站选择 Huawei Cloud，使用和上次相同的参考工作簿与计费模式。非标准表可在预览核对字段。五表 Excel 供所有者在本地对账。 [原私有站](https://cloud-solution-pricing-studio.finalgrain8.chatgpt.site/)

1. 首次导入后点击 **导出脱敏回归统计**，选择 **首次导入**。
2. 核对或调整预算假设后，再导出 **方案复核后**，记录本轮调整项目。
3. 反馈时提供这两份统计 JSON，并确认使用了相同参考清单。GitHub 回归记录保存汇总和分析。 [真实回归记录](HUAWEI_REAL_REGRESSION.md)

从 `pricing-studio/web/` 执行以下命令可校验脱敏统计。校验器接受一个统计文件，或按首次导入、方案复核后的顺序接受同一版本的一对文件。

```bash
node scripts/validate_huawei_regression.mjs initial.json reviewed.json
```

## 手工计数模板

按原始行号统计主费用。可选候选以 Service Mapping 的 Candidate Evidence 为准，三个报价状态以 Quotation 为准。关联费用按 Charge 另计。反馈只填版本、计数与原因码。

- Web 版本
- 验收日期
- 计费模式
- 阶段（首次导入／确认目标方案后）

| 服务 | 输入行 | 服务识别 | AWS 官方规格命中 | 有至少一个候选 | 已确认计价 | 条件估算 | Pending | 关联计费 | 包含 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ECS | | | | | | | | | |
| RDS | | | | | | | | | |
| DCS | | | | | | | | | |
| CSS | | | | | | | | | |
| 合计 | | | | | | | | | |

| 独立费用 | 已确认 | 条件估算 | Pending |
| --- | ---: | ---: | ---: |
| RDS 数据盘 | | | |
| RDS 超额备份 | | | |
| CSS 数据存储 | | | |

| 服务 | Pending 原因码 | 数量 |
| --- | --- | ---: |
| | | |

对于包含关联计费或包含项的清单，把它们在各自状态列中分别统计。三个报价状态及关联、包含状态的主费用计数之和应等于输入行数。可在本地抽查来源累计小时、DCS 目标实例小时、独立存储及 Pending 空金额。 [虚构回归与口径](HUAWEI_QUOTE_COVERAGE.md#0314-dev-四类迁移报价复测)
