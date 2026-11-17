import {calculate,REGION,BILLING_MODES,billingOf} from './engine.mjs';
export function buildWorkbook(XLSX,rows,catalog,opts,projectName){
 const output=rows.map(row=>calculate(row,catalog,opts)),book=XLSX.utils.book_new();
 const add=(name,data)=>{
  const sheet=XLSX.utils.aoa_to_sheet(data);
  sheet['!cols']=data[0].map((_,i)=>({wch:Math.min(70,Math.max(14,...data.map(row=>String(row[i]??'').length+2)))}));
  sheet['!autofilter']={ref:sheet['!ref']};
  for(const key of Object.keys(sheet)){if(key.startsWith('!'))continue;const cell=sheet[key];if(typeof cell.v==='string'){cell.t='s';delete cell.f;}}
  XLSX.utils.book_append_sheet(book,sheet,name);
 };
 add('Input',[
  ['Row','Product','Specification','AWS Region','Resource Count','Usage','Unit','Usage Scope','Usage Period','AWS Billing Method','Source Page','Target Quantity','Huawei Billing Mode','Capacity GB'],
  ...rows.map((row,i)=>[i+1,row.product,row.specification,row.region,row.quantity,row.usage,row.unit,row.scope,row.period,row.billing,row.sourcePage??null,row.targetQuantity??null,billingOf(row),row.capacity??null])
 ]);
 add('Service Mapping',[
  ['Row','AWS Product','Target Service','Target SKU','Target Description','Region','Confirmed','Notes','Huawei Billing Mode','Target Quantity'],
  ...rows.map((row,i)=>{const price=catalog.items.find(p=>p.id===row.targetId);return[i+1,row.product,row.service,price?.sku??null,price?.description??null,REGION,row.accepted?'Yes':'No',row.notes,BILLING_MODES[billingOf(row)]??row.targetBilling,row.targetQuantity??row.quantity];})
 ]);
 add('Public Pricing',[
  ['Row','Price Status','Product ID','SKU','Unit Price','Currency','Unit','Verified At','Official Source','Official Evidence','Huawei Billing Mode','Verified Period Type','Verified Period Count'],
  ...rows.map((row,i)=>{const price=catalog.items.find(p=>p.id===row.targetId),fresh=price&&new Date(price.verifiedAt).getTime()+catalog.ttlDays*86400000>Date.now()&&(price.billingMode||'ONDEMAND')===billingOf(row);return[i+1,fresh?'Valid':'Pending',price?.productId??null,price?.sku??null,fresh?price.rate:null,price?.currency??null,price?.unit??null,price?.verifiedAt??null,price?.sourceUrl??null,price?JSON.stringify(price.evidence):null,BILLING_MODES[billingOf(row)]??row.targetBilling,price?.periodType??null,price?.periodNum??null];})
 ]);
 add('Quotation',[
  ['Row','Target Service','Status','Monthly Public or Amortized USD','Discount Fraction','Monthly Scenario or Amortized USD','Annual Scenario USD','Source Period Public USD','Source Period Scenario USD','Reason','Huawei Billing Mode','Contract Term','Term Public USD','Term Scenario USD','Prepaid First Term Scenario USD','Annual Basis'],
  ...rows.map((row,i)=>{const result=output[i],mode=billingOf(row);return[i+1,row.service,result.status,result.status==='Valid'?result.monthly:null,opts.discount,result.status==='Valid'?result.scenario:null,result.status==='Valid'?result.annual:null,result.status==='Period'?result.monthly:null,result.status==='Period'?result.scenario:null,result.reason,BILLING_MODES[mode]??row.targetBilling,result.termLabel??null,result.termPublic,result.termScenario,result.upfrontScenario,mode==='YEARLY'?'Independent official 1-year price; monthly figure is amortized':mode==='MONTHLY'?'12 repeated monthly contracts; not a yearly subscription price':'12 repeated months of usage; not a yearly subscription price'];})
 ]);
 const monthly=output.filter(result=>result.status==='Valid'),period=output.filter(result=>result.status==='Period'),prepaid=output.filter(result=>result.upfrontScenario!==null);
 add('Assumptions',[
  ['Item','Value'],['Project',projectName],['Exported At',new Date().toISOString()],['Region',REGION],['Currency','USD'],['Discount',opts.discount],['Reference hours / month',opts.hours],
  ['AWS vs Huawei','AWS source billing is retained only for traceability. Huawei target billing is selected independently: pay-per-use, monthly or yearly.'],
  ['Pricing','Each target billing mode is independently verified using officialWebsiteAmount. No multiplication of hourly prices to invent subscription prices. Snapshots expire after 7 days.'],
  ['Subscription terms','Monthly = verified 1-month subscription; yearly = verified 1-year subscription. Quantities and per-disk capacities must be explicit.'],
  ['Annual basis','Yearly uses its independent annual price. Pay-per-use/monthly annual scenarios repeat the monthly plan 12 times.'],
  ['Monthly equivalent','For yearly subscriptions, monthly figures are annual price / 12 for comparison, not a monthly payment option.'],
  ['Prepayment','First-term prepaid subtotal includes one month of monthly contracts and one year of yearly contracts. Pay-per-use is postpaid and excluded.'],
  ['Source period','Aggregate usage does not imply resource count or volume capacity. Never infer subscription quantities from instance-hours.'],
  ['Storage conversion','Only pay-per-use uses GB-month × reference hours => GB-hour. Monthly/yearly EVS uses explicit per-disk GB capacity × verified subscription rate.'],
  ['Mapping','User-confirmed proposed target design, not guaranteed AWS/Huawei feature equivalence.'],
  ['Coverage',`${monthly.length} monthly-reference, ${period.length} source-period, ${rows.length-monthly.length-period.length} Pending`],
  ['Monthly equivalent partial subtotal USD',monthly.length?monthly.reduce((s,result)=>s+result.scenario,0):null],
  ['Source period partial subtotal USD',period.length?period.reduce((s,result)=>s+result.scenario,0):null],
  ['Prepaid first-term partial subtotal USD',prepaid.length?prepaid.reduce((s,result)=>s+result.upfrontScenario,0):null],
  ['Totals','Partial subtotals exclude Pending. They are not complete quotes.'],
  ['Exclusions','Tax, FX, support, migration, and unlisted disk/network/log/license/ancillary resources.'],
  ['Privacy','Original files parsed locally in browser; not stored by site.']
 ]);
 return book;
}
