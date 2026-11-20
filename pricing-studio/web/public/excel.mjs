import {calculate,REGION,billingOf,priceValidation,mappingReview,sumMoney,huaweiProductSpecIssue,huaweiQuoteLines,EIP_BILLING_SOURCE,huaweiBudget,huaweiBudgetAmounts} from './engine.mjs';
import {billingLabel,translateMessage,reasonLabel,mappingLabel,t} from './i18n.mjs';
import {TCP_QUOTE_REGION,tcpQuoteRows,tcpQuoteTotals} from './providers.mjs';

function tcpWorkbook(add,rows,catalog,opts,projectName,language){
 const output=opts.output??tcpQuoteRows(rows,catalog,opts),state=opts.updateState;
 const status=result=>t(result.status==='Pending'?'tcp.quote.pending':'tcp.quote.priced',language);
 const reason=result=>reasonLabel(result,language)||null;
 const totals=tcpQuoteTotals(output);
 add('Input',[
  ['Row','Product','Specification','AWS Region','Resource Count','Usage','Unit','Usage Scope','Usage Period','AWS Billing Method','Source Page','Target Quantity','tcp_target_sku','tcp_target_region','tcp_target_billing'],
  ...rows.map((row,i)=>[i+1,row.product,row.specification,row.region,row.quantity,row.usage,row.unitExplicit?row.unit:null,row.scope,row.period,row.billing,row.sourcePage??null,row.targetQuantity??null,row.tcpTarget||null,row.tcpTargetRegion||null,row.tcpTargetBilling||'ONDEMAND'])
 ]);
 add('Service Mapping',[
  ['Row','AWS Product','Target Service','Target SKU / Product','Region','Status','Mapping Basis','Review Reason'],
  ...output.map((result,i)=>[i+1,rows[i].product,result.mapping.service??null,result.mapping.sku??null,TCP_QUOTE_REGION,status(result),result.mapping.basis??null,reason(result)])
 ]);
 add('Public Pricing',[
  ['Row','Price Status','Target SKU / Product','Unit Price','Currency','Unit','Verified At','Official Source','PDF Pages','Source SHA-256','Catalog Version','Catalog SHA-256','Official Evidence','Review Reason'],
  ...output.map((result,i)=>{const item=result.item;return [
   i+1,status(result),result.mapping.sku??null,item?.amount??null,'EUR',item?.unit??null,item?state.lastVerifiedAt:null,item?.evidence.url??null,item?.evidence.pages.join(', ')??null,item?.evidence.sha256??null,item?catalog.versionId:null,item?state.catalog?.sha256??null:null,item?JSON.stringify(item.evidence):null,reason(result)
  ];})
 ]);
 add('Quotation',[
  ['Row','Target Service','Status','Billing Mode','Usage Period','Target Quantity','Billable Usage','Unit','Currency','Monthly Amount EUR','Source Period Amount EUR','Review Reason'],
  ...output.map((result,i)=>[i+1,result.mapping.service??null,status(result),'OPEN_ELASTIC',rows[i].period,result.quantity??null,result.effectiveUsage??null,result.item?.unit??null,'EUR',result.status==='Valid'?result.termPublic:null,result.status==='Period'?result.termPublic:null,reason(result)])
 ]);
 add('Assumptions',[
  ['Item','Value'],['Project',projectName],['Exported At',new Date(opts.now??Date.now()).toISOString()],['Region',TCP_QUOTE_REGION],['Currency','EUR'],
  ['Catalog version',state?.currentVersion??null],['Catalog SHA-256',state?.catalog?.sha256??null],['Last successful verification',state?.lastVerifiedAt??null],
  ['Priced rows',totals.ready],['Needs review',totals.pendingCount],['Priced monthly subtotal EUR',totals.monthly],['Priced source-period subtotal EUR',totals.period],
  ['Pricing','Official TCP EU-DE Open Elastic rate multiplied by confirmed usage and quantity. Aggregate usage is charged once. Subtotals sum line cents.'],
  ['Usage periods','Monthly and source-period subtotals are separate. Review amounts are blank.'],
  ['Exclusions','Tax, FX, support, licensing, RDS storage and backup, and other unlisted charges.']
 ]);
}

export function buildWorkbook(XLSX,rows,catalog,opts,projectName){
 const book=XLSX.utils.book_new(),language=opts.language||'zh';
 const add=(name,data)=>{
  const sheet=XLSX.utils.aoa_to_sheet(data);
  sheet['!cols']=data[0].map((_,i)=>({wch:Math.min(70,Math.max(14,...data.map(row=>String(row[i]??'').length+2)))}));
  sheet['!autofilter']={ref:sheet['!ref']};
  for(const key of Object.keys(sheet)){if(key.startsWith('!'))continue;const cell=sheet[key];if(typeof cell.v==='string'){cell.t='s';delete cell.f;}}
  XLSX.utils.book_append_sheet(book,sheet,name);
 };
 if(opts.provider==='tcp'){
  tcpWorkbook(add,rows,catalog,opts,projectName,language);
  return book;
 }
 const output=opts.output??rows.map(row=>calculate(row,catalog,opts)),lines=huaweiQuoteLines(rows,output);
 const budget=opts.delivery==='offline'?null:huaweiBudget(rows,output);
 const mapped=lines.filter(line=>line.row),includeSpec=mapped.some(({row})=>row.huaweiProductMatch);
 const includeCharge=lines.some(line=>line.charge),includeEip=mapped.some(({row})=>row.service==='EIP');
 const includeAnalysis=rows.some(row=>row.awsInventory||row.semanticInventory);
 const includeMigration=rows.some(row=>row.huaweiMigration);
 const mappingOrigin=row=>row.huaweiSelection==='manual'||row.huaweiDesign?.candidateId?'Manual':
  row.huaweiAi?.display?'AI Suggested':row.targetId?'Rule-based':null;
 const aiDetails=row=>{
  const ai=row.huaweiAi;
  return ai?.display?JSON.stringify({sku:ai.display.sku,specification:ai.display.description,
   ...(ai.manualId?{originalRecommendation:ai.recommendation.selection}:{}),reason:ai.recommendation.reason,
   differences:ai.recommendation.differences,assumptions:ai.recommendation.assumptions,missing:ai.display.missing,
   budgetAssumptions:row.huaweiConditions?.map(reasonCode=>reasonLabel({reasonCode},language))}):null;
 };
 const detailedCharges=includeEip||includeMigration;
 const chargeLabel=charge=>charge?t('charge.'+charge,language):null;
 add('Input',[
  ['Row','Product','Specification','AWS Region','Resource Count','Usage','Unit','Usage Scope','Usage Period','AWS Billing Method','Source Page','Target Quantity','Huawei Billing Mode','Capacity GB','Source Sheet','Source Row','Original Fields','Source Header Row','Original Headers','Requested Huawei Target Region',...(includeEip?['eip_ref']:[]),...(includeAnalysis?['Field Sources','Model Row Classification']:[]),
   ...(includeMigration?['AWS Meter','Source Node Hours','Source Average Nodes']:[])],
  ...rows.map((row,i)=>[i+1,row.product,row.specification,row.region,row.quantity,row.usage,row.unit,row.scope,row.period,row.billing,
   row.sourcePage??null,row.targetQuantity??null,billingOf(row),row.capacity??null,row.importSource?.sheet??null,
   row.importSource?.row??null,row.importSource?JSON.stringify(row.importSource.cells):null,row.importSource?.headerRow??null,
   row.importSource?.headers?JSON.stringify(row.importSource.headers):null,row.huaweiTargetRegion||null,...(includeEip?[row.huaweiEipRef||null]:[]),
   ...(includeAnalysis?[row.importSource?.fieldSources?JSON.stringify(row.importSource.fieldSources):null,row.importSource?.classification??null]:[]),
   ...(includeMigration?[row.huaweiMigration?.meter?.basis??null,row.huaweiMigration?.metering?.sourceNodeHours??null,
    row.huaweiMigration?.metering?.sourceAverageNodes??null]:[])])
 ]);
 add('Service Mapping',[
  ['Row','AWS Product','Target Service','Target SKU','Target Description','Region','Confirmed','Notes','Huawei Billing Mode','Target Quantity','Mapping Review','Match and Assumptions',...(includeSpec?['Product Spec Evidence']:[]),...(detailedCharges?['Charge']:[]),...(includeAnalysis?['Official AWS Source Type','Source vCPU','Source Memory GiB','Source Architecture','Source Specification Evidence','Huawei Candidate SKUs','Conditions']:[]),
   ...(includeMigration?['Source Attributes and Evidence','Target Design and Origins','Candidate Evidence','Target DCS Instance Quantity','Target DCS Instance Hours','Single-Node Comparison']:[]),
   'Match Source','AI Budget Design'],
  ...mapped.map(({row,index,charge,result})=>{
   const price=catalog.items.find(p=>p.id===row.targetId),match=row.huaweiProductMatch;
   const selected=match?.selected,candidates=match?.candidates?.slice(0,12);
   const productEvidence=selected||candidates?.length?JSON.stringify({selected,candidates}):null;
   const aws=row.awsProfile;
   const migration=row.huaweiMigration,meter=migration?.metering;
   const confirmed=migration?['Valid','Period'].includes(result.status):row.accepted&&!['Linked','Conditional'].includes(result.status);
   return [index+1,row.product,row.service,price?.sku??row.huaweiAi?.display?.sku??null,match?null:price?.description??row.huaweiAi?.display?.description??null,REGION,confirmed?'Yes':'No',translateMessage(row.notes,language),
    billingLabel(billingOf(row),language),row.targetQuantity??row.quantity??row.huaweiQuantity,mappingReview(row,price).map(issue=>mappingLabel(issue,language)).join(' '),
    [...(row.huaweiAssumptions??[]),row.huaweiUsageAssumption].filter(Boolean).map(reasonCode=>reasonLabel({reasonCode},language)).join(' '),...(includeSpec?[productEvidence]:[]),...(detailedCharges?[chargeLabel(charge)]:[]),
    ...(includeAnalysis?[aws?.type??null,aws?.cpu??null,aws?.memory??null,aws?.architecture??null,
     aws?JSON.stringify({...aws.evidence,operatingSystem:row.awsOS}):null,row.huaweiCandidates?.join(', ')??null,
     row.huaweiConditions?.map(reasonCode=>reasonLabel({reasonCode},language)).join(' ')??null]:[]),
    ...(includeMigration?[migration?JSON.stringify(migration.source):null,migration?.settings?JSON.stringify(migration.settings):null,
     row.huaweiRanked?.length?JSON.stringify(row.huaweiRanked.map(({item,cpu,memory,capacity,category})=>({
      sku:item.sku,cpu:item.cpu,memory:item.memory,capacity,category,cpuRatio:cpu,memoryRatio:memory,rate:item.rate,unit:item.unit,
      officialSource:item.sourceUrl,verifiedAt:item.verifiedAt} ))):null,
     meter?.targetInstanceQuantity??null,meter?.targetInstanceHours??null,migration?.comparison?
      JSON.stringify({sku:migration.comparison.sku,rate:migration.comparison.rate,unit:migration.comparison.unit}):null]:[]),
    mappingOrigin(row),charge&&!['rdsInstance','dcsInstance','cssNode'].includes(charge)?null:aiDetails(row)];
  })
 ]);
 add('Public Pricing',[
  ['Row','Price Status','Product ID','SKU','Unit Price','Currency','Unit','Verified At','Official Source','Official Evidence','Huawei Billing Mode','Verified Period Type','Verified Period Count',...(detailedCharges?['Charge']:[]),...(includeMigration?['Target Specification Source']:[])],
  ...mapped.map(({row,index,charge,result})=>{
   const aiCandidate=!row.targetId&&row.huaweiAi?.display;
   const price=catalog.items.find(p=>p.id===(row.targetId||aiCandidate?.id)),specIssue=huaweiProductSpecIssue(row,price);
   const fresh=price&&!specIssue&&result.status!=='Linked'&&priceValidation(price,catalog,opts).valid&&(price.billingMode||'ONDEMAND')===billingOf(row);
   return [index+1,result.status==='Linked'?'Linked':fresh?(aiCandidate?'Candidate':'Valid'):'Pending',price?.productId??null,price?.sku??null,fresh?price.rate:null,price?.currency??null,price?.unit??null,
    specIssue?null:price?.verifiedAt??null,specIssue?null:price?.sourceUrl??null,price&&!specIssue?JSON.stringify(price.evidence):null,
    billingLabel(billingOf(row),language),price?.periodType??null,price?.periodNum??null,...(detailedCharges?[chargeLabel(charge)]:[]),
    ...(includeMigration?[price?.specificationSource??null]:[])];
  })
 ]);
 add('Quotation',[
  ['Row','Target Service','Status','Monthly Public or Amortized USD','Discount Fraction','Monthly Scenario or Amortized USD','Annual Scenario USD','Source Period Public USD','Source Period Scenario USD','Reason','Huawei Billing Mode','Contract Term','Term Public USD','Term Scenario USD','Prepaid First Term Scenario USD','Annual Basis',...(includeCharge?['Charge']:[]),...(includeEip?['Bandwidth Mbit/s','Billable Usage','Billed Quantity','Rate Unit','Linked Row']:[]),...(includeAnalysis?['Conditional Scenario USD','Conditional Basis']:[]),
   ...(includeMigration?['Target Billable Usage','Target Rate Unit','Reason Code']:[]),
   ...(budget?['Budget Source Period USD','Budget Monthly Equivalent USD','Budget Annual Scenario USD','Budget First-Term Prepaid USD']:[])],
  ...lines.map(({row,index,charge,result})=>{
   const mode=row?billingOf(row):null;
   const priced=['Valid','Period'].includes(result.status);
   const estimate=budget?huaweiBudgetAmounts(result):null;
   return [index+1,row?.service??(charge==='eipReservation'?'EIP':rows[index].service),result.status,result.status==='Valid'?result.monthly:null,row?opts.discount:null,
    result.status==='Valid'?result.scenario:null,result.status==='Valid'?result.annual:null,result.status==='Period'?result.monthly:null,
    result.status==='Period'?result.scenario:null,reasonLabel(result,language),mode?billingLabel(mode,language):null,
    result.termLabel?translateMessage(result.termLabel,language):null,result.termPublic,result.termScenario,result.upfrontScenario,
    mode==='YEARLY'?'Independent official 1-year price; monthly figure is amortized':mode==='MONTHLY'?'12 repeated monthly contracts; not a yearly subscription price':mode?'12 repeated months of usage; not a yearly subscription price':null,
    ...(includeCharge?[chargeLabel(charge)]:[]),...(includeEip?[row?.huaweiEip?.mbps??null,priced?result.effectiveUsage??null:null,
     priced?result.quantity??null:null,priced?result.item?.unit??null:null,result.linkedRow??null]:[]),
    ...(includeAnalysis?[result.conditionalScenario??null,result.conditionalPeriod??null]:[]),
    ...(includeMigration?[row?.huaweiMigration?result.effectiveUsage??null:null,
     row?.huaweiMigration?result.item?.unit??null:null,result.reasonCode??null]:[]),
    ...(estimate?[estimate.sourcePeriod,estimate.monthly,estimate.annual,estimate.prepaid]:[])];
  })
 ]);
 const results=lines.map(line=>line.result),monthly=results.filter(result=>result.status==='Valid'),period=results.filter(result=>result.status==='Period'),prepaid=results.filter(result=>result.upfrontScenario!==null);
 const estimates=results.filter(result=>result.status==='Conditional');
 const monthlyEstimates=estimates.filter(result=>result.conditionalPeriod!=='source-period');
 const periodEstimates=estimates.filter(result=>result.conditionalPeriod==='source-period');
 add('Assumptions',[
  ['Item','Value'],['Project',projectName],['Exported At',new Date().toISOString()],['Region',REGION],['Currency','USD'],['Discount',opts.discount],['Reference hours / month',opts.hours],
  ['Delivery',opts.delivery==='offline'?'Offline single HTML; embedded official snapshot, original expiry enforced, no live refresh.':'Web + Worker'],
  ['AWS vs Huawei','AWS source billing is retained only for traceability. Huawei target billing is selected independently: pay-per-use, monthly or yearly.'],
  ['Pricing','Each target billing mode is independently verified using officialWebsiteAmount. No multiplication of hourly prices to invent subscription prices. Snapshots expire after 7 days.'],
  ...(includeSpec?[['Product specifications',t('resource.hwSpecPurchase',language)]]:[]),
  ...(lines.length>rows.length?[['Related charges','Quotation rows with the same Row number refer to one input resource. Linked rows point to the single billed row.']]:[]),
  ...(includeEip?[['EIP rates','Outbound traffic uses graduated monthly tiers. Public Pricing shows the 1 GB sample and exposes verified boundary inquiries.'],['EIP billing source',EIP_BILLING_SOURCE]]:[]),
  ['Subscription terms','Monthly = verified 1-month subscription; yearly = verified 1-year subscription. Quantities and per-disk capacities must be explicit.'],
  ['Annual basis','Yearly uses its independent annual price. Pay-per-use/monthly annual scenarios repeat the monthly plan 12 times.'],
  ['Monthly equivalent','For yearly subscriptions, monthly figures are annual price / 12 for comparison, not a monthly payment option.'],
  ['Rounding','HALF_UP to USD cents per line. Annual pay-per-use/monthly scenarios use unrounded monthly calculations × 12, then round once; yearly amortization rounds each annual term / 12. Subtotals sum displayed line cents. Annual scenarios are estimates, not invoicing guarantees.'],
  ['Prepayment','First-term prepaid subtotal includes one month of monthly contracts and one year of yearly contracts. Pay-per-use is postpaid and excluded.'],
  ['Source period','Aggregate usage does not imply resource count or volume capacity. Never infer subscription quantities from instance-hours.'],
  ['Storage conversion','Only pay-per-use uses GB-month × reference hours => GB-hour. Monthly/yearly EVS uses explicit per-disk GB capacity × verified subscription rate.'],
  ['Mapping','User-confirmed proposed target design, not guaranteed AWS/Huawei feature equivalence.'],
  ['Coverage',`${monthly.length} monthly-reference, ${period.length} source-period, ${results.filter(result=>result.status==='Pending').length} Pending`],
  ...(budget?[
   ['Estimated Budget Coverage',`${budget.priced} / ${budget.input}`],
   ['Estimated Budget Scope',t(budget.unpriced||budget.excludedCharges?'budget.partial':'budget.complete',language)],
   ['Unpriced Resource Rows',budget.unpriced],['Excluded Related Charges',budget.excludedCharges],
   ['Estimated Budget Source Period USD',budget.sourcePeriod],['Estimated Budget Monthly Equivalent USD',budget.monthly],
   ['Estimated Budget Annual Scenario USD',budget.annual],['Estimated Budget First-Term Prepaid USD',budget.prepaid],
   ['Budget Basis',t('budget.detail',language)],
   ...['Rule-based','AI Suggested','Manual'].map(origin=>[origin+' priced rows',rows.filter((row,index)=>
    mappingOrigin(row)===origin&&output[index].status!=='Pending').length]),
   ...rows.flatMap((row,index)=>aiDetails(row)?[[`AI budget design (row ${index+1})`,aiDetails(row)]]:[]),
   ...(opts.storageBudget?.RDS?[['RDS Budget Storage GiB per Instance',opts.storageBudget.RDS]]:[]),
   ...(opts.storageBudget?.CSS?[['CSS Budget Storage GiB per Node',opts.storageBudget.CSS]]:[]),
   ...budget.assumptions.map(([code,count])=>[code,t('budget.assumptionLine',{text:reasonLabel({reasonCode:code},language),count},language)])
  ]:[]),
  ...(includeAnalysis?[['Conditional estimates',estimates.length],
   ['Conditional monthly equivalent USD',monthlyEstimates.length?sumMoney(monthlyEstimates.map(result=>result.conditionalMonthly)):null],
   ['Conditional source-period subtotal USD',periodEstimates.length?sumMoney(periodEstimates.map(result=>result.conditionalScenario)):null]]:[]),
  ['Monthly equivalent partial subtotal USD',monthly.length?sumMoney(monthly.map(result=>result.scenario)):null],
  ['Annual scenario partial subtotal USD',monthly.length?sumMoney(monthly.map(result=>result.annual)):null],
  ['Source period partial subtotal USD',period.length?sumMoney(period.map(result=>result.scenario)):null],
  ['Prepaid first-term partial subtotal USD',prepaid.length?sumMoney(prepaid.map(result=>result.upfrontScenario)):null],
  ['Totals','Partial subtotals exclude Pending. They are not complete quotes.'],
  ['Exclusions','Tax, FX, support, migration, and unlisted disk/network/log/license/ancillary resources.'],
  ['Privacy','Original files parsed locally in browser; not stored by site.']
 ]);
 return book;
}
