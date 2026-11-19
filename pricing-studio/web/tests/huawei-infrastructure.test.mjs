import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import worker from '../dist/server/index.js';
import {calculate,normalizeRows,parseText,priceValidation,sumMoney} from '../public/engine.mjs';
import {applyHuaweiMatch,identifyHuaweiRow,selectHuaweiBilling} from '../public/huawei-match.mjs';
import {buildWorkbook} from '../public/excel.mjs';
import {summaryModel} from '../public/ui.mjs';

const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url)));
const now=Math.max(...catalog.items.map(plan=>Date.parse(plan.verifiedAt)))+600000;
const options={now};
const select=(row,source=catalog)=>applyHuaweiMatch(identifyHuaweiRow(row),source,options);
const raw=(product,specification,fields={},source=catalog)=>select(normalizeRows([{product,specification,quantity:1,...fields}])[0],source);
const calc=(row,source=catalog,time=now)=>calculate(row,source,{now:time});
const vm={};
runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),vm);
const XLSX=vm.XLSX;

test('ELB links only the dedicated elastic instance meter, keeps ancillary-only lines Pending and verifies L4/L7 limits',()=>{
 const base=raw('Elastic Load Balancing','Dedicated ELB instance only');
 const result=calc(base);
 assert.deepEqual([result.item?.sku,result.monthly,base.huaweiCharge,base.huaweiPendingCharges],['elbv3.professional',18.25,'elbInstance',[]]);
 assert.deepEqual(base.huaweiAssumptions,['HW_ELB_ELASTIC_BASE']);
 const l7=raw('ALB','Dedicated flexible application load balancer 80,000 QPS instance only');
 assert.equal(calc(l7).status,'Valid');
 assert.equal(l7.huaweiProductMatch.selected.layer,'L7');
 const l4=raw('NLB','Dedicated elastic specs TCP load balancer 120,000 CPS instance only');
 assert.equal(calc(l4).status,'Valid');
 assert.equal(raw('ELB','Dedicated elastic specs TCP load balancer 50,000 QPS instance only').huaweiMatch,'HW_ELB_PERFORMANCE');
 assert.equal(raw('ELB','Dedicated flexible L7 170,000 QPS instance only').huaweiMatch,'HW_ELB_PERFORMANCE');
 assert.equal(raw('ELB','Dedicated fixed ELB instance only').huaweiMatch,'HW_ELB_NO_MATCH');
 assert.equal(raw('ELB','Dedicated ELB fixed 20000 concurrent connections instance only').huaweiMatch,'HW_ELB_NO_MATCH');
 assert.equal(raw('ELB','Dedicated ELB').huaweiMatch,'HW_ELB_PARAMETERS');
 assert.equal(raw('ELB','Dedicated ELB instance only',{huawei_billing_mode:'MONTHLY'}).huaweiMatch,'HW_SPEC_PRICE_LINK');
 const lcu=raw('ELB','Dedicated flexible L4 capacity unit charge',{unit:'LCU-hour',usage:12});
 assert.deepEqual([lcu.huaweiCharge,calc(lcu).status,calc(lcu).monthly],['lcu','Pending',null]);
 assert.equal(raw('ELB','Dedicated flexible L4 LCU').huaweiMatch,'HW_ANCILLARY_PENDING');
 const instance=result.item;
 const other={...instance,id:'synthetic-non-instance-meter',usageFactor:'l4_lcu_duration',
  evidence:{...instance.evidence,request:{...instance.evidence.request,usageFactor:'l4_lcu_duration'}}};
 const source={...catalog,items:[instance,other]};
 assert.equal(calc(raw('ELB','Dedicated ELB instance only',{},source),source).item?.id,instance.id);
 const mismatched={...catalog,items:[{...other,usageFactor:'instance_duration'}]};
 assert.equal(raw('ELB','Dedicated ELB instance only',{},mismatched).huaweiMatch,'HW_SPEC_PRICE_LINK');
});

test('Kubernetes sizing uses documented master count and worker capacity and keeps package purchases separate',()=>{
 const cluster=raw('Kubernetes','3 master nodes, 120 worker nodes, cluster management only');
 assert.deepEqual([cluster.service,calc(cluster).item?.sku,cluster.huaweiPendingCharges],['CCE','cce.s2.medium',[]]);
 assert.deepEqual(cluster.huaweiAssumptions,['HW_CCE_STANDARD','HW_CCE_MINIMUM_TIER']);
 const ambiguous=raw('EKS','50 worker nodes, cluster management only');
 assert.equal(calc(ambiguous).reasonCode,'HW_CCE_CONTROL_PLANE');
 assert.ok(ambiguous.huaweiCandidates.includes('cce.s1.small')&&ambiguous.huaweiCandidates.includes('cce.s2.small'));
 assert.equal(raw('CCE Standard','HA cluster management only').huaweiMatch,'HW_CCE_SCALE');
 assert.equal(raw('CCE','single master, 400 worker nodes, cluster management only').huaweiMatch,'HW_CCE_NO_MATCH');
 assert.equal(raw('CCE','HA, 20 or 200 worker nodes, cluster management only').huaweiMatch,'HW_CCE_NO_MATCH');
 assert.equal(raw('CCE','cce.s2.invalid HA, 30 worker nodes, cluster management only').huaweiMatch,'HW_CCE_NO_MATCH');
 assert.equal(raw('CCE Turbo','3 masters, 50 worker nodes').huaweiMatch,'HW_CCE_NO_MATCH');
 const workerCost=raw('Kubernetes','ECS worker nodes only, 1 worker node');
 assert.deepEqual([workerCost.huaweiCharge,calc(workerCost).reasonCode],['workers','HW_ANCILLARY_PENDING']);
 const pilot=raw('CCE','Autopilot cluster management only');
 assert.equal(calc(pilot).item?.sku,'cce.autopilot.cluster');
 const pack=raw('CCE','Autopilot general computing 1000 GB-hours resource package only',{huawei_billing_mode:'MONTHLY'});
 assert.deepEqual([calc(pack).item?.sku,calc(pack).termPublic,pack.huaweiCharge],['autopilot.default.mem.1000GB-hour.monthly',3.59,'ccePackage']);
 const text=select(parseText('1套CCE Standard，3 master nodes，50 worker nodes，ECS 和 EVS')[0]);
 assert.equal(calc(text).item?.sku,'cce.s2.small');
 assert.equal(calc(text).quantity,1);
});

test('public NAT uses exact billed days independently of hourly private NAT and of contract prices',()=>{
 const publicNat=raw('Public NAT Gateway','Small instance only',{unit:'day',usage:30});
 assert.deepEqual([calc(publicNat).item?.sku,calc(publicNat).termPublic],['natgateway_small',73.14]);
 assert.equal(calc(publicNat).item.evidence.request.usageMeasureId,0);
 const hourly=raw('NAT Gateway','Public NAT Gateway small instance only',{unit:'hour',usage:730});
 assert.equal(calc(hourly).reasonCode,'HW_NAT_BILLED_DAYS');
 assert.equal(calc({...publicNat,usage:30.5}).reasonCode,'HW_NAT_BILLED_DAYS');
 assert.equal(raw('Public NAT Gateway','Small instance only, 40 Gbps').huaweiMatch,'HW_NAT_NO_MATCH');
 assert.equal(calc(raw('Public NAT Gateway','instance only, 300,000 SNAT connections',{unit:'day',usage:30})).item?.sku,'natgateway_xlarge');
 assert.equal(raw('Public NAT Gateway','instance only, 30,000 SNAT connections').huaweiMatch,'HW_NAT_PARAMETERS');
 for(const [mode,total] of [['MONTHLY',57.3],['YEARLY',573]]){
  selectHuaweiBilling(publicNat,mode,catalog,options);
  assert.equal(calc(publicNat).termPublic,total);
 }
 const privateNat=raw('Private NAT Gateway','Small instance only',{unit:'hour',usage:730});
 assert.deepEqual([calc(privateNat).item?.sku,calc(privateNat).termPublic],['privatenat_small',74.46]);
 assert.equal(raw('Private NAT Gateway','medium instance only, 5,001 SNAT connections').huaweiMatch,'HW_NAT_NO_MATCH');
 assert.equal(raw('AWS NAT Gateway','Small instance only').huaweiMatch,'HW_NAT_PARAMETERS');
 const dayText=select(parseText('1 个 Public NAT Gateway small instance only, 30 billed days')[0]);
 assert.equal(calc(dayText).monthly,73.14);
 dayText.specification='1 个 Public NAT Gateway small instance only, 15 billed days';
 assert.equal(calc(select(dayText)).monthly,36.57);
 const dayRate=catalog.items.find(p=>p.sku==='natgateway_small'&&p.billingMode==='ONDEMAND');
 assert.equal(priceValidation({...dayRate,unit:'hour'},catalog,options).code,'PRICE_UNIT');
 assert.equal(priceValidation({...dayRate,evidence:{...dayRate.evidence,request:{...dayRate.evidence.request,usageMeasureId:4}}},catalog,options).code,'PRICE_EVIDENCE');
});

test('manual changes revalidate the selected SKU, billing and input constraints',()=>{
 const row=raw('CCE Standard','HA, 175 worker nodes, cluster management only');
 const choose=sku=>{
  const item=catalog.items.find(p=>p.service==='CCE'&&p.sku===sku&&p.billingMode==='ONDEMAND');
  Object.assign(row,{huaweiSelection:'manual',targetId:item.id,huaweiPreferredSku:sku,accepted:true});
  return calc(select(row));
 };
 assert.equal(choose('cce.s2.small').reasonCode,'HW_CCE_NO_MATCH');
 assert.equal(choose('cce.s1.medium').reasonCode,'HW_CCE_NO_MATCH');
 assert.equal(choose('cce.s2.large').item?.sku,'cce.s2.large');
 selectHuaweiBilling(row,'MONTHLY',catalog,options);
 assert.equal(calc(row).reasonCode,'MAPPING_REVIEW');
 row.accepted=true;
 assert.equal(calc(row).termPublic,891.38);
 row.specification='HA, 1200 worker nodes, cluster management only';
 assert.equal(calc(row).reasonCode,'HW_SPEC_RECHECK');
 assert.equal(calc(select(row)).reasonCode,'HW_CCE_NO_MATCH');
 const nat=raw('Public NAT Gateway','Small instance only',{unit:'day',usage:30,huawei_target_region:'ap-southeast-1'});
 assert.equal(calc(nat).reasonCode,'HW_TARGET_REGION');
 const expired=raw('ELB','Dedicated ELB instance only');
 assert.equal(calc(expired,catalog,now+8*86400000).reasonCode,'PRICE_EXPIRED');
});

test('one quote retains priced base lines and exports explicitly related Pending charges independently',()=>{
 const rows=[
  raw('ELB','Dedicated flexible L4 base instance with EIP and public bandwidth',{unit:'hour',usage:730}),
  raw('CCE','Standard cluster with 3 masters and 30 worker nodes, ECS and EVS',{unit:'hour',usage:730}),
  raw('Public NAT Gateway','Small gateway with EIP and outbound traffic',{unit:'day',usage:30})
 ];
 const results=rows.map(row=>calc(row));
 assert.deepEqual(results.map(r=>r.monthly),[18.25,306.6,73.14]);
 assert.deepEqual(rows.map(row=>row.huaweiPendingCharges),[['lcu','eip','bandwidth'],['workers','storage','cceNetwork'],['eip','traffic']]);
 const summary=summaryModel(rows,results,'en');
 assert.deepEqual([summary.ready,summary.total,summary.monthly,summary.status],[3,11,397.99,'8 Pending']);
 const book=buildWorkbook(XLSX,rows,catalog,{now,language:'en',hours:730,discount:0},'Fictional quote');
 assert.deepEqual(Array.from(book.SheetNames),['Input','Service Mapping','Public Pricing','Quotation','Assumptions']);
 const quote=XLSX.utils.sheet_to_json(book.Sheets.Quotation,{defval:null});
 assert.equal(quote.length,11);
 assert.equal(quote.filter(r=>r.Status==='Pending').length,8);
 assert.ok(quote.filter(r=>r.Status==='Pending').every(r=>r.Charge&&r['Term Public USD']===null&&r['Monthly Public or Amortized USD']===null));
 assert.equal(quote.find(r=>r.Charge==='ELB capacity units (LCU)')?.Row,1);
});

test('current 32-row coverage inventory matches 18 rows and prices 16 without collapsing Pending charges',()=>{
 const markdown=readFileSync(new URL('../../../docs/HUAWEI_QUOTE_COVERAGE.md',import.meta.url),'utf8');
 const csv=markdown.match(/\x60\x60\x60csv\n(case_id,[\s\S]*?)\n\x60\x60\x60/)[1];
 const book=XLSX.read(csv,{type:'string'});
 const rows=normalizeRows(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''})).map(row=>select(row));
 const results=rows.map(row=>calc(row));
 assert.deepEqual([rows.length,rows.filter(row=>row.service!=='Unmapped').length,rows.filter(row=>row.targetId).length,
  results.filter(r=>r.status==='Valid').length,sumMoney(results.map(r=>r.monthly))],[32,32,18,16,1029.09]);
 assert.deepEqual([results[20].item?.sku,results[26].reasonCode,results[27].item?.sku,results[31].item?.sku],
  ['elbv3.professional','HW_NAT_BILLED_DAYS','natgateway_small','cce.s1.small']);
});

test('Worker refreshes billable-day and hourly plans with their own units',async()=>{
 const plans=[['natgateway_small','ONDEMAND'],['privatenat_small','ONDEMAND'],['elbv3.professional','ONDEMAND'],['cce.s1.small','MONTHLY']].map(([sku,mode])=>
  catalog.items.find(item=>item.sku===sku&&item.billingMode===mode));
 const fetch=globalThis.fetch;
 let count=0;
 globalThis.fetch=async(url,init)=>{
  assert.match(url,/^https:\/\/portal\.eu\.huaweicloud\.com\//);
  const inquiry=JSON.parse(init.body);
  assert.equal(inquiry.regionId,'eu-west-101');
  count++;
  return Response.json({currency:'USD',productRatingResult:inquiry.productInfos.map(product=>{
   const plan=plans.find(item=>item.productId===product.productId);
   assert.equal(product.usageMeasureId,plan.unit==='day'?0:plan.unit==='hour'?4:undefined);
   assert.equal(product.usageFactor,plan.usageFactor??undefined);
   return {id:product.id,productId:product.productId,officialWebsiteAmount:plan.rate};
  })});
 };
 try{
  const response=await worker.fetch(new Request('https://studio.example/api/rates',{method:'POST',body:JSON.stringify({ids:plans.map(p=>p.id)})}));
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(count,2);
  assert.equal(data.items.length,4);
  assert.ok(data.items.every(item=>priceValidation(item,catalog).valid));
  assert.equal(data.items.find(item=>item.unit==='day').evidence.billingSource,plans[0].evidence.billingSource);
 }finally{globalThis.fetch=fetch;}
});
