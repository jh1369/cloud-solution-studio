import {billingOf} from './engine.mjs';

const elbSource='https://support.huaweicloud.com/eu/productdesc-elb/en-us_topic_0287737145.html';
const cceSource='https://support.huaweicloud.com/eu/api-cce/cce_02_0236.html';
const natSource='https://support.huaweicloud.com/eu/productdesc-natgateway/en-us_topic_0086739763.html';
const cceCatalog='https://portal.eu.huaweicloud.com/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo?urlPath=cce&region=eu-west-101&language=en-us&station=en-EU&tag=general.online.portal';
const source=(url,revision,section,kind='official-doc')=>({kind,url,revision,section});
const elbSpec={service:'ELB',specCode:'elbv3.professional',resourceType:'hws.resource.type.elbv3',usageFactor:'instance_duration',
 type:'elastic',evidence:source(elbSource,'2025-08-29','Tables 1 and 3')};

const cceSpecs=[
 ['cce.s1.small',1,'small',50],['cce.s1.medium',1,'medium',200],
 ['cce.s2.small',3,'small',50],['cce.s2.medium',3,'medium',200],
 ['cce.s2.large',3,'large',1000],['cce.s2.xlarge',3,'xlarge',2000]
].map(([specCode,masters,tier,workers])=>({service:'CCE',specCode,resourceType:'hws.resource.type.cce.cluster',
 type:'standard',masters,tier,workers,evidence:source(cceSource,'2025-04-07','CCE cluster flavors')}));
const autopilotSpec={service:'CCE',specCode:'cce.autopilot.cluster',resourceType:'hws.resource.type.cce.autopilot',type:'autopilot',
 evidence:source(cceCatalog,'2026-11-19','EU-Dublin Autopilot cluster','official-catalog')};
const packageSpecs=[['MONTHLY',[1000,10000,100000]],['YEARLY',[12000,120000,1200000]]].flatMap(([mode,sizes])=>
 sizes.flatMap(hours=>[['cpu','vCPU'],['mem','GB']].map(([dimension,unit])=>({service:'CCE',
  specCode:`autopilot.default.${dimension}.${hours}${unit}-hour.${mode.toLowerCase()}`,resourceType:'hws.resource.type.cci.autopilot',
  type:'package',dimension,hours,mode,evidence:source(cceCatalog,'2026-11-19','EU-Dublin Autopilot resource packages','official-catalog')}))));

const natSpecs=[
 ['public','small','natgateway_small',10000,20000],['public','medium','natgateway_middle',50000,20000],
 ['public','large','natgateway_large',200000,20000],['public','xlarge','natgateway_xlarge',1000000,20000],
 ['private','small','privatenat_small',2000,200],['private','medium','privatenat_medium',5000,500],
 ['private','large','privatenat_large',20000,2000],['private','xlarge','privatenat_xlarge',50000,5000]
].map(([type,tier,specCode,connections,bandwidth])=>({service:'NAT Gateway',specCode,type,tier,connections,bandwidth,
 resourceType:type==='public'?'hws.resource.type.natgateway':'hws.resource.type.privatenat',
 evidence:source(natSource,'2026-04-16',type==='public'?'Public NAT gateway specifications':'Private NAT gateway specifications')}));

const number='([+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
function amounts(text,unit){
 const pattern=new RegExp('(?<![\\w.])(?<!\\d,)'+number+'\\s*(?:'+unit+')|(?:'+unit+')\\s*[:=]\\s*'+number,'gi');
 return [...new Set(Array.from(text.matchAll(pattern),m=>Number((m[1]??m[2]).replaceAll(',',''))))];
}
const values=(text,pattern)=>[...new Set(Array.from(text.matchAll(pattern),m=>m[0].toLowerCase()))];
const invalidCount=counts=>counts.length>1||counts.some(n=>!Number.isSafeInteger(n)||n<=0);
const bandwidthMbps=text=>[...new Set([...amounts(text,'Mbit/s\\b|Mbps\\b'),...amounts(text,'Gbit/s\\b|Gbps\\b').map(v=>v*1000)])];
const baseOnly=/\b(?:base instance|instance|gateway|cluster management|management|control plane)(?: fee| charge)? only\b|仅(?:计|含|报价)?(?:基础实例|实例|网关|集群管理|管理|控制面)/i;
const networkFees=[
 ['eip',/\b(?:EIPs?|elastic IP(?: address(?:es)?)?)\b|弹性公网\s*IP/i],
 ['bandwidth',/\b(?:(?:public|internet|EIP|dedicated|shared) bandwidth|bandwidth (?:fee|charge|only))\b|公网带宽|带宽(?:费|计费)/i],
 ['traffic',/\b(?:data processing|data transfer|outbound traffic|egress|traffic (?:fee|charge))\b|出网流量|公网流量|流量费/i]
];
const matchedFees=(text,patterns)=>patterns.filter(([,pattern])=>pattern.test(text)).map(([fee])=>fee);
const ancillary=(fees)=>({charge:fees[0],pendingCharges:fees.slice(1),code:'HW_ANCILLARY_PENDING'});
const instanceScope=/\b(?:base instance|instance fee|instance only|gateway fee|gateway only)\b|基础实例|实例费|仅实例|网关费|仅网关/i;
const hourlyUnit=/^(?:hour|hours|hr|hrs|hourly|instance-hrs)$/i;
const dayUnit=/^(?:day|days|billable days|计费日|天)$/i;

function elb(row,text,sku){
 const addons=matchedFees(text,networkFees);
 if(/\bLCUs?\b|\b(?:load balancer )?capacity units?\b|容量单位/i.test(text+' '+row.unit))addons.unshift('lcu');
 const explicitlyBase=instanceScope.test(text);
 const layer4=/\b(?:L4|layer[ -]?4|TCP|UDP|TLS|network load balanc\w*)\b|四层|网络型/i.test(text);
 const layer7=/\b(?:L7|layer[ -]?7|HTTPS?|application load balanc\w*)\b|七层|应用型/i.test(text);
 const specified=values(text,/\belbv\d+\.[a-z0-9_.-]+\b/gi);
 const dedicated=specified.includes(elbSpec.specCode)||/\bdedicated\b|专享/i.test(text);
 const elastic=/\b(?:elastic|flexible) (?:spec(?:ification)?s?|flavo[u]?r)\b|\bflexible\b|弹性规格/i.test(text);
 const combined=/\b(?:with|plus|including)\b|包含|附带|含有/i.test(text);
 if(addons.length&&((row.usage!=null&&!hourlyUnit.test(row.unit))||!explicitlyBase&&(!combined||!elastic&&!specified.length||
  /\b(?:LCU|capacity units?|bandwidth|traffic|EIP)(?:[- ]hours?)?\s+(?:charge|fee|only)\b|(?:带宽|流量|容量单位)费/i.test(text))))return ancillary(addons);
 const charge='elbInstance';
 const pendingCharges=baseOnly.test(text)?addons:[...new Set(['lcu',...addons])];
 const fail=code=>({charge,pendingCharges,code});
 if(/\b(?:shared|fixed)\b(?!\s+(?:bandwidth|traffic|EIP|IP)\b)|\b(?:classic|gateway load balancer|gwlb)\b|共享(?:型|负载均衡)|固定规格/i.test(text)||
  specified.some(value=>value!==elbSpec.specCode))return fail('HW_ELB_NO_MATCH');
 if(!(dedicated||sku===elbSpec.specCode)||!(specified.length||elastic||explicitlyBase||sku===elbSpec.specCode))return {...fail('HW_ELB_PARAMETERS'),specs:[elbSpec]};
 const connections=amounts(text,'concurrent connections?\\b|并发连接(?:数)?');
 const cps=amounts(text,'CPS\\b|new connections? per second\\b|每秒新建连接');
 const qps=amounts(text,'QPS\\b|每秒查询');
 const bandwidth=bandwidthMbps(text);
 const networkOnly=layer4&&!layer7,applicationOnly=layer7&&!layer4;
 const cannotVerify=([connections,cps,qps].some(invalidCount)||bandwidth.length>1||bandwidth.some(v=>v<=0||v>10000)||
  connections[0]>(networkOnly?20000000:8000000)||cps[0]>(networkOnly?400000:80000)||
  qps.length&&(!applicationOnly||qps[0]>160000)||/\bQPS\b/i.test(text)&&!qps.length||/\bCPS\b/i.test(text)&&!cps.length||
  /\bmulti[- ]az\b|\b(?:[2-9]|[1-9]\d+)\s*AZs?\b|多可用区/i.test(text));
 if(cannotVerify)return fail('HW_ELB_PERFORMANCE');
 const layer=layer4&&layer7?'L4/L7':layer4?'L4':layer7?'L7':null;
 return {specs:[{...elbSpec,layer}],charge,pendingCharges,assumptions:!elastic&&!specified.length&&!sku?['HW_ELB_ELASTIC_BASE']:[]};
}

function packageSelection(row,text,sku){
 const charge='ccePackage';
 const specified=values(text,/\bautopilot\.default\.(?:cpu|mem)\.\d+(?:vCPU|GB)-hour\.(?:monthly|yearly)\b/gi);
 if(specified.length>1)return {charge,code:'HW_CCE_PACKAGE_PARAMETERS'};
 const chosen=sku??specified[0];
 const cpu=amounts(text,'vCPU[- ]hours?\\b');
 const mem=amounts(text,'(?:GiB|GB)[- ]hours?\\b');
 if(invalidCount(cpu)||invalidCount(mem)||cpu.length&&mem.length||chosen&&specified.length&&chosen.toLowerCase()!==specified[0])return {charge,code:'HW_CCE_PACKAGE_PARAMETERS'};
 if(!chosen&&(!(cpu.length||mem.length)||!(/\bgeneral[- ]computing\b|通用计算/i.test(text))))return {charge,code:'HW_CCE_PACKAGE_PARAMETERS'};
 const specs=packageSpecs.filter(spec=>(!chosen||spec.specCode.toLowerCase()===chosen.toLowerCase())&&
  (cpu.length?spec.dimension==='cpu'&&spec.hours===cpu[0]:!mem.length||spec.dimension==='mem'&&spec.hours===mem[0])&&
  (!!chosen||spec.mode===billingOf(row)));
 return {charge,specs,assumptions:['HW_CCE_PACKAGE_ONLY']};
}

const cceFees=[
 ['workers',/\b(?:ECS|worker nodes?)\b|工作节点|云服务器/i],
 ['storage',/\b(?:EVS|disks?|volumes?|storage)\b|云盘|云硬盘|存储费/i],
 ['cceNetwork',/\b(?:ELB|network fees?|network charges?)\b|负载均衡|网络费用/i],
 ...networkFees
];
function cce(row,text,sku){
 if(/\b(?:resource )?packages?\b|资源包|\bautopilot\.default\./i.test(text)||sku?.startsWith('autopilot.default.'))return packageSelection(row,text,sku);
 const charge='cceManagement';
 const management=/\b(?:cluster management|control plane|cce\.s\d+\.|cce\.autopilot\.cluster)\b|集群管理|控制面/i.test(text);
 const addonOnly=/\b(?:worker nodes?|ECS|EVS|storage|network|EIP|bandwidth)(?: fees?| charges?)? only\b|仅(?:工作节点|ECS|云盘|存储|网络|带宽)/i.test(text);
 const addons=matchedFees(text,cceFees);
 if(addons.length&&!management&&(addonOnly||row.usage!=null&&!hourlyUnit.test(row.unit)))return ancillary(addons);
 const specified=values(text,/\bcce\.[a-z0-9]+(?:\.[a-z0-9_-]+)+\b/gi);
 const autopilot=/\bautopilot\b/i.test(text)||sku===autopilotSpec.specCode;
 const turbo=/\bturbo\b/i.test(text),standard=/\bstandard\b|标准(?:型|版|集群)/i.test(text);
 const workers=amounts(text,'worker nodes?\\b|工作节点(?:数)?');
 const masterNumbers=amounts(text,'master nodes?\\b|masters?\\b|control plane nodes?\\b|主控节点(?:数)?');
 const single=/(?<!\w)non[- ]?ha\b|\bsingle[- ]master\b|单主(?:节点|控)?|非高可用/i.test(text);
 const ha=/\b(?:HA|high[- ]availability|multi[- ]master)\b|高可用|多主/i.test(text.replace(/\bnon[- ]?ha\b|非高可用/gi,''));
 const masters=[...new Set([...masterNumbers,...(single?[1]:[]),...(ha?[3]:[])])];
 const tiers=values(text.replaceAll(/\bcce\.[\w.]+/gi,' '),/\b(?:small|medium|large|xlarge)\b/gi);
 const pendingCharges=baseOnly.test(text)?addons.filter(fee=>fee!=='workers'||/\bECS\b|工作节点费/i.test(text)):
  [...new Set([...(autopilot?['workload']:['workers','storage','cceNetwork']),...addons])];
 const fail=(code,specs=[])=>({charge,pendingCharges,code,specs});
 const ambiguousScale=/\d+\s*(?:[-–~/]|或|\bor\b)\s*\d+\s*(?:(?:master|worker)(?: nodes?)?|主控节点|工作节点)/i.test(text);
 if(turbo||autopilot&&standard||specified.length>1||invalidCount(workers)||invalidCount(masters)||ambiguousScale||tiers.length>1||
  masters.some(n=>![1,3].includes(n))||sku&&specified.length&&sku!==specified[0])return fail('HW_CCE_NO_MATCH');
 const chosen=sku??specified[0];
 if(autopilot){
  if(workers.length||masters.length||tiers.length||chosen&&chosen!==autopilotSpec.specCode)return fail('HW_CCE_NO_MATCH');
  return {charge,pendingCharges,specs:[autopilotSpec]};
 }
 let specs=cceSpecs.filter(spec=>(!chosen||spec.specCode===chosen)&&(!masters.length||masters[0]===spec.masters)&&
  (!tiers.length||tiers[0]===spec.tier)&&(!workers.length||workers[0]<=spec.workers));
 if(!specs.length)return fail('HW_CCE_NO_MATCH');
 if(!chosen){
  if(!masters.length)return fail('HW_CCE_CONTROL_PLANE',specs);
  if(!tiers.length&&!workers.length)return fail('HW_CCE_SCALE',specs);
  if(!tiers.length){
   const minimum=Math.min(...specs.map(spec=>spec.workers));
   specs=specs.filter(spec=>spec.workers===minimum);
  }
 }
 return {charge,pendingCharges,specs,assumptions:[...(!standard&&!chosen?['HW_CCE_STANDARD']:[]),
  ...(!chosen&&!tiers.length&&workers.length?['HW_CCE_MINIMUM_TIER']:[])]};
}

function nat(row,text,sku){
 const addons=matchedFees(text,networkFees);
 const charge='natInstance';
 const explicitBase=instanceScope.test(text);
 const publicType=/\bpublic\b(?!\s+(?:bandwidth|traffic|IP|EIP|subnets?)\b)|公网(?!\s*(?:带宽|流量|IP))/i.test(text);
 const privateType=/\bprivate\b(?!\s+(?:bandwidth|traffic|IP|EIP|subnets?)\b)|私网(?!\s*(?:带宽|流量|IP))/i.test(text);
 const specified=values(text,/\b(?:natgateway|privatenat)_(?:[a-z0-9]+)\b/gi);
 const chosen=sku??specified[0];
 const tierText=text.replace(/\b(?:natgateway|privatenat)_[a-z0-9]+\b/gi,' ');
 const sizes=[...new Set([...values(tierText,/\b(?:small|medium|middle|large|xlarge)\b|\bextra[- ]large\b/gi)
  .map(size=>size==='middle'?'medium':size.startsWith('extra')?'xlarge':size),
  ...[[/小型/,'small'],[/中型/,'medium'],[/(?<!超)大型/,'large'],[/超大型/,'xlarge']].filter(([pattern])=>pattern.test(tierText)).map(([,size])=>size)])];
 const connections=amounts(text,'SNAT connections?\\b|SNAT\\s*连接(?:数)?');
 const bandwidth=bandwidthMbps(text);
 if(addons.length&&(!explicitBase&&/\b(?:EIP|bandwidth|traffic|data processing)(?: fees?| charges?)? only\b|仅(?:公网带宽|带宽|流量|EIP)/i.test(text)||
  row.usage!=null&&!hourlyUnit.test(row.unit)&&!dayUnit.test(row.unit)))return ancillary(addons);
 const pendingCharges=!baseOnly.test(text)&&(publicType||chosen?.startsWith('natgateway_'))?[...new Set(['eip',...addons])]:addons;
 const fail=(code,specs=[])=>({charge,pendingCharges,code,specs});
 if(publicType&&privateType||specified.length>1||sku&&specified.length&&sku!==specified[0]||sizes.length>1||invalidCount(connections)||bandwidth.length>1||bandwidth[0]<=0||
  /\b(?:NAT64|IPv6|dual[- ]stack)\b|双栈/i.test(text))return fail('HW_NAT_NO_MATCH');
 const type=publicType?'public':privateType?'private':null;
 const specs=natSpecs.filter(spec=>(!type||spec.type===type)&&(!chosen||spec.specCode===chosen)&&
  (!sizes.length||spec.tier===sizes[0])&&(!connections.length||spec.connections>=connections[0])&&(!bandwidth.length||spec.bandwidth>=bandwidth[0]));
 if(!specs.length)return fail('HW_NAT_NO_MATCH');
 if(!chosen&&(!type||!sizes.length&&specs.length!==1||type==='private'&&!explicitBase))return fail('HW_NAT_PARAMETERS',specs);
 return {charge,pendingCharges,specs,assumptions:['HW_NAT_INSTANCE_ONLY']};
}

export const infrastructureRules={ELB:elb,CCE:cce,'NAT Gateway':nat};
