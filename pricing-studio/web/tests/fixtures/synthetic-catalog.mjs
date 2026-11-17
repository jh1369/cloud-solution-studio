/**
 * FICTIONAL UNIT-TEST PRICES ONLY. These records are not retrieved prices and
 * must never be exported as a real catalogue or copied into public/catalog.json.
 * The official URL and request shape are test inputs for provenance validation.
 */
const SOURCE='https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource';
const MODES={ONDEMAND:{unit:'hour',chargingMode:1},MONTHLY:{unit:'month',chargingMode:0,periodType:2},YEARLY:{unit:'year',chargingMode:0,periodType:3}};
export function syntheticPlan({name='ECS-SMALL',service='ECS',sku='synthetic.c6.large.2.linux',mode='ONDEMAND',rate=.125,cpu=2,memory=4,engine='',size=false,now=Date.now()}={}){
 const productId=`SYNTHETIC-${name}-${mode}`,contract=MODES[mode];
 const resourceType=size?'hws.resource.type.volume':service==='RDS'?'hws.resource.type.rds.vm':service==='ELB'?'hws.resource.type.elbv3':'hws.resource.type.vm';
 const cloudServiceType=size?'hws.service.type.ebs':service==='RDS'?'hws.service.type.rds':service==='ELB'?'hws.service.type.elb':'hws.service.type.ec2';
 const request={id:'0',cloudServiceType,resourceType,resourceSpecCode:sku,productId,productNum:1};
 if(mode==='ONDEMAND')Object.assign(request,{usageFactor:'Duration',usageMeasureId:4,usageValue:1});
 if(size)Object.assign(request,{resourceSize:1,resouceSizeMeasureId:17});
 const inquiry={regionId:'eu-west-101',chargingMode:contract.chargingMode,subscriptionNum:1,siteCode:'HWC'};
 if(mode!=='ONDEMAND')Object.assign(inquiry,{periodType:contract.periodType,periodNum:1});
 return {
  synthetic:true,id:productId,productId,service,sku,description:`Fictional ${service} ${cpu}vCPU ${memory}GB unit-test plan`,cpu,memory,os:'Linux',arch:'x86',engine,
  resourceType,cloudServiceType,usageFactor:mode==='ONDEMAND'?'Duration':null,size,
  unit:(size?'GB-':'')+contract.unit,billingMode:mode,periodType:contract.periodType??null,periodNum:mode==='ONDEMAND'?null:1,
  rate,currency:'USD',region:'eu-west-101',sourceUrl:SOURCE,catalogUrl:SOURCE,siteCode:'HWC',verifiedAt:new Date(now-60_000).toISOString(),
  evidence:{synthetic:true,request,inquiry,currency:'USD',response:{id:'0',productId,amount:rate,officialWebsiteAmount:rate,officialWebsiteDiscountAmount:0,discountAmount:0,originalAmount:rate}}
 };
}
export function syntheticCatalog({now=Date.now()}={}){
 const specs=[
  {name:'ECS-SMALL',service:'ECS',sku:'synthetic.c6.large.2.linux',cpu:2,memory:4,rates:[.125,37,333]},
  {name:'ECS-MEDIUM',service:'ECS',sku:'synthetic.s6.2xlarge.4.linux',cpu:8,memory:32,rates:[.1,50,450]},
  {name:'EVS',service:'EVS',sku:'GPSSD',cpu:null,memory:null,size:true,rates:[.0002,.08,.72]},
  {name:'RDS',service:'RDS',sku:'synthetic.rds.mysql.large',cpu:2,memory:8,engine:'MySQL',rates:[.2,70,630]}
 ];
 const items=specs.flatMap(spec=>Object.keys(MODES).map((mode,i)=>syntheticPlan({...spec,mode,rate:spec.rates[i],now})));
 items.push(syntheticPlan({name:'ELB',service:'ELB',sku:'synthetic.elbv3.professional',rate:.025,cpu:null,memory:null,now}));
 return {synthetic:true,region:'eu-west-101',currency:'USD',ttlDays:7,verifiedAt:new Date(now-60_000).toISOString(),items};
}
export function syntheticRow({service='ECS',mode='ONDEMAND',sku,quantity=2,usage=730,unit='hour',scope='resource',period='monthly',catalog=syntheticCatalog()}={}){
 const plan=catalog.items.find(p=>p.service===service&&p.billingMode===mode&&(!sku||p.sku===sku));
 return {id:'fictional-row',product:service==='ECS'?'EC2':service,specification:'Fictional test resource',region:'eu-central-1',quantity,usage,unit,billing:'on-demand',targetBilling:mode,targetQuantity:null,capacity:service==='EVS'?500:null,service,scope,period,notes:'',accepted:true,targetId:plan?.id||''};
}
export function copy(value){return structuredClone(value);}
