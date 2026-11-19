import {billingOf,EIP_CATALOG_SOURCE,EIP_BILLING_SOURCE,targetMode} from './engine.mjs';

const ip='(?:\\b(?:EIPs?|(?:Elastic|Public) IP(?:v4)?(?: address(?:es)?)?)\\b|(?:弹性)?公网\\s*IP(?:地址)?)';
export const eipName=new RegExp(ip,'i');
const attachment=new RegExp('(?:\\s+(?:with|including|plus|and)\\s+|\\s*\\+\\s*|[ ,，]*?(?:附带|绑定|带有|含有)\\s*)(?=(?:\\d+\\s*(?:个\\s*)?)?'+ip+')','i');
const token='([+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
const amount=(text,unit,convert=()=>1)=>Array.from(text.matchAll(new RegExp('(?<![\\w.])(?<!\\d,)'+token+'\\s*('+unit+')','gi')),
 match=>Number(match[1].replaceAll(',',''))*convert(match[2]));
const bwUnit=/^(?:Mbit\/s|Mbps|Gbit\/s|Gbps)$/i;
const gbUnit=/^(?:GB|TB)$/i;
const hourUnit=/^(?:hours?|hrs?|小时)$/i;
const bwScale=unit=>/^g/i.test(unit)?1000:1;
const gbScale=unit=>/^t/i.test(unit)?1024:1;
const idle=/\b(?:unbound|idle|reservation|not bound)\b|未绑定|闲置|保留费/i;
const bound=/\b(?:bound|attached|assigned)\b|已绑定/i;
const traffic=/\b(?:outbound traffic|internet egress|egress|by traffic|traffic)\b|出公网流量|出网流量|按流量|公网流量/i;
const bandwidth=/\b(?:dedicated bandwidth|fixed bandwidth|by bandwidth|bandwidth)\b|公网带宽|按带宽|固定带宽/i;
const other=/\b(?:shared|static BGP|premium BGP|IPv6|inbound|95th percentile|data packages?)\b|共享带宽|静态\s*BGP|入网流量|流量包/i;
const referencePattern=/(?:^|[^\w])eip_ref\s*[:=]\s*([^\s,，;]*)/gi;
const referenceWord=/^[a-z\d][a-z\d_.-]{0,63}$/i;
const specEvidence={kind:'official-catalog',url:EIP_CATALOG_SOURCE,revision:'2026-11-19',section:'EU-Dublin Dynamic BGP EIP',billingSource:EIP_BILLING_SOURCE};
const specs={
 bandwidth:{specCode:'19_bgp',resourceType:'hws.resource.type.bandwidth',charge:'eipBandwidth'},
 traffic:{specCode:'12_bgp',resourceType:'hws.resource.type.bandwidth',charge:'eipTraffic'},
 reservation:{specCode:'5_bgp',resourceType:'hws.resource.type.ip',charge:'eipReservation'}
};

export function eipReference(row,text=row.specification){
 const refs=[...(row.huaweiEipRef?[row.huaweiEipRef]:[]),...Array.from(text.matchAll(referencePattern),m=>m[1])];
 if(refs.some(ref=>!referenceWord.test(ref))||new Set(refs).size>1)return {error:'HW_EIP_REFERENCE'};
 return {ref:refs[0]??''};
}

export function eipAttachment(row){
 if(!['ECS','ELB','NAT Gateway'].includes(row.service))return null;
 const text=row.specification.normalize('NFKC'),join=text.match(attachment);
 const reference=eipReference(row,text);
 if(!join)return reference.ref||reference.error?{base:text.replace(referencePattern,' '),specification:'EIP',reference}:null;
 return {base:text.slice(0,join.index).trim(),specification:text.slice(join.index+join[0].length).trim(),reference};
}

// Keep address reservation duration separate from bandwidth duration.
const idleHours=new RegExp('(?:\\b(?:unbound|idle|reservation)\\b|未绑定|闲置)\\s*(?:for\\s+|hours?\\s*[:=]\\s*|时长\\s*[:=]?\\s*)?'+token+'\\s*(?:hours?\\b|hrs?\\b|小时)','gi');

export function eipSelection(row,text){
 const reference=eipReference(row,text);
 if(reference.error||row.huaweiEipReferenceError)return {code:'HW_EIP_REFERENCE',charge:'eip'};
 text=text.replace(referencePattern,' ');
 const size=amount(text,'Gbit/s\\b|Gbps\\b|Mbit/s\\b|Mbps\\b',bwScale);
 const data=amount(text,'GB\\b|TB\\b',gbScale);
 const idleValues=Array.from(text.matchAll(idleHours),m=>Number(m[1].replaceAll(',','')));
 const hours=amount(text.replace(idleHours,' '),'hours?\\b|hrs?\\b|小时');
 const usage=row.usage,unit=row.unit??'';
 if(row.unitExplicit&&usage!=null){
  if(bwUnit.test(unit))size.push(usage*bwScale(unit));
  else if(gbUnit.test(unit))data.push(usage*gbScale(unit));
  else if(hourUnit.test(unit))hours.push(usage);
  else return {code:'HW_EIP_UNIT',charge:'eip'};
 }
 const fixed=size.length>0||bandwidth.test(text),flow=data.length>0||traffic.test(text),unbound=idle.test(text);
 const active=bound.test(text.replace(/\bnot bound\b/gi,'').replace(/未绑定/g,''));
 const meter=fixed?'bandwidth':flow?'traffic':unbound||active?'reservation':null;
 const charge=meter?specs[meter].charge:'eip';
 const fail=code=>({charge,code});
 if(other.test(text))return fail('HW_EIP_UNSUPPORTED');
 if(fixed&&flow||[size,data,hours,idleValues].some(values=>new Set(values).size>1||values.some(value=>!Number.isFinite(value)||value<0)))return fail('HW_EIP_CONFLICT');
 if(!meter)return fail('HW_EIP_PARAMETERS');
 const {specCode,resourceType}=specs[meter];
 const spec={service:'EIP',specCode,resourceType,eipMeter:meter,evidence:specEvidence};
 if(billingOf(row)!=='ONDEMAND'&&meter!=='bandwidth')return {...fail('HW_EIP_MODE'),specs:[spec]};
 if(usage!=null&&!row.unitExplicit&&!(data.includes(usage)||hours.includes(usage)||size.includes(usage)||idleValues.includes(usage)))return fail('HW_EIP_UNIT');
 if(meter==='bandwidth'&&(size[0]==null||!Number.isInteger(size[0])||size[0]<1||size[0]>2000))return fail('HW_EIP_BANDWIDTH');
 if(meter==='traffic'&&!data.length)return fail('HW_EIP_TRAFFIC_USAGE');
 if(meter==='traffic'&&hours.length)return fail('HW_EIP_TRAFFIC_PERIOD');
 if(meter==='traffic'&&row.unitExplicit&&usage!=null&&!gbUnit.test(unit))return fail('HW_EIP_UNIT');
 if(meter==='reservation'&&active&&unbound&&!idleValues.length)return fail('HW_EIP_IDLE_HOURS');
 const amountValue={bandwidth:hours[0],traffic:data[0],reservation:idleValues[0]??(unbound?hours[0]:active?0:undefined)}[meter];
 if(meter==='reservation'&&amountValue==null)return {...fail('HW_EIP_IDLE_HOURS'),specs:[spec]};
 const referenceHours=meter==='bandwidth'&&billingOf(row)==='ONDEMAND'&&amountValue==null&&row.scope==='resource'&&row.period==='monthly';
 const assumptions=['HW_EIP_DYNAMIC_BGP'];
 if(row.huaweiInheritedEipQuantity)assumptions.push('HW_EIP_PER_PARENT');
 if(meter==='bandwidth'&&referenceHours)assumptions.push('HW_EIP_REFERENCE_HOURS');
 if(meter==='traffic')assumptions.push('HW_EIP_OUTBOUND_TIERS');
 if(active&&!unbound)assumptions.push('HW_EIP_BOUND');
 else if(meter!=='reservation')assumptions.push('HW_EIP_RESERVATION_SEPARATE');
 const dimensions={meter,mbps:size[0],amount:amountValue,referenceHours,unbound,active,idleHours:idleValues[0]};
 return {specs:[spec],charge,dimensions,assumptions};
}

export function attachedEipRow(parent,attached){
 const text=attached.specification;
 const leading=text.match(/^(\d+)\s*(?:个\s*)?/);
 const explicitCount=text.match(/\b(?:EIP count|IP count)\s*[:=]\s*(\d+)\b|公网\s*IP\s*数量\s*[:=]\s*(\d+)\b/i);
 const quantity=leading?Number(leading[1]):explicitCount?Number(explicitCount[1]??explicitCount[2]):parent.targetQuantity??parent.quantity??parent.huaweiQuantity;
 const explicitMode=text.match(/(?:\bEIP billing\s*[:=]\s*|(?:华为云)?公网\s*IP\s*计费[:=]\s*)(on-demand|pay-per-use|monthly|yearly|按需|包月|包年)/i)?.[1];
 return {product:'EIP',specification:text,service:'EIP',targetBilling:explicitMode?targetMode(explicitMode):billingOf(parent),quantity,
  targetQuantity:null,capacity:null,usage:null,unit:'',unitExplicit:false,scope:'resource',period:parent.period,
  huaweiImportIssues:parent.huaweiImportIssues?.filter(key=>['product','specification','quantity','huawei_target_region'].includes(key)),
  huaweiTargetRegion:parent.huaweiTargetRegion,huaweiEipRef:attached.reference.ref??'',huaweiEipReferenceError:attached.reference.error,
  huaweiInheritedEipQuantity:!leading&&!explicitCount,accepted:false,targetId:''};
}
