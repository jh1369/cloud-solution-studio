import {calculate,finite,huaweiBudgetAmounts,huaweiQuoteLines,sumMoney} from '../public/engine.mjs';
import {applyHuaweiMatch} from '../public/huawei-match.mjs';
import {aiPlanSignature,huaweiAiRequest} from '../public/huawei-ai-match.mjs';

const hourly=unit=>/^(?:hours?|hrs?|hourly|instance-hrs)$/i.test(unit??'');
const count=value=>Number.isSafeInteger(value)&&value>0;
const supportedHourly=new Set(['ECS','RDS','DCS','CSS']);
const special=/\b(?:acu(?:-hours?)?|serverless(?:v?2)?usage|ultra[\s-]?warm(?:usage)?|io(?:ps|usages?|requests?)?|i\/o|requests?|backup|snapshot)\b/i;
const evidenceMeter=new Set(['instance-hours','database-multi-az-hours','search-node-hours']);

export function monthlyBudgetOptions({billingMonth,periodHours,discount}={}){
 if(billingMonth&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(billingMonth))throw Error('Expected --billing-month YYYY-MM.');
 const month=billingMonth?Number(billingMonth.slice(5)):7;
 const first=billingMonth?Date.parse(billingMonth+'-01T00:00:00Z'):null;
 const nextMonth=first==null?null:new Date(first);
 if(nextMonth)nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
 const monthHours=first==null?null:(nextMonth.getTime()-first)/3600000;
 const hours=periodHours===undefined?monthHours:finite(periodHours,'账期小时数');
 if(hours!==null&&(![672,696,720,744].includes(hours)||billingMonth&&hours!==monthHours))throw Error('账期小时数须为完整 UTC 月份，且与指定账单月份相符。');
 const fraction=discount===undefined?0:finite(discount,'折扣');
 if(fraction>1)throw Error('折扣须为 0 至 1 的比例。');
 return {month,billingMonth,periodHours:hours,discount:fraction,discountSpecified:discount!==undefined};
}

export function specialMonthlyMeter(row){
 // A Redis Standard tier, Aurora reference design and normal CSS node remain eligible.
 return special.test(row.unit)||special.test(row.specification);
}

function monthlyTarget(row,options){
 if(specialMonthlyMeter(row)||row.huaweiEip?.meter==='traffic')return null;
 const dcs=row.service==='DCS'&&row.awsInventory;
 const explicit=row.huaweiMigration?.metering?.targetInstanceQuantity??row.targetQuantity??
  (row.scope==='resource'&&!dcs?row.quantity??row.huaweiQuantity:null);
 if(explicit!=null)return count(explicit)?{quantity:explicit,note:'按已知目标或逐资源实例数估算，假设整月购买。'}:null;
 const hours=options.monthlyBudget.periodHours;
 if(!hours||!supportedHourly.has(row.service)||!hourly(row.unit))return null;
 const metering=row.huaweiMigration?.metering;
 const targetHours=dcs?metering?.targetInstanceHours:
  row.scope==='aggregate'&&evidenceMeter.has(row.huaweiMigration?.meter?.basis)?row.usage:null;
 if(!(targetHours>0))return null;
 const average=targetHours/hours,quantity=Math.ceil(average);
 if(!count(quantity))return null;
 const replicaNote=dcs?`AWS 节点小时 ÷ ${metering.nodesPerInstance} 个节点/实例；`:'';
 return {quantity,note:`${replicaNote}${targetHours} 目标实例小时 ÷ ${hours} 账期小时 = ${average.toFixed(3)} 个平均实例；向上取整为 ${quantity} 个整月包月实例。平均值不能证明峰值容量。`};
}

function monthlyDraft(row,target){
 return {...row,targetBilling:'MONTHLY',scope:'resource',period:'monthly',quantity:target.quantity,targetQuantity:target.quantity,
  huaweiAi:null,huaweiConditionApproval:null,monthlyQuantityNote:target.note};
}

function pricedMonthly(row,catalog,options){
 const result=calculate(row,catalog,options);
 return huaweiBudgetAmounts(result).monthly!=null;
}

export function selectMonthlyBudget(source,catalog,options){
 const onDemand=applyHuaweiMatch({...source,targetBilling:'ONDEMAND'},catalog,options);
 const target=monthlyTarget(onDemand,options);
 const monthly=target?applyHuaweiMatch(monthlyDraft(onDemand,target),catalog,options):null;
 if(monthly&&pricedMonthly(monthly,catalog,options))return monthly;
 if(calculate(onDemand,catalog,options).status!=='Pending'||!monthly)return onDemand;
 // Start with the monthly SKU list when both rule paths need a recommendation.
 const request=huaweiAiRequest(monthly,catalog,calculate(monthly,catalog,options),options);
 return request?monthly:onDemand;
}

export function preferRecommendedMonthly(row,catalog,options){
 const saved=row.huaweiAi;
 if(row.targetBilling!=='ONDEMAND'||!saved?.display||saved.display.missing.length)return row;
 const target=monthlyTarget(row,options);
 if(!target)return row;
 const draft=monthlyDraft(row,target);
 const sku=saved.display.sku;
 const items=catalog.items.filter(item=>item.sku===sku&&item.service===row.service&&item.billingMode==='MONTHLY');
 if(items.length!==1)return row;
 const restricted={...catalog,items};
 applyHuaweiMatch(draft,restricted,options);
 if(!pricedMonthly(draft,restricted,options)){
  const request=huaweiAiRequest(draft,restricted,calculate(draft,restricted,options),options);
  if(!request?.candidateIds.includes(items[0].id))return row;
  draft.huaweiAi={request,signature:aiPlanSignature(draft),recommendation:{
   ...saved.recommendation,selection:items[0].id,alternatives:[]
  }};
  applyHuaweiMatch(draft,restricted,options);
 }
 if(!pricedMonthly(draft,restricted,options))return row;
 // The selected exact SKU came from Codex even if the monthly rules independently match it.
 draft.monthlyRecommendation=saved.recommendation;
 return draft;
}

export function monthlyBudgetLines(rows,output,options){
 return huaweiQuoteLines(rows,output).map(line=>{
  const {result,row,index}=line,source=rows[index],item=result.item;
  const amounts=huaweiBudgetAmounts(result);
  let exclusion=source.huaweiInputError??null;
  if(!exclusion){
   if(specialMonthlyMeter(source))exclusion='该费用使用专用计量单位，需单独核价。';
   else if(item?.eipMeter==='traffic')exclusion='阶梯流量需要单独报价。';
   else if(!options.monthlyBudget.periodHours&&
     (amounts.sourcePeriod!=null||result.billingMode==='ONDEMAND'&&row?.huaweiUsageAssumption==='HW_MONTH_HOURS')){
    exclusion='累计账期未确认是完整月份，月度费用待核实。';
   }
  }
  const amount=exclusion?null:amounts.monthly??amounts.sourcePeriod;
  const multiplier=item?.eipMeter==='bandwidth'?row?.huaweiEip?.mbps??1:1;
  return {...line,exclusion,amount,rate:amount==null?null:item?.rate??null,
   units:amount==null?null:(result.quantity??1)*result.effectiveUsage*multiplier};
 });
}

export function monthlyBudgetTotal(lines){
 const values=lines.flatMap(line=>line.amount==null?[]:[line.amount]);
 return values.length?sumMoney(values):null;
}
