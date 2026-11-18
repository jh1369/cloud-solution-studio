export const REGION='eu-west-101';
export const BILLING_MODES={ONDEMAND:'按需',MONTHLY:'包月',YEARLY:'包年'};
export function targetMode(value='ONDEMAND'){return ({'按需':'ONDEMAND','pay-per-use':'ONDEMAND','on-demand':'ONDEMAND','按需计费':'ONDEMAND','包月':'MONTHLY','monthly':'MONTHLY','包年':'YEARLY','yearly':'YEARLY'})[String(value).toLowerCase()]||String(value).toUpperCase();}
export function billingOf(row){return targetMode(row.targetBilling||'ONDEMAND');}
export function switchBilling(row,mode,catalog){
 const previous=catalog.items.find(p=>p.id===row.targetId);row.targetBilling=targetMode(mode);row.accepted=false;
 row.targetId=catalog.items.find(p=>p.service===row.service&&p.sku===previous?.sku&&p.billingMode===row.targetBilling)?.id||recommend(row,catalog);
 return row;
}
export const SERVICES={
'ECS':['ec2','elastic compute cloud','amazon elastic compute cloud','ecs','云服务器'],
'EVS':['ebs','amazon ebs','evs','云硬盘'],
'OBS':['s3','amazon s3','simple storage service','对象存储','obs'],
'RDS':['rds','amazon rds','relational database service','数据库'],
'ELB':['elb','elastic load balancing','负载均衡'],
'DCS':['elasticache','redis','缓存','dcs'],
'DMS Kafka':['managed streaming for apache kafka','kafka','msk'],
'NAT Gateway':['nat','nat gateway','natgateway'],
'CES / LTS':['cloudwatch','日志','监控'],
'CFW':['network firewall'],
'DEW':['cloudhsm','key management service','secrets manager'],
'CCE':['eks','elastic container service for kubernetes','kubernetes'],
'DDS':['documentdb (with mongodb compatibility)','documentdb'],
'VPC / EIP':['virtual private cloud','vpc','data transfer'],
'HSS':['inspector'], 'SecMaster':['guardduty','security hub'],
'Config':['config'], 'WAF':['waf'], 'SWR':['ec2 container registry (ecr)','ecr'],
'SFS':['elastic file system','efs'], 'CBR':['backup'], 'SMN':['simple notification service','sns'],
'FunctionGraph':['lambda'], 'DLI / DataArts':['glue'], '需人工设计':['simple email service','simple queue service']};
export function family(product,group=''){
 const p=String(product).trim().toLowerCase();
 if(/natgateway/i.test(group))return 'NAT Gateway';
 if(group==='EBS')return 'EVS';
 for(const [name,aliases] of Object.entries(SERVICES))if(aliases.includes(p))return name;
 return 'Unmapped';
}
export function finite(value,name,missing=false){
 if(value===null||value===undefined||String(value).trim()===''){if(missing)return null;throw Error(`${name} 不能为空`);}
 if(!['string','number'].includes(typeof value))throw Error(`${name} 必须是 0–10¹² 的有限数字`);
 const raw=String(value).trim();
 if(raw.length>128||raw.includes(',')&&!/^[+]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw))throw Error(`${name} 必须是 0–10¹² 的有限数字`);
 const normalized=raw.replaceAll(',',''),result=Number(normalized);
 if(!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)||!Number.isFinite(result)||result<0||result>1e12)throw Error(`${name} 必须是 0–10¹² 的有限数字`);
 return result;
}
export const OFFICIAL_PRICE_SOURCE='https://portal.eu.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource';
const PRICE_FAILURES={
 PRICE_REGION:'Price region must be eu-west-101.',
 PRICE_CURRENCY:'Price currency must be USD.',
 PRICE_RATE:'Official unit price must be a finite nonnegative number.',
 PRICE_MODE:'Unsupported Huawei billing mode.',
 PRICE_UNIT:'Price unit does not match the supported billing model.',
 PRICE_PERIOD:'Official subscription term does not match the selected billing mode.',
 PRICE_SOURCE:'Official price source is missing or unsupported.',
 PRICE_EVIDENCE:'Official price evidence does not match the product, rate or billing parameters.',
 PRICE_TTL:'Price validity period must be between 0 and 7 days.',
 PRICE_TIME:'Official verification time is invalid or in the future.',
 PRICE_EXPIRED:'Official price snapshot has expired. Re-verify it online.'
};
export function priceValidation(item,catalog,{now=Date.now()}={}){
 const fail=code=>({valid:false,code,reason:PRICE_FAILURES[code]});
 if(!item||!catalog||item.region!==REGION||catalog.region!==REGION)return fail('PRICE_REGION');
 if(item.currency!=='USD'||catalog.currency!=='USD')return fail('PRICE_CURRENCY');
 if(typeof item.rate!=='number'||!Number.isFinite(item.rate)||item.rate<0||item.rate>1e12)return fail('PRICE_RATE');
 const mode=item.billingMode;
 if(!Object.hasOwn(BILLING_MODES,mode))return fail('PRICE_MODE');
 const suffix={ONDEMAND:'hour',MONTHLY:'month',YEARLY:'year'}[mode];
 if(typeof item.size!=='boolean'||item.service==='EVS'&&!item.size||item.unit!==(item.size?'GB-':'')+suffix)return fail('PRICE_UNIT');
 const periodType=mode==='MONTHLY'?2:mode==='YEARLY'?3:null;
 if(mode!=='ONDEMAND'&&(item.periodType!==periodType||item.periodNum!==1)||mode==='ONDEMAND'&&(item.periodType!=null||item.periodNum!=null))return fail('PRICE_PERIOD');
 if(item.sourceUrl!==OFFICIAL_PRICE_SOURCE)return fail('PRICE_SOURCE');
 const evidence=item.evidence,request=evidence?.request,response=evidence?.response,inquiry=evidence?.inquiry;
 if(!evidence||evidence.currency!=='USD'||!request||!response||!inquiry||typeof item.productId!=='string'||!item.productId||typeof item.sku!=='string'||!item.sku||request.productId!==item.productId||response.productId!==item.productId||request.resourceSpecCode!==item.sku||request.cloudServiceType!==item.cloudServiceType||request.resourceType!==item.resourceType||!item.cloudServiceType||!item.resourceType||request.productNum!==1||typeof request.id!=='string'||!request.id||response.id!==request.id||response.officialWebsiteAmount!==item.rate||inquiry.regionId!==REGION||inquiry.subscriptionNum!==1||inquiry.chargingMode!==(mode==='ONDEMAND'?1:0))return fail('PRICE_EVIDENCE');
 if(mode==='ONDEMAND'){
  if(typeof request.usageFactor!=='string'||!/duration/i.test(request.usageFactor)||request.usageMeasureId!==4||request.usageValue!==1||inquiry.periodType!=null||inquiry.periodNum!=null)return fail('PRICE_EVIDENCE');
 }else if(inquiry.periodType!==periodType||inquiry.periodNum!==1)return fail('PRICE_EVIDENCE');
 if(item.size&&(request.resourceSize!==1||(request.resouceSizeMeasureId??request.resourceSizeMeasureId)!==17||(request.resouceSizeMeasureId!=null&&request.resourceSizeMeasureId!=null&&request.resouceSizeMeasureId!==request.resourceSizeMeasureId)))return fail('PRICE_EVIDENCE');
 if(typeof catalog.ttlDays!=='number'||!Number.isFinite(catalog.ttlDays)||catalog.ttlDays<=0||catalog.ttlDays>7)return fail('PRICE_TTL');
 const verifiedAt=Date.parse(item.verifiedAt);
 if(typeof item.verifiedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(item.verifiedAt)||!Number.isFinite(verifiedAt)||!Number.isFinite(now)||verifiedAt>now)return fail('PRICE_TIME');
 if(now>=verifiedAt+catalog.ttlDays*86400000)return fail('PRICE_EXPIRED');
 return {valid:true,code:'VERIFIED',reason:''};
}
const ALIASES={product:['product','service','aws service','产品','服务','product/productname'],specification:['specification','instance_type','instancetype','规格','explicit instance specification'],region:['region','aws region label','区域','regioncode'],quantity:['quantity','count','数量','resource count (unknown)','resource count'],usage:['usage','monthly_usage','用量','period aggregate usage','lineitem/usageamount'],billing_method:['billing_method','billing method','aws billing method','计费方式'],unit:['unit','original unit','单位'],group:['billing group'],description:['description','描述'],scope:['scope','usage_scope','usage scope'],period:['usage period','usage_period'],target_billing:['huawei_billing_mode','target_billing_mode','华为云计费模式','huawei billing mode'],capacity:['capacity_gb','容量gb','capacity gb'],target_quantity:['target_quantity','target quantity']};
function get(row,key){for(const n of ALIASES[key])if(row[n]!==undefined&&row[n]!==null&&String(row[n]).trim()!=='')return row[n];return '';}
export function normalizeRows(objects){
 if(!objects.length)throw Error('文件中没有数据行');
 if(objects.length>2000)throw Error('单次最多导入 2,000 行');
 return objects.map((input,i)=>{
 const raw=Object.fromEntries(Object.entries(input).map(([k,v])=>[k.replace(/^\uFEFF/,'').trim().toLowerCase(),v]));
 const product=String(get(raw,'product')).trim();
 if(!product)throw Error(`第 ${i+2} 行缺少 product / service 列`);
 const aggregate=('period aggregate usage' in raw)||get(raw,'scope')==='aggregate';
 const spec=String(get(raw,'specification')||get(raw,'description')).trim();
 const service=family(product,get(raw,'group'));
 const quantity=aggregate?null:finite(get(raw,'quantity'),'数量',true);
 const usage=finite(get(raw,'usage'),'用量',true);
 const explicitUnit=String(get(raw,'unit')).trim();
 const capacity=finite(get(raw,'capacity'),'容量 GB',true)??(!aggregate&&service==='EVS'&&['gb-month','gb-mo'].includes(explicitUnit.toLowerCase())?usage:null);
 const targetBilling=targetMode(get(raw,'target_billing')||'ONDEMAND');
 const targetQuantity=finite(get(raw,'target_quantity'),'目标资源数量',true);
 return {id:crypto.randomUUID(),product,specification:spec,region:String(get(raw,'region')),quantity,usage,unit:explicitUnit||(['ECS','RDS','DCS','DMS Kafka','ELB','NAT Gateway','CCE'].includes(service)?'hour':''),billing:String(get(raw,'billing_method')||'未提供'),targetBilling,targetQuantity,capacity,service,scope:aggregate?'aggregate':'resource',period:String(get(raw,'period')||(aggregate?'source-period':'monthly')),notes:aggregate?'来源账期累计用量，未推断资源数量；需确认是否完整月。':!explicitUnit?'用量单位根据服务推定，请核对。':'',accepted:false,targetId:'',manualRate:null,
  sourceService:service,unitExplicit:!!explicitUnit,huaweiTargetRegion:String(raw.huawei_target_region||'').trim(),tcpTarget:String(raw.tcp_target_sku||'').trim(),tcpTargetRegion:String(raw.tcp_target_region||'').trim(),tcpTargetBilling:targetMode(raw.tcp_target_billing||'ONDEMAND')};
 });
}
export function awsShape(text){
 const m=text.match(/\b(?:db\.)?(t[234][a-z]*|m[345678][a-z]*|c[345678][a-z]*|r[345678][a-z]*)\.(nano|micro|small|medium|large|xlarge|\d+xlarge)\b/i);
 if(!m){const c=text.match(/(\d+)\s*(?:vCPU|核)/i),mem=text.match(/(\d+(?:\.\d+)?)\s*(?:GB|G)(?![A-Za-z])/i);return c&&mem?{cpu:+c[1],memory:+mem[1],arch:/arm|鲲鹏/i.test(text)?'ARM':'x86'}:null;}
 const f=m[1].toLowerCase(),size=m[2].toLowerCase();let cpu;
 if(size.endsWith('xlarge'))cpu=size==='xlarge'?4:parseInt(size)*4;
 else cpu=({nano:2,micro:2,small:2,medium:2,large:2})[size];
 if(f.startsWith('t2')&&['nano','micro','small'].includes(size))cpu=1;
 let memory=cpu*(f.startsWith('c')?2:f.startsWith('r')?8:4);
 if(f.startsWith('t'))memory=({nano:.5,micro:1,small:2,medium:4,large:8})[size]??cpu*4;
 return {cpu,memory,arch:/\dg/.test(f)?'ARM':'x86'};
}
export function recommend(row,catalog){
 const candidates=catalog.items.filter(p=>p.service===row.service&&(p.billingMode||'ONDEMAND')===billingOf(row));
 if(!candidates.length)return '';
 if(row.service==='ECS'||row.service==='RDS'){
  const shape=awsShape(row.specification);if(!shape)return '';
  const windows=/windows|\.win\b/i.test(row.specification);
  const engine=/postgres/i.test(row.specification)?'PostgreSQL':/mariadb/i.test(row.specification)?'MariaDB':/mysql/i.test(row.specification)?'MySQL':/sql\s*server|mssql/i.test(row.specification)?'Microsoft SQL Server':null;
  if(row.service==='RDS'&&!engine)return '';
  const architecture=String(shape.arch).toLowerCase();
  const valid=candidates.filter(p=>p.cpu>=shape.cpu&&p.memory>=shape.memory&&(row.service!=='ECS'&&architecture!=='arm'||String(p.arch).toLowerCase()===architecture)&&(row.service!=='ECS'||(p.os==='Windows')===windows)&&(!engine||p.engine===engine));
  valid.sort((a,b)=>(a.cpu-shape.cpu)*1000+(a.memory-shape.memory)*10+a.rate-((b.cpu-shape.cpu)*1000+(b.memory-shape.memory)*10+b.rate));
  return valid[0]?.id||'';
 }
 if(row.service==='EVS'){
  if(/snapshot|iops|throughput|mbps|cpu.?credits/i.test(row.specification))return '';
  if(!/\b(?:gp[23]|GPSSD)\b/i.test(row.specification))return '';
  return candidates.find(p=>p.sku==='GPSSD')?.id||'';
 }
 // Other service topologies and tiers require an explicit product choice.
 return '';
}
// A candidate is a proposed target design; these differences need human review.
export function mappingReview(row,item){
 if(!item)return [];
 const issues=[],add=(code,source='',target='')=>issues.push({code,source,target});
 if(['ECS','RDS'].includes(row.service)){
  const shape=awsShape(row.specification),arch=String(item.arch||'');
  if(!shape)add('SHAPE_UNKNOWN');
  else{
   if(shape.cpu!==item.cpu||shape.memory!==item.memory)add('SHAPE_DIFFERENT',`${shape.cpu} vCPU / ${shape.memory} GB`,`${item.cpu??'?'} vCPU / ${item.memory??'?'} GB`);
   if(!/^(x86|arm)$/i.test(arch))add('ARCH_UNKNOWN',shape.arch);
   else if(arch.toLowerCase()!==shape.arch.toLowerCase())add('ARCH_DIFFERENT',shape.arch,arch);
  }
  if(row.service==='ECS'){
   const os=/windows|\.win\b/i.test(row.specification)?'Windows':/linux/i.test(row.specification)?'Linux':'';
   if(!os||!item.os)add('OS_UNKNOWN');else if(os!==item.os)add('OS_DIFFERENT',os,item.os);
   add('ECS_REVIEW');
  }else{
   const engine=/postgres/i.test(row.specification)?'PostgreSQL':/mariadb/i.test(row.specification)?'MariaDB':/mysql/i.test(row.specification)?'MySQL':/sql\s*server|mssql/i.test(row.specification)?'Microsoft SQL Server':'';
   if(!engine||!item.engine)add('ENGINE_UNKNOWN');else if(engine!==item.engine)add('ENGINE_DIFFERENT',engine,item.engine);
   add('RDS_REVIEW');
  }
 }else if(row.service==='EVS'){
  if(!/\b(?:gp[23]|GPSSD)\b/i.test(row.specification)||item.sku!=='GPSSD')add('STORAGE_UNKNOWN');
  add('EVS_REVIEW');
 }
 return issues;
}
export function parseText(text){
 const lines=text.split(/[\n；;]/).map(s=>s.trim()).filter(Boolean);if(!lines.length)throw Error('请先输入资源描述');
 return lines.map(line=>{
 let service='Unmapped';for(const [f,aliases] of Object.entries(SERVICES))if(aliases.some(a=>new RegExp(`(?:^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|[^a-z])`,'i').test(line))){service=f;break;}
 const quantity=line.match(/(?:数量|quantity|count)\s*[=:：]?\s*(\d+(?:\.\d+)?)/i)||line.match(/(\d+(?:\.\d+)?)\s*(?:台|个|instances?)/i);
 const usage=line.match(/(?:用量|usage)\s*[=:：]?\s*(\d+(?:\.\d+)?)/i)||line.match(/(\d+(?:\.\d+)?)\s*(?:小时|hours?|hrs?)/i);
 const capacity=line.match(/(\d+(?:\.\d+)?)\s*(?:GB|G)(?:\s*[-/]?\s*(?:月|month|mo))?/i);
 const storage=service==='EVS'||service==='OBS';
 return {id:crypto.randomUUID(),product:service==='ECS'?'EC2':service,specification:line,region:line.match(/\b[a-z]{2}-[a-z]+-\d\b/)?.[0]||'',quantity:quantity?+quantity[1]:null,usage:storage&&capacity?+capacity[1]:usage?+usage[1]:null,unit:storage?'GB-month':'hour',billing:/reserved/i.test(line)?'reserved':/spot|竞价/i.test(line)?'spot':/on.?demand|按需/i.test(line)?'on-demand':'未提供',targetBilling:/包年|华为云.*yearly/i.test(line)?'YEARLY':/包月|华为云.*monthly/i.test(line)?'MONTHLY':'ONDEMAND',capacity:storage&&capacity?+capacity[1]:null,targetQuantity:null,service,scope:'resource',period:'monthly',notes:'规则提取，请确认数量、规格与用量。文字中的存储 GB 解释为每资源月均容量；其他费用单独添加。',accepted:false,targetId:'',manualRate:null};
 });
}
// Exact decimal ratios avoid turning tiny verified rates into an invented zero.
function decimalRatio(value,name){
 finite(value,name);
 const raw=String(value).trim().replaceAll(',','').replace(/^\+/,''),match=raw.match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
 const fraction=match[2]||'',exponent=Number(match[3]||0),digits=(match[1]||'0')+fraction;
 let coefficient=BigInt(digits||'0'),scale=fraction.length-exponent;
 if(scale<0){coefficient*=10n**BigInt(-scale);scale=0;}
 return {coefficient,scale};
}
export function decimalInt(value){const {coefficient,scale}=decimalRatio(value,'计算数值');return scale<=9?coefficient*10n**BigInt(9-scale):(coefficient+10n**BigInt(scale-9)/2n)/(10n**BigInt(scale-9));}
export function cost(quantity,usage,rate,discount=0){
 const discountNumber=finite(discount,'折扣');if(discountNumber>1)throw Error('折扣必须在 0–1 之间');
 const factors=[decimalRatio(quantity,'数量'),decimalRatio(usage,'用量'),decimalRatio(rate,'计算数值')];
 const numerator=factors.reduce((product,factor)=>product*factor.coefficient,1n),denominator=10n**BigInt(factors.reduce((sum,factor)=>sum+factor.scale,0));
 const reduction=decimalRatio(discount,'折扣'),discountScale=10n**BigInt(reduction.scale);
 const scenarioNumerator=numerator*(discountScale-reduction.coefficient),scenarioDenominator=denominator*discountScale;
 const round=(top,bottom)=>{
  const cents=(top*100n+bottom/2n)/bottom;
  if(cents>BigInt(Number.MAX_SAFE_INTEGER)){const error=Error('Calculation amount exceeds the supported precision range.');error.code='AMOUNT_PRECISION';throw error;}
  return Number(cents)/100;
 };
 return {monthly:round(numerator,denominator),scenario:round(scenarioNumerator,scenarioDenominator),annual:round(scenarioNumerator*12n,scenarioDenominator)};
}
export function sumMoney(values){
 const cents=values.reduce((sum,value)=>{
  if(value===null||value===undefined)return sum;
  const amount=Math.round(value*100);
  if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(amount))throw Error('Subtotal exceeds the supported precision range.');
  return sum+BigInt(amount);
 },0n);
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Subtotal exceeds the supported precision range.');
 return Number(cents)/100;
}
const pendingResult=(reason,reasonCode='INPUT_INVALID')=>({status:'Pending',reason,reasonCode,monthly:null,scenario:null,annual:null,termPublic:null,termScenario:null,upfrontScenario:null});
export function calculate(row,catalog,options={}){
 try{return calculateValidated(row,catalog,options);}
 catch(error){return pendingResult(error.code==='AMOUNT_PRECISION'?error.message:'Invalid quantity, usage, discount or reference hours.',error.code||'INPUT_INVALID');}
}
function calculateValidated(row,catalog,{hours=730,discount=0,now=Date.now()}={}){
 const pending=pendingResult;
 const mode=billingOf(row),item=catalog.items.find(price=>price.id===row.targetId);
 if(row.huaweiTargetRegion&&row.huaweiTargetRegion!==REGION)return pending('', 'HW_TARGET_REGION');
 if(!Object.hasOwn(BILLING_MODES,mode))return pending('华为云目标计费模式仅支持按需、包月、包年。','PRICE_MODE');
 if(!item)return pending(`请为${BILLING_MODES[mode]}选择已验证的目标规格；未获取价格的服务保持 Pending。`,row.huaweiMatch||'PRICE_MISSING');
 if(item.billingMode!==mode)return pending('所选官方价格与华为云目标计费模式不一致，请重新选择。','PRICE_MODE');
 if(!row.accepted)return pending('请核对并确认目标规格、架构、引擎、计费模式和部署方式。','MAPPING_REVIEW');
 if(item.service!==row.service)return pending('目标产品族不匹配。','MAPPING_SERVICE');
 const validation=priceValidation(item,catalog,{now});
 if(!validation.valid)return pending(validation.reason,validation.code);
 if(!['resource','aggregate'].includes(row.scope)||!['monthly','source-period'].includes(row.period))return pending('Unsupported usage scope or billing period.','INPUT_PERIOD');
 const discountNumber=finite(discount,'折扣');if(discountNumber>1)return pending('Invalid quantity, usage, discount or reference hours.');
 const quantity=row.targetQuantity??row.quantity??row.huaweiQuantity;
 if(mode!=='ONDEMAND'){
  if(row.period==='source-period')return pending('累计账单用量不能推断订阅方案；请明确目标数量、容量并选择完整订阅方案。','SUBSCRIPTION_REVIEW');
  if(quantity===null||quantity===undefined)return pending('包月/包年需要明确的目标资源数量，不能从累计账单小时数推断。','QUANTITY_REQUIRED');
  finite(quantity,'目标资源数量');
  if(!Number.isInteger(quantity)||quantity<=0)return pending('订阅资源数量必须是正整数。','QUANTITY_INVALID');
  let multiplier=1;
  if(item.size){
   multiplier=finite(row.capacity,'目标容量 GB');
   if(multiplier<=0)return pending('请填写大于零的目标云硬盘容量 GB；累计 GB-month 不能反推容量。','CAPACITY_REQUIRED');
  }
  const contract=cost(quantity,multiplier,item.rate,discount);
  const annual=mode==='YEARLY'?contract.scenario:contract.annual;
  const monthly=mode==='YEARLY'?cost(1,1,contract.monthly/12).monthly:contract.monthly;
  const scenario=mode==='YEARLY'?cost(1,1,contract.scenario/12).monthly:contract.scenario;
  return {status:'Valid',reason:mode==='YEARLY'?'独立官方包年价；首期按一年预付，月均金额仅作12月摊销比较。':'独立官方包月价；按一个月预付，年度为同方案连续12个月的情景。',monthly,scenario,annual,item,billingMode:mode,termPublic:contract.monthly,termScenario:contract.scenario,termLabel:mode==='YEARLY'?'1年':'1个月',upfrontScenario:contract.scenario,effectiveUsage:multiplier,quantity};
 }
 if(quantity==null&&row.scope!=='aggregate')return pending('请补充目标资源数量。','QUANTITY_REQUIRED');
 const monthlyReference=row.scope==='resource'&&row.period==='monthly'&&row.usage==null;
 const capacityMonth=monthlyReference&&item.size&&row.huaweiUsageAssumption==='HW_STORAGE_MONTH';
 const hourMonth=monthlyReference&&!item.size&&row.huaweiUsageAssumption==='HW_MONTH_HOURS';
 const billable=capacityMonth?row.capacity:hourMonth?hours:row.usage;
 if(billable==null)return pending('请补充用量。','USAGE_REQUIRED');
 finite(billable,'用量');if(row.scope!=='aggregate')finite(quantity,'目标资源数量');
 if(row.scope!=='aggregate'&&(!Number.isInteger(quantity)||quantity<=0))return pending('资源数量必须是正整数。','QUANTITY_INVALID');
 let usage=billable;const unit=capacityMonth?'GB-month'.toLowerCase():hourMonth?'hour':String(row.unit||'').toLowerCase();
 if(item.unit==='GB-hour'){
  if(['gb-month','gb-mo','gb-months'].includes(unit)||row.huaweiMatch&&unit==='gib-month'){
   const referenceHours=finite(hours,'月小时数');
   if(referenceHours<=0||referenceHours>744)return pending('Invalid quantity, usage, discount or reference hours.');
   usage*=referenceHours;
  }else if(!['gb-hour','gb-hours'].includes(unit))return pending('存储用量需为 GB-month 或 GB-hour；IOPS、快照单独计价。','USAGE_UNIT');
 }else if(!['hour','hours','hrs','hr','hourly','instance-hrs'].includes(unit))return pending('此目标按小时计费，请确认用量单位。','USAGE_UNIT');
 const values=cost(row.scope==='aggregate'?1:quantity,usage,item.rate,discount);
 if(row.period==='source-period')values.annual=null;
 return {status:row.period==='source-period'?'Period':'Valid',reason:row.period==='source-period'?'华为云按需 × 来源账期用量，未折算整月或全年。':'华为云独立按需价格 × 已确认目标方案用量；AWS 原计费方式不参与目标定价。',...values,item,billingMode:mode,termPublic:values.monthly,termScenario:values.scenario,termLabel:row.period==='source-period'?'来源账期':'1个月参考',upfrontScenario:null,effectiveUsage:usage,quantity:row.scope==='aggregate'?null:quantity};
}
export const BILL_SERVICES=['Elastic Compute Cloud','CloudWatch','Managed Streaming for Apache Kafka','Network Firewall','ElastiCache','CloudHSM','Relational Database Service','Data Transfer','Elastic Load Balancing','Virtual Private Cloud','GuardDuty','Elastic Container Service for Kubernetes','DocumentDB (with MongoDB compatibility)','Simple Storage Service','Inspector','Config','WAF','Security Hub','EC2 Container Registry (ECR)','Key Management Service','Elastic File System','Secrets Manager','Simple Email Service','Backup','Simple Queue Service','Lambda','Glue','Simple Notification Service'];
export function parseBillPages(pages){
 let service='',region='',group='',pending='',start=1;const items=[];
 for(let index=0;index<pages.length;index++){
  const lines=pages[index].normalize('NFKC').split('\n');
  for(const raw of lines){const line=raw.trim();if(!line||line.startsWith('描述'))continue;
   const match=line.match(/^(.*?)\s*USD\s*([\d,]+\.\d{2})$/);
   if(match){const label=match[1].trim();
    if(BILL_SERVICES.includes(label)){service=label;group='';region='';pending='';continue;}
    if(!service)continue;
    if(/^(EU|US East|US West|South America|Asia Pacific|Canada|Middle East|Africa) \(.+\)$/.test(label)||label==='Global'){region=label;group='';pending='';continue;}
    if(label.startsWith('总计'))continue;
    const full=(pending+' '+label).trim();const usage=full.match(/^(.*?)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z][A-Za-z0-9 /_-]*)$/);
    if(usage){items.push({'AWS Service':service,'AWS Region Label':region,'Billing Group':group,'Description':usage[1],'Period Aggregate Usage':usage[2],'Original Unit':usage[3],'Billing Method':/On Demand/i.test(usage[1])?'on-demand':'需确认','Source Page':pending?start:index+1,'AWS Amount USD':match[2]});pending='';}
    else {group=label;pending='';}
   }else if(service){if(!pending)start=index+1;pending=(pending+' '+line).trim();}
  }
 }
 if(!items.length)throw Error('未识别该 PDF 的 AWS 计费布局。请改用 CSV/XLSX，扫描件暂不支持。');
 return normalizeRows(items).map((r,i)=>({...r,sourcePage:items[i]['Source Page'],awsAmount:items[i]['AWS Amount USD']}));
}
