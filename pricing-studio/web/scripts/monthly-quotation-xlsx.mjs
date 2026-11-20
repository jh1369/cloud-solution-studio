import {cost,finite} from '../public/engine.mjs';
import {reasonLabel,t} from '../public/i18n.mjs';
import {monthlyBudgetLines,monthlyBudgetTotal} from './monthly-budget.mjs';

const labels=['来源行号','AWS 服务/规格','华为云对应服务','问题类型','Assumption / 不确定性说明','费用影响','建议处理方式'];
const headerKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s_/()-]+/g,'');
const costColumns=['AWS每月 USD（7月实际）','AWS Monthly USD','AWS Actual USD','Actual USD','Unblended Cost USD',
 'lineItem/UnblendedCost','Unblended Cost','实际费用USD','账单费用USD','费用USD','实际费用','账单费用'].map(headerKey);
const quantityColumns=['数量','Quantity','Resource Count','Count','Average Quantity','平均数量'].map(headerKey);
const currencyColumns=['Currency','Currency Code','lineItem/CurrencyCode','币种','货币'].map(headerKey);
const moneyFormat='#,##0.00;[Red]-#,##0.00';
const quantityFormat='#,##0.###';
const rateFormat='#,##0.00##########';

function signedNumber(value){
 if(typeof value!=='number'&&typeof value!=='string'||String(value).trim()==='')return null;
 const raw=String(value).trim();
 const negative=raw.startsWith('-')||/^\(.+\)$/.test(raw);
 const unsigned=raw.replace(/^-|^\(|\)$/g,'');
 try{return (negative?-1:1)*finite(unsigned,'AWS source number');}catch{return null;}
}

export function monthlyWorkbookInput(XLSX,book,rows){
 const name=book.SheetNames.includes('Input')?'Input':book.SheetNames[0];
 const sheet=book.Sheets[name];
 const bounds=XLSX.utils.decode_range(sheet['!ref']);
 const values=Array.from(XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,blankrows:true}));
 const keys=(values[0]??[]).map(headerKey);
 const positions=values.slice(1).flatMap((cells,index)=>cells.some(cell=>cell!=null&&String(cell).trim()!=='')?[index+1]:[]);
 if(positions.length!==rows.length)throw Error('Unable to reconcile normalized rows with the original Input sheet.');
 const byHeader=names=>names.map(name=>keys.indexOf(name)).find(index=>index>=0)??-1;
 const currencyIndex=byHeader(currencyColumns),quantityIndex=byHeader(quantityColumns);
 const explicitCost=keys.findIndex(key=>/^aws每月usd\d{1,2}月实际$/.test(key));
 const costIndex=explicitCost>=0?explicitCost:byHeader(costColumns);
 const entries=positions.map((position,index)=>{
  const cells=values[position],currency=String(cells[currencyIndex]??'USD').trim().toUpperCase();
  const actual=currency&&currency!=='USD'?null:signedNumber(cells[costIndex]);
  return {line:rows[index].importSource?.row??bounds.s.r+position+1,
   quantity:signedNumber(cells[quantityIndex]),actual,
   actualIssue:actual===null?(currency&&currency!=='USD'?'AWS 原始行使用非 USD 币种。':'AWS 原始行缺少可识别的实际账单金额。'):null};
 });
 // Copy cell values and original number formats. Source formulas are retained as cached values.
 const original={'!ref':sheet['!ref'],'!merges':sheet['!merges']??[]};
 for(const [address,cell] of Object.entries(sheet)){
  if(!address.startsWith('!')&&cell.v!==undefined)original[address]={t:cell.t,v:cell.v,...(cell.z?{z:cell.z}:{})};
 }
 return {name,original,entries};
}

function appendTable(XLSX,book,name,values,widths,filterRows=values.length){
 const sheet=XLSX.utils.aoa_to_sheet(values);
 sheet['!cols']=widths.map(wch=>({wch}));
 if(filterRows>1)sheet['!autofilter']={ref:`A1:${XLSX.utils.encode_col(values[0].length-1)}${filterRows}`};
 XLSX.utils.book_append_sheet(book,sheet,name);
 return sheet;
}

function estimateDescription(row,item){
 if(item)return [item.service,item.sku,item.billingMode==='MONTHLY'?'官方包月':'官方按需',item.unit,
  item.cpu&&item.memory?`${item.cpu} vCPU / ${item.memory} GiB`:''].filter(Boolean).join(' | ');
 const suggestion=row?.huaweiAi?.display;
 return suggestion?`${row.service} | ${suggestion.sku} | Pending`:row?.service??'';
}

export function buildMonthlyWorkbook(XLSX,{input,rows,output,options}){
 const book=XLSX.utils.book_new(),notes=[labels],quotations=[[
  '大类','AWS 实例规格/计费项','数量',`AWS每月 USD（${options.monthlyBudget.month}月实际）`,
  '华为云对应实例/服务','华为云单价 USD/月/计费单位','华为云数量/月','华为云每月 USD（预估）','折扣'
 ]];
 const lines=monthlyBudgetLines(rows,output,options);
 for(const line of lines){
  const {row,index,result,charge,amount,rate,units,exclusion}=line;
  const source=rows[index],original=input.entries[index],related=row!==source;
  const aws=[source.product,source.specification].filter(Boolean).join(' | ');
  const chargeName=charge?t('charge.'+charge,'zh'):null;
  const awsLabel=related?`[来源行 ${original.line}] ${chargeName??source.service}`:source.specification||source.product;
  const target=estimateDescription(row,result.item)||chargeName||source.service;
  quotations.push([source.service,awsLabel,related?null:original.quantity,related?null:original.actual,target,rate,units,amount,
   options.monthlyBudget.discountSpecified?options.discount:null]);
  const add=(type,detail,impact,action)=>notes.push([original.line,aws,target,type,detail,impact,action]);
  if(!related&&original.actualIssue)add('AWS 实际金额',original.actualIssue,'AWS 金额留空','核对 AWS 账单列或币种。');
  if(amount!==null){
   const item=result.item;
   const calculation=`${item.rate} USD/${item.unit} × ${units} × (1 - ${options.discount}) = ${amount.toFixed(2)} USD`;
   add(item.billingMode==='MONTHLY'?'官方包月':'官方按需月度估算',
    `${calculation}。产品 ID ${item.productId}，核验时间 ${item.verifiedAt}，来源 ${item.sourceUrl}${item.specificationSource?'；规格 '+item.specificationSource:''}`,
    amount,result.billingMode==='MONTHLY'?'核对目标整月实例数或容量。':'核对目标月度计量及单位。');
   if(row?.monthlyQuantityNote)add('包月数量假设',row.monthlyQuantityNote,amount,'根据目标峰值和调度策略确认。');
  }else{
   const message=exclusion||reasonLabel(result)||result.reasonCode||'缺少可核验的价格、SKU 或计量。';
   const accounted=['Included','Linked'].includes(result.status);
   add(accounted?'费用关联':'Pending',message,accounted?'已计入关联行':'未计入预算','核对费用覆盖及所需的目标计量或官方费率。');
  }
  const codes=new Set([...(row?.huaweiAssumptions??[]),...(row?.huaweiConditions??[]),row?.huaweiUsageAssumption].filter(Boolean));
  for(const reasonCode of codes){
   const explanation=reasonLabel({reasonCode});
   if(explanation)add('估算假设',explanation,amount??'未计入预算','确认后重新运行报价。');
  }
  const recommendation=row?.huaweiAi?.recommendation??row?.monthlyRecommendation;
  if(recommendation){
   const detail=[recommendation.reason,...recommendation.differences,...recommendation.assumptions,
    ...(recommendation.missing.length?['待补：'+recommendation.missing.join(', ')]:[])].join(' ');
   add('Codex 建议',detail,amount??'未计入预算','核对选型和计量假设。');
  }
 }
 const actuals=input.entries.flatMap(entry=>entry.actual==null?[]:[entry.actual]);
 const awsCents=actuals.reduce((sum,value)=>sum+BigInt(Math.sign(value))*BigInt(Math.round(cost(1,1,Math.abs(value)).monthly*100)),0n);
 if(awsCents>BigInt(Number.MAX_SAFE_INTEGER)||awsCents<-BigInt(Number.MAX_SAFE_INTEGER))throw Error('AWS subtotal exceeds the supported precision range.');
 quotations.push(['总计',null,null,actuals.length?Number(awsCents)/100:null,null,null,null,monthlyBudgetTotal(lines),null]);
 notes.push([null,input.name,'Huawei EU-Dublin / USD','账期与合计',
  `${options.monthlyBudget.billingMonth??'月份标注用于模板'}；完整账期小时数 ${options.monthlyBudget.periodHours??'未确认'}。AWS 按显示到分的各行金额汇总；Huawei 仅合计已估价行。`,
  monthlyBudgetTotal(lines),'核验时间及费率见各来源行。']);
 const source=XLSX.utils.decode_range(input.original['!ref']);
 if(source.e.r>source.s.r)input.original['!autofilter']={ref:input.original['!ref']};
 XLSX.utils.book_append_sheet(book,input.original,'Input');
 const quote=appendTable(XLSX,book,'AWS-Huawei Quotation',quotations,[17,53,13,24,59,28,21,24,13],quotations.length-1);
 const assumptions=appendTable(XLSX,book,'Assumptions & Pending',notes,[14,43,45,18,94,19,49]);
 for(let i=2;i<=quotations.length;i++){
  for(const [column,format] of [['C',quantityFormat],['D',moneyFormat],['F',rateFormat],['G',quantityFormat],['H',moneyFormat],['I','0.00%']]){
   if(quote[column+i]?.t==='n'){
    quote[column+i].z=column==='F'?format+'" / '+lines[i-2].result.item.unit+'"':format;
   }
  }
 }
 for(let i=2;i<=notes.length;i++)if(assumptions['F'+i]?.t==='n')assumptions['F'+i].z=moneyFormat;
 return formatWorkbook(XLSX,XLSX.write(book,{bookType:'xlsx',type:'buffer'}),source.s.r+1);
}

// SheetJS CE writes numbers and filters. Add OOXML view and header styles to its generated workbook.
function formatWorkbook(XLSX,bytes,inputHeader){
 const archive=XLSX.CFB.read(bytes,{type:'buffer'});
 const change=(path,transform)=>{
  const entry=XLSX.CFB.find(archive,path);
  entry.content=Buffer.from(transform(Buffer.from(entry.content).toString('utf8')));
  entry.size=entry.content.length;
 };
 let blue,orange;
 change('/xl/styles.xml',xml=>{
  const append=(tag,items)=>xml=xml.replace(new RegExp(`(<${tag} count=")(\\d+)(">[\\s\\S]*?)(</${tag}>)`),
   (_,start,count,inner,end)=>start+(Number(count)+items.length)+inner+items.join('')+end);
  const font=Number(xml.match(/<fonts count="(\d+)"/)[1]);
  const fill=Number(xml.match(/<fills count="(\d+)"/)[1]);
  blue=Number(xml.match(/<cellXfs count="(\d+)"/)[1]);
  orange=blue+1;
  append('fonts',['<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
   '<font><b/><sz val="12"/><color rgb="FF4F310D"/><name val="Calibri"/></font>']);
  append('fills',['FF245C9D','FFFCE4CF'].map(rgb=>
   `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`));
  append('cellXfs',[0,1].map(i=>`<xf numFmtId="0" fontId="${font+i}" fillId="${fill+i}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`));
  return xml;
 });
 for(const [index,row] of [[1,inputHeader],[2,1],[3,1]]){
  change(`/xl/worksheets/sheet${index}.xml`,xml=>xml
   .replace(/<sheetView workbookViewId="0"\s*\/>/,
    `<sheetView workbookViewId="0"><pane ySplit="${row}" topLeftCell="A${row+1}" activePane="bottomLeft" state="frozen"/></sheetView>`)
   .replace(/<c r="([A-Z]+)(\d+)"([^>]*)>/g,(cell,column,number,attributes)=>Number(number)!==row?cell:
    `<c r="${column}${number}" s="${index===2&&/^[E-I]$/.test(column)?orange:blue}"${attributes.replace(/ s="\d+"/,'')}>`));
 }
 return XLSX.CFB.write(archive,{type:'buffer',fileType:'zip',compression:true});
}
