# Huawei Cloud Pricing Studio 自动报价覆盖率

## 基线与口径

评审对象为 `main` 的 `563a453e7629daa7fdfbaf963d568fc17daeda08`，Web 版本 `0.3.8-dev`。GitHub 确认规格匹配、EVS/DCS 修复和智能导入相关的 PR #13 与 #14 已合入。本报告以仓库中的在线报价路径为准。[评审基线](https://github.com/jh1369/cloud-solution-studio/tree/563a453e7629daa7fdfbaf963d568fc17daeda08) · [PR #13](https://github.com/jh1369/cloud-solution-studio/pull/13) · [PR #14](https://github.com/jh1369/cloud-solution-studio/pull/14)

基准价格来自随包目录 `public/catalog.json`。区域为 EU-Dublin（`eu-west-101`），币种为 USD，目录核验于 2026-11-17，单条价格有效期为 7 天。2026-11-19 09:41（Europe/Berlin）运行 `priceValidation`，1,241 条均通过地区、币种、单位、期限、产品身份和时间校验。该目录的 SHA-256 为 `dfdd1b85f9a0c8bc477ede7cd94f4c801565c35be0b254d6c6e5eef390cfd15d`。后续的查价须使用各自的核验时点与有效期。[随包目录](https://github.com/jh1369/cloud-solution-studio/blob/563a453e7629daa7fdfbaf963d568fc17daeda08/pricing-studio/web/public/catalog.json) · [价格校验](../pricing-studio/web/public/engine.mjs)

价格记录按模式计数。同一 SKU 在不同模式下有各自独立的价格计划。构建器从欧站公开计算器读取候选，以独立询价的 `officialWebsiteAmount` 及请求、响应证据生成快照。当前能够定价的单位为实例时长或带容量的时长与订阅期限。按需 EVS 支持 GB-hour 及按明确参考月时数换算的 GB-month。包月、包年采用各自的合同费率，包年月均为摊销。流量、请求、LCU、阶梯和多费用项需要各自的计费契约。[目录构建](../pricing-studio/web/scripts/build_catalog.py) · [在线询价](../pricing-studio/web/worker.mjs) · [华为云按需询价说明](https://support.huaweicloud.com/eu/api-oce/bcloud_01001.html) · [华为云包年包月询价说明](https://support.huaweicloud.com/eu/api-oce/bcloud_01002.html)

## 服务覆盖矩阵

“已支持”指表中限定费用项可自动匹配并按所列模式计价。“部分支持”包括人工选型、仅有部分计费模式或仅有实例费。“未支持”指当前费用项没有可用报价结果，即使服务已自动识别。目录记录数列的顺序为**按需 / 包月 / 包年**。自动匹配仍要求规格、区域、计费模式和报价输入通过校验。

| 服务和费用项 | 自动服务映射示例 | 自动 SKU 与计价 | 有效记录 | 仍需覆盖 |
| --- | --- | --- | --- | --- |
| ECS 云主机实例 | EC2、ECS、云主机 | **已支持**。核数、内存、架构、OS、规格族或明确系列满足条件时，支持三种模式。 | 44 / 44 / 44 | 系统盘、数据盘及 EIP 带宽需独立核价。特殊许可和未覆盖系列待确认。 |
| EVS 容量 | EBS、EVS、云盘 | **已支持**。GPSSD、ESSD、高 I/O 和超高 I/O 的已核验容量价可自动匹配，支持三种模式。 | 4 / 4 / 4 | IOPS、吞吐量约束、独立性能收费和快照缺少项目侧模型。 |
| RDS 实例 | RDS、数据库、MySQL 等 | **部分支持**。引擎、版本、CPU、内存、拓扑及 Cloud SSD 实例费用范围明确时可自动匹配，支持三种模式。 | 154 / 154 / 154 | 目录只保留 `rds.vm`。数据盘、超额备份、代理和许可等费用单独核价。 |
| DCS Redis | Redis、ElastiCache、DCS | **部分支持**。已覆盖的 Redis 容量和拓扑支持三种模式。拓扑未给出且单机 SKU 唯一时显示估算假设。 | 225 / 180 / 180 | 版本、其他引擎、分片和未明确的主备或集群拓扑待确认。订阅 SKU 与按需集合有差异。 |
| ELB 专享负载均衡 | Elastic Load Balancing、ELB、负载均衡 | **部分支持**。可确认手选 `elbv3.professional` 的按需实例费。 | 1 / 0 / 0 | 实例费缺自动选型，LCU、EIP 及带宽缺可用计价。 |
| EIP 与公网带宽 | VPC 或 Data Transfer 可粗分到 VPC / EIP | **未支持**。单写 Elastic IP 的基准行仍未映射。 | 0 / 0 / 0 | EIP 与网络用量分类、地址保留费、按带宽与按出流量的独立规则。 |
| NAT 私网网关 | NAT Gateway、私网 NAT | **部分支持**。按需可自动匹配明确规格的实例费。 | 4 / 0 / 0 | 当前目录缺私网包月、包年价格计划。 |
| NAT 公网网关 | NAT Gateway | **部分支持**。包月、包年的公网 SKU 可显式手选。 | 0 / 4 / 4 | 当前目录缺公网按需价格，自动匹配规则仅覆盖私网。公网 EIP 和带宽需独立核价。 |
| OBS 对象存储 | S3、OBS、对象存储 | **未支持**。存在服务映射。 | 0 / 0 / 0 | 存储类别、AZ、请求、出流量、取回和资源包都缺当前报价契约。 |
| CCE 管理与 Autopilot | Kubernetes、EKS | **部分支持**。目录有 CCE 集群和 Autopilot 相关计划，可确认手选已验证的简单费用项。 | 9 / 14 / 14 | 自动规格匹配及集群节点、存储、网络关联费用未覆盖。 |
| **合计** | | | **441 / 400 / 400** | |

除上述目录服务外，现有服务族规则还可识别 DMS Kafka、CES / LTS、CFW、DEW、DDS、HSS、SecMaster、Config、WAF、SWR、SFS、CBR、SMN、FunctionGraph、DLI / DataArts，以及归入人工设计的邮件和队列服务。这些服务族在本地区快照内均无可用的报价计划。映射使用具体别名与规则，输入名称和细分费用类型仍影响结果。[服务族映射](../pricing-studio/web/public/engine.mjs) · [自动规格规则](../pricing-studio/web/public/huawei-match.mjs)

## 虚构混合清单实测

32 行标准 CSV 包含不同费用项、目标计费模式和输入完整度。本次采用 730 参考小时和零折扣，基准结果只统计自动选型。现有流程从浏览器的标准导入、规格匹配和计算进入五表导出。Node 24.22.1 另以相同 CSV、目录、时点复核每行结果。样本为覆盖边界而设计，行数及比例仅衡量这组样本。

| 指标 | 结果 | 计数口径 |
| --- | --- | --- |
| 自动识别率 | **31 / 32（96.9%）** | 返回已知服务族。第 24 行含 VPC / EIP 粗分类，精确到目标服务的行数为 30 / 32。 |
| 自动 SKU 匹配率 | **13 / 32（40.6%）** | 现有规则已选中匹配 SKU。第 20 行缺数量，仍保有匹配结果。 |
| 成功计价率 | **12 / 32（37.5%）** | 费用有效并进入部分小计。原则上包含有效的来源账期报价，本样本均为月参考或独立合同。 |
| Pending | **20 / 32（62.5%）** | 报价金额留空。 |

| 目标模式 | 行数 | 已识别 | 已自动匹配 SKU | 已计价 | Pending |
| --- | --- | --- | --- | --- | --- |
| 按需 | 23 | 22 | 6 | 5 | 18 |
| 包月 | 5 | 5 | 3 | 3 | 2 |
| 包年 | 4 | 4 | 4 | 4 | 0 |

浏览器部分月均小计为 **USD 801.70**，首期预付小计为 **USD 2,148.18**。Chromium 156.0.8078.79 实际下载了 XLSX，openpyxl 3.1.5 重开并复核 32 行、五张表、SKU、计费模式、价格证据和 20 行 Pending 空值。测试读取了与基线字节一致的 11 个页面资源，使用随包有效价格。浏览器没有产生模型调用或实时询价请求。

补充对照使用两个虚构的单工作表 AWS 样式 XLSX。两份都有服务、规格、数量、用量、单位、资源标识和来源成本列，分别以公式和数值填写来源成本，并更换虚构标识。每份有 4 行，ECS 和 EVS 两行计价，缺数量的 Redis 及 OBS 两行 Pending。浏览器下载后重开，两份的目标 SKU、Pending 行和 USD 127.95 小计一致。该对照独立于 32 行基准。

<details>
<summary>32 行虚构基准 CSV</summary>

```csv
case_id,product,specification,quantity,usage,unit,huawei_billing_mode,huawei_target_region
01,EC2,m6i.xlarge Linux x86,1,730,hour,ONDEMAND,
02,ECS,4 vCPU / 16 GiB Linux x86 General Computing,1,,,MONTHLY,
03,ECS,4 vCPU / 16 GiB Linux x86 General Computing,1,,,YEARLY,
04,ECS,4 vCPU / 16 GiB Linux x86 General Computing-plus,1,730,hour,ONDEMAND,
05,ECS,4 vCPU / 16 GiB Linux x86 General Computing,1,730,hour,ONDEMAND,ap-southeast-1
06,EBS,gp3 100 GiB,2,80,GB-month,ONDEMAND,
07,EVS,ESSD 200 GiB,1,,,MONTHLY,
08,EVS,High I/O 100 GiB,1,,,YEARLY,
09,EVS,200 GB SSD with separately provisioned IOPS,1,5000,IOPS-month,ONDEMAND,
10,EVS,Snapshot retention 100 GiB assessed separately,1,100,GB-month,ONDEMAND,
11,RDS,db.m5.large MySQL 8.0 Single-AZ Cloud SSD instance only,1,730,hour,ONDEMAND,
12,RDS,db.m5.large MySQL 8.0 Single-AZ Cloud SSD instance only,1,,,YEARLY,
13,RDS,MySQL 8.0 Single-AZ Extreme SSD database storage only,1,250,GB-month,ONDEMAND,
14,RDS,MySQL 8.0 backup only above the included allowance,1,80,GB-month,ONDEMAND,
15,RDS,db.m5.large MySQL 8.0 Cloud SSD instance only,1,730,hour,ONDEMAND,
16,Redis,2 GB,1,730,hour,ONDEMAND,
17,DCS,Redis 4 GB 主备 2节点,1,,,MONTHLY,
18,DCS,Redis 2 GB single node,1,,,YEARLY,
19,DCS,Redis 2 GB 主备,1,730,hour,ONDEMAND,
20,Redis,2 GB,,730,hour,ONDEMAND,
21,Elastic Load Balancing,Dedicated ELB elbv3.professional instance only,1,730,hour,ONDEMAND,
22,ELB,Dedicated ELB flexible L4 capacity unit charge,1,120,LCU-hour,ONDEMAND,
23,ELB,Dedicated ELB elbv3.professional instance only,1,,,MONTHLY,
24,Virtual Private Cloud,Elastic IP dedicated bandwidth fixed 10 Mbit/s,1,10,Mbit/s,ONDEMAND,
25,Elastic IP,EIP dedicated outbound traffic,1,120,GB,ONDEMAND,
26,NAT Gateway,Private NAT Gateway small instance only,1,730,hour,ONDEMAND,
27,NAT Gateway,Public NAT Gateway natgateway_small instance only,1,730,hour,ONDEMAND,
28,NAT Gateway,Public NAT Gateway natgateway_small instance only,1,,,MONTHLY,
29,S3,OBS Standard single-AZ storage,1,500,GB-month,ONDEMAND,
30,OBS,OBS Standard single-AZ GET requests,1,10000,requests,ONDEMAND,
31,OBS,OBS Standard single-AZ internet outbound traffic,1,80,GB,ONDEMAND,
32,Kubernetes,CCE cce.s1.small cluster management only,1,730,hour,ONDEMAND,
```

</details>

### Pending 原因与缺口

| 报价引擎原因 | 行数 | 样例编号和触发项 |
| --- | --- | --- |
| `HW_MULTIPLE` | 2 | 04 ECS 多个增强型候选，19 Redis 主备节点数待确认。 |
| `HW_TARGET_REGION` | 1 | 05 明确要求的区域超出当前范围。 |
| `HW_DISK_PERFORMANCE` | 2 | 09 独立 IOPS，10 快照费用。 |
| `HW_DB_PARAMETERS` | 3 | 13 数据盘、14 超额备份超出实例匹配规则。15 实例拓扑缺失。 |
| `QUANTITY_REQUIRED` | 1 | 20 Redis 已匹配单机 SKU，数量缺失。 |
| `HW_MANUAL_SERVICE` | 3 | 21 ELB 实例费、22 LCU、32 CCE 集群费。 |
| `HW_NO_PLAN` | 6 | 23 ELB 包月，24/25 EIP，29–31 OBS。 |
| `HW_NAT_PARAMETERS` | 2 | 27/28 两种模式的公网 NAT。 |

- **架构或输入复核共 4 行**（04、15、19、20）。补齐规格系列、部署方式、节点数或资源数量即可重新评估。保留现有确认要求可避免误选。
- **现有能力缺口共 16 行**。其中 3 行有对应价格且仅需自动选型（21、28、32），3 行缺目标模式或区域的计划（05、23、27），10 行缺独立收费或拆项规则且缺项目可用的对应价格（09、10、13、14、22、24、25、29–31）。第 25 行还有精确服务识别缺口，已计入这 10 行。
- **目录价格缺口共 13 行，计费规则缺口共 10 行**。后者与前者重叠 10 行。价格缺口指项目内缺少适用于该行的已验证计划。它可能源于目录过滤、币种/区域范围或单位契约，无法据此判断华为云是否提供该商品或收费项。
- **人工选型对照**使用明确写在虚构输入里的 `elbv3.professional`、`natgateway_small` 和 `cce.s1.small`，独立确认后各得到 USD 18.25、57.30 和 102.20 的月度金额。对照结果单独记录，基准仍为 12 行自动计价。

## 后续优先级

下列收益为同一 32 行基准可增加计价的行数上限。2026-11-19 的欧站 `productInfo` 结果用作候选发现证据。每项的适用地区、计费单位、费率和期限仍需独立询价验证。互相独立的场景可用各自的增量衡量，金额未在本轮估算。

### 1. RDS 数据盘和超额备份

**范围和缺口**以 MySQL 8.0、明确部署形态和盘型的数据盘为首个费用项，并纳入可单独核验的超额备份。现有 RDS 快照只有实例价。欧站计算器的原始目录能发现 `rds_rds.volume` 的按需和订阅候选及 `rds_rds.obs` 的按需备份候选。华为计费说明将实例、数据库存储和超额备份分开，存储与所关联实例的计费模式一致。[欧站 RDS 原始目录][rds-catalog] · [RDS 计费构成][rds-billing] · [按需备份][rds-od] · [订阅说明][rds-term]

**模块边界**涉及 `scripts/build_catalog.py` 和 `worker.mjs` 的费用项身份及单位证据，`huawei-match.mjs` 的盘型与实例关联，`engine.mjs` 的存储和超额用量公式，以及 `ui.mjs` 和 `excel.mjs` 的费用分项与缺项展示。

**预计收益与验收**覆盖样例 13、14，最多增加 2 / 32 行（6.25 个百分点）。同一虚构实例的实例费、数据盘和备份用量分别可追溯，独立按需和订阅询价按证据对账。已知备份用量在适用免费额度内时金额为零，超出部分独立计价。缺少额度、实例关联或用量证据时，对应费用留空，其余已核实费用保留。

### 2. 专享 ELB 与关联 EIP 计费

**范围和缺口**包括可明确自动匹配的 ELB 基础实例费、具有明确层级和用量的 LCU，以及专用 EIP 的带宽或出网计费。现有 ELB 基础费可手选，EIP 仍缺精确服务映射。欧站计算器提供 ELB 实例时长、L4/L7 LCU，以及独立的 `vpc_ip` 和 `vpc_bandwidth` 候选。EIP 的带宽、出向流量和闲置保留费用各有计费条件。[欧站 ELB 原始目录][elb-catalog] · [ELB 计费模式][elb-billing] · [欧站 EIP 原始目录][eip-catalog] · [EIP 计费项][eip-billing]

**模块边界**涉及 `engine.mjs` 的 EIP 服务映射和分项计费、`huawei-match.mjs` 的明确 ELB 规格判别、`scripts/build_catalog.py` 与 `worker.mjs` 的时长/LCU/流量等单位及证据校验，以及 `ui.mjs` 和 `excel.mjs` 的关联费用。

**预计收益与验收**样例 21 已有有效基础费，自动选型可增加 1 行。经独立核价的 LCU、专用带宽和按出流量可再覆盖 22、24、25，合计上限为 4 / 32 行（12.5 个百分点）。纯内网实例、声明公网绑定，以及同一 EIP 单独列出的场景有独立合计，带宽与出流量按对应模式核算，关联费用只计一次。当前样例 23 的包月计划缺口保留。

### 3. OBS 标准单 AZ 按需计费

**范围和缺口**限标准单 AZ 存储、GET 请求和公网出流量，S3 到 OBS 的服务映射已有。欧站计算器可发现存储、GET 和外网下载的候选。请求计量、存储时段、流量方向及适用阶梯分别影响报价。订阅资源包属于独立费用方案。[欧站 OBS 原始目录][obs-catalog] · [OBS 计费概览][obs-billing] · [请求][obs-requests] · [流量][obs-traffic]

**模块边界**涉及 `scripts/build_catalog.py` 与 `worker.mjs` 的目录纳入和官方询价证据，`huawei-match.mjs` 的存储类别和 AZ 规则，`engine.mjs` 的用量单位与数量级，以及 `ui.mjs` 和 `excel.mjs` 的分项金额。

**预计收益与验收**覆盖 29–31，最多增加 3 / 32 行（9.375 个百分点）。存储的测量时段、GET 计费单位和公网出流量分别对照官方费率。跨阈值、缺失用量以及外网与内网流量的分项结果可追溯。未核实阶梯的费用保留 Pending。

**EVS 性能覆盖的依据** 欧站 EVS 原始目录本次仅返回四种容量计价盘型。磁盘性能文档给出 IOPS 和吞吐上限，当前公开候选尚未确认样例 09 的独立性能费率或样例 10 的快照收费。性能要求到已有盘型的规则校验，以及独立收费项的来源确认，分别影响这两类样例的可报价范围。RDS、ELB/EIP 和 OBS 当前已有更明确的官方候选和可验证收益。[欧站 EVS 原始目录][evs-catalog] · [EVS 类型与性能][evs-performance]

[rds-catalog]: https://portal.eu.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo?urlPath=rds&region=eu-west-101&language=en-us&station=en-EU&tag=general.online.portal
[rds-billing]: https://support.huaweicloud.com/eu/productdesc-rds/rds_01_0030.html
[rds-od]: https://support.huaweicloud.com/eu/price-rds/rds_00_0005.html
[rds-term]: https://support.huaweicloud.com/eu/price-rds/rds_00_0004.html
[elb-catalog]: https://portal.eu.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo?urlPath=elb&region=eu-west-101&language=en-us&station=en-EU&tag=general.online.portal
[elb-billing]: https://support.huaweicloud.com/eu/price-elb/elb_billing_0102.html
[eip-catalog]: https://portal.eu.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo?urlPath=eip&region=eu-west-101&language=en-us&station=en-EU&tag=general.online.portal
[eip-billing]: https://support.huaweicloud.com/eu/price-eip/eip_billing_0011.html
[obs-catalog]: https://portal.eu.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo?urlPath=obs&region=eu-west-101&language=en-us&station=en-EU&tag=general.online.portal
[obs-billing]: https://support.huaweicloud.com/eu/price-obs/obs_42_0001.html
[obs-requests]: https://support.huaweicloud.com/eu/price-obs/obs_42_0004.html
[obs-traffic]: https://support.huaweicloud.com/eu/price-obs/obs_42_0005.html
[evs-catalog]: https://portal.eu.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo?urlPath=evs&region=eu-west-101&language=en-us&station=en-EU&tag=general.online.portal
[evs-performance]: https://support.huaweicloud.com/eu/productdesc-evs/en-us_topic_0014580744.html
