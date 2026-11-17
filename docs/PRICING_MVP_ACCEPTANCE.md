# Pricing Studio V0.2 MVP 验收记录

2026-11-17，Europe/Berlin；`main` / `d1375e0` 之上的本地未提交修改，包版本 `0.2.0-dev`。Web + Worker 架构保持不变。使用公开目录及虚构数据，未部署、未 Push。

## 结论与证据边界

- 自动回归：`pricing-studio/web/` 运行 `npm test`，72 项 JavaScript + 4 项 Python 目录适配测试通过，0 失败。原 Python CLI 未修改，未重跑其历史测试。
- 真实浏览器 E2E：**阻塞，未通过验收**。CUA 可用，但本地预览中继无法返回可打开的 URL。没有实际执行浏览器文件选择、确认、切换、刷新或下载，不能以模块测试替代。
- 官方公开 API：真实打包 Worker 调用 `/api/rates`，ECS/EVS/RDS × 三模式共 9 个计划，HTTP 200，9 个通过证据校验，0 Pending；与现有快照一致。另以 Python 直接调用官方接口独立核对相同 9 个计划，全部一致。这不是浏览器按钮测试。
- Excel：实际序列化/重新读取三个虚构报价工作簿，每本五个 Sheet 均检查；另以 Python 3.12 / openpyxl 独立读取三个文件并检查金额、预付、Pending 空白和无公式，3/3 通过。页面比对对象是纯展示模型 `summaryModel`，不是浏览器 DOM。

## 自动化测试数据与预期

输入：`web/tests/fixtures/aws-fictional-mvp.csv`（路径相对 `pricing-studio/`）：EC2 `m6i.2xlarge Linux` 2 台 × 每台 730 小时；EBS gp3 1 盘 × 500 GB-month；MySQL RDS `db.m5.large` 1 台 × 730 小时；S3 100 GB-month 为未覆盖项。

财务测试使用 `synthetic-catalog.mjs` 中明确标识的**虚构价格**，不得用于真实报价；公开接口核价使用真实公开目录，二者分开。

| 目标模式 | 未折扣月费/月均 USD | 15% 折扣后月费/月均 | 年度情景 | 首期预付小计 |
| --- | ---: | ---: | ---: | ---: |
| 按需 | 365.00 | 310.25 | 3723.00 | 空白（无预付） |
| 包月 | 210.00 | 178.50 | 2142.00 | 178.50 |
| 包年 | 157.50 | 133.88 | 1606.50 | 1606.50 |

三种模式均只有 3/4 项可计价，S3 保持 Pending；页面模型明确提示部分小计。五个 Sheet 检查：Input 保留源 reserved/目标模式、台数及用量；Service Mapping 保留确认及复核点；Public Pricing 独立单位/证据/缺价空白；Quotation 核对折扣、年度、摊销和预付；Assumptions 核对分组小计和排除项。混合账期不加入月度小计，累计用量不再乘资源数量，来源账期不外推全年。

舍入：各行 HALF_UP 到分，小计累加行金额；包年按年度合同金额除以 12 并逐行舍入，因此包年月均 × 12 不一定等于年度合同额。按需/包月年度情景对未舍入月度计算 × 12 后再舍入；这是费用估算口径，非账单承诺。

## 官方核价抽样（USD，eu-west-101）

官方来源：`https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource`。本次核查时间约 16:00 CET，未覆盖全部目录。

| 服务 / SKU | 按需单位价 | 独立包月价 | 独立包年价 |
| --- | ---: | ---: | ---: |
| ECS / s6.2xlarge.4.linux | 0.3048 / hour | 160.20 / month | 1602.00 / year |
| EVS / GPSSD | 0.000143 / GB-hour | 0.10 / GB-month | 1.04 / GB-year |
| RDS / rds.mysql.n1.large.4 | 0.137 / hour | 81.03 / month | 810.35 / year |

按需请求 `chargingMode=1`、1 小时；包月/年独立请求 `chargingMode=0`、`periodType=2/3`、`periodNum=1`；EVS 单次为 1 GB。记录仅为所选公开计价项，不构成跨云等价性或完整架构报价保证。没有改写正式 `public/catalog.json`；本次响应摘要留在被忽略的 `web/outputs/acceptance/`。

## 发现的问题、修复及复现

| 问题 | 复现方式 | 结果 |
| --- | --- | --- |
| 按需数量可为 0 / 0.5 | 已确认资源填入零或小数数量 | 已修复：Pending / QUANTITY_INVALID |
| 未知 EBS 存储也推荐 GPSSD | 导入 io2/st1/sc1/unknown | 已修复：无自动候选，人工选择/确认 |
| 金额小计浮点尾差 | 汇总 0.10 与 0.20 | 已修复：页面/导出均为精确 0.30 |
| 过期价格仍出现“官方验证”字样 | 将夹具时间设为 2000 年 | 已修复：页面/目录/导出 Pending、金额空白 |
| 价格模式/证据污染 | 错周期、币种、单位、产品、重复响应 ID、未来/过期时间 | 自动回归拒绝计价，不借用按需价 |
| 旧 UI 测试失败 | 初始 `npm test` | 基线 61/62；旧 V0.1.1 标记断言已改为现有双语/模式与模块行为断言 |
| Node 官方请求不走环境代理 | 本环境不带 `NODE_USE_ENV_PROXY=1` 调用 Worker | 初测 502；Node 24 启用已有代理支持后 200 / 9 个有效，TLS 保持开启；非生产 Worker 缺陷 |
| 本地预览中继 | 执行下列命令 | **仍阻塞**：relay 等待 4173 readiness 超时；status 为 stopped，无预览 URL |

```bash
cd /workspace/repos/cloud-solution-studio/pricing-studio/web
sites-preview start /workspace/repos/cloud-solution-studio/pricing-studio/web
sites-preview status
```

## 待完成的真实浏览器验收

预览恢复后，打开 CLI 返回的准确 URL；依次导入虚构 CSV 和对应 XLSX，检查 4 行和源计费；未确认时全部 Pending；确认 ECS/EVS/RDS 后核对部分小计。分别切换三种目标模式，确认切换会清除勾选，核对容量、独立价格和预付/摊销；点击刷新，检查结果及离线/失败提示；设置 15% 折扣；切换中英文确认输入不丢失；实际下载 Excel 并核对五个 Sheet 与屏幕金额。重新加载应清空报价，只保留语言偏好。当前这些 UI 步骤尚无通过证据。

P1 后续：RDS 架构/版本/主备及附属存储计价仍需人工复核；gp2/gp3→GPSSD 仅是方案建议，性能不保证等价。OBS/流量/备份等未覆盖价格继续 Pending，不增加无关 MVP 功能。优先解除浏览器验收阻塞，再决定是否进入下一轮报价覆盖。
