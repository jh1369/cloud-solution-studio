import {SERVICES,billingOf,priceValidation,mappingReview,sumMoney,huaweiProductSpecIssue,huaweiQuoteLines,relatedHuaweiCharges} from './engine.mjs';
import {t,billingLabel,unitLabel,dateLabel,serviceLabel,translateMessage,reasonLabel,mappingLabel} from './i18n.mjs';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=(value,currency='USD')=>value===null||value===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency,minimumFractionDigits:2}).format(value);
export const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const COLORS=['#c36bf1','#e8b775','#78cbb6','#8c90e6','#e790bf','#a5baca'];
export function emptyResources(language='zh'){
 const T=(key,vars)=>t(key,language,vars);
 return `<div class="empty-state"><div class="empty-art">${icon('map')}</div><h3>${T('empty.title')}</h3><p>${T('empty.text')}</p><button class="text-button" data-sample>${T('empty.sample')} →</button></div>`;
}
export function tcpResourceHTML(rows,output,state,language='zh',page=0){
 const T=(key,vars)=>t(key,language,vars),E=escapeHTML;
 return rows.slice(page*10,page*10+10).map((row,index)=>{
  const result=output[page*10+index],price=result.item,sku=result.mapping.sku;
  const pending=result.status==='Pending',aggregate=row.scope==='aggregate';
  const number=(label,field,value)=>`<label><span>${E(T(label))}</span><input type="number" min="0" step="any" data-field="${field}" value="${E(value??'')}"></label>`;
  return `<article class="resource-row" data-id="${E(row.id)}">
   <div class="resource-head"><span class="service-icon">${icon(row.service==='EVS'?'layers':'server')}</span><div class="resource-name">${E(row.product)}<small>${E(row.specification)}${row.region?' · '+E(row.region):''}</small></div><span class="badge ${pending?'pending':'valid'}">${T(pending?'tcp.quote.pending':'tcp.quote.priced')}</span><button class="delete-row" data-delete="${E(row.id)}" aria-label="${T('resource.delete')}">×</button></div>
   <div class="field-grid">
    <label><span>${T('tcp.quote.sourceSpec')}</span><input data-field="specification" value="${E(row.specification)}"></label>
    <label><span>${T('tcp.quote.sku')}</span><input data-field="tcpTarget" value="${E(row.tcpTarget??'')}" placeholder="${E(sku??'')}"></label>
    ${aggregate?'':number('resource.quantity','targetQuantity',row.targetQuantity??row.quantity)}
    ${number(aggregate?'resource.aggregateUsage':'resource.monthlyUsage','usage',row.usage)}
    <label><span>${T('resource.unit')}</span><select data-field="unit">${[...new Set([row.unit,'','hour','GiB-month'])].map(unit=>`<option value="${E(unit)}" ${unit===row.unit&&row.unitExplicit||!unit&&!row.unitExplicit?'selected':''}>${E(unit||T('resource.unspecified'))}</option>`).join('')}</select></label>
    <label><span>${T('resource.period')}</span><select data-field="period"><option value="monthly" ${row.period==='monthly'?'selected':''}>${T('resource.fullMonth')}</option><option value="source-period" ${row.period==='source-period'?'selected':''}>${T('resource.sourcePeriod')}</option></select></label>
    ${row.tcpTargetRegion&&row.tcpTargetRegion!=='EU-DE'?`<label><span>${T('project.region')}</span><select data-field="tcpTargetRegion"><option>${E(row.tcpTargetRegion)}</option><option>EU-DE</option></select></label>`:''}
    ${row.tcpTargetBilling&&row.tcpTargetBilling!=='ONDEMAND'?`<label><span>${T('resource.billing')}</span><select data-field="tcpTargetBilling"><option value="${E(row.tcpTargetBilling)}">${E(row.tcpTargetBilling)}</option><option value="ONDEMAND">${T('mode.ONDEMAND')}</option></select></label>`:''}
   </div>
   <div class="row-notes">${E(T('resource.awsBilling',{billing:translateMessage(row.billing,language)}))}</div>
   ${price?`<div class="row-notes tcp-price-evidence">${E(price.sku??price.productLabel)} · ${E(price.amount)} EUR/${E(price.unit)} · <a href="${E(price.evidence.url)}#page=${price.evidence.pages[0]}" target="_blank" rel="noopener">${E(T('tcp.quote.source',{page:price.evidence.pages.join(', ')}))}</a> · ${E(dateLabel(state.lastVerifiedAt,language))}</div>`:`<div class="row-notes tcp-review">${E(reasonLabel(result,language))}</div>`}
   <div class="row-bottom"><span>${T('mode.ONDEMAND')} · EU-DE</span><div class="row-cost">${money(result.termPublic,'EUR')}</div></div>
  </article>`;
 }).join('');
}
export function resourceHTML(rows,output,catalog,language='zh',page=0,now=Date.now()){
 const T=(key,vars)=>t(key,language,vars),E=escapeHTML;
 return rows.slice(page*10,page*10+10).map((row,index)=>{
  const result=output[page*10+index],price=catalog.items.find(p=>p.id===row.targetId),mode=billingOf(row),subscription=mode!=='ONDEMAND';
  const migration=row.huaweiMigration;
  const ai=row.huaweiAi,display=ai?.display;
  const origin=row.huaweiSelection==='manual'||row.huaweiDesign?.candidateId?'manual':display?'suggested':'rule';
  const options=migration?(row.huaweiRanked??[]).map(({item})=>item):
   catalog.items.filter(p=>p.service===row.service&&p.billingMode===mode&&!p.migrationCharge?.endsWith('Storage'));
  const specMatch=row.huaweiProductMatch;
  const spec=specMatch?.selected??specMatch?.candidates?.[0];
  const specIssue=specMatch&&huaweiProductSpecIssue(row,price);
  const specDetails=spec?[
   T(spec.evidence.kind==='official-catalog'?'resource.hwSpecCatalog':'resource.hwSpecDoc'),
   ...(spec.service==='DCS'?[T('resource.hwTopology.'+spec.topology),spec.capacityMiB/1024+' GB','Redis '+spec.versions.join('/'),spec.architecture,
    spec.replicas&&T('resource.hwSpecReplicas',{count:spec.replicas}),spec.shards&&T('resource.hwSpecShards',{count:spec.shards})]:
    [spec.specCode,spec.layer,spec.masters&&T('resource.hwSpecMasters',{count:spec.masters}),spec.workers&&T('resource.hwSpecWorkers',{count:spec.workers})]),
   spec.evidence.revision
  ].filter(Boolean).map(E).join(' · '):'';
  const services=[...new Set([...Object.keys(SERVICES),'EIP',row.service])];
  const field=(label,html)=>`<label><span>${E(label)}</span>${html}</label>`;
  const badge=result.status==='Valid'?'valid':result.status==='Period'?'period':result.status==='Linked'?'linked':result.status==='Conditional'?'conditional':'pending';
  const conditional=result.status==='Conditional';
  const estimate=conditional?result.conditionalScenario:result.termScenario;
  return `<article class="resource-row" data-id="${E(row.id)}">
   <div class="resource-head"><span class="service-icon">${icon(row.service==='EVS'?'layers':'server')}</span><div class="resource-name">${E(row.product)}<small title="${E(row.specification)}">${E(row.specification.slice(0,120)||T('resource.specMissing'))}${row.region?' · '+E(row.region):''}</small></div><span class="badge ${conditional||badge==='pending'?'pending':'valid'}">${T('status.'+badge)}</span><button class="delete-row" data-delete="${E(row.id)}" aria-label="${T('resource.delete')}">×</button></div>
   <div class="field-grid">
    ${field(T('resource.service'),`<select data-field="service">${services.map(s=>`<option value="${E(s)}" ${s===row.service?'selected':''}>${E(serviceLabel(s,language))}</option>`).join('')}</select>`)}
    ${row.huaweiMatch?field(T('resource.hwSpec'),`<input data-field="specification" value="${E(row.specification)}">`):''}
    ${row.huaweiTargetRegion&&row.huaweiTargetRegion!==catalog.region?field(T('resource.hwTargetRegion'),`<select data-field="huaweiTargetRegion"><option>${E(row.huaweiTargetRegion)}</option><option>${E(catalog.region)}</option></select>`):''}
    ${field(T(row.scope==='aggregate'&&!subscription?'resource.unknownCount':'resource.quantity'),`<input data-field="targetQuantity" type="number" min="1" step="1" value="${row.targetQuantity??row.quantity??row.huaweiQuantity??''}" placeholder="${T('resource.required')}" ${row.scope==='aggregate'&&!subscription?'disabled':''}>`)}
    ${field(T(row.scope==='aggregate'?'resource.aggregateUsage':subscription?'resource.sourceUsage':'resource.monthlyUsage'),`<input data-field="usage" type="number" min="0" step="any" value="${row.usage??''}" placeholder="${T('resource.required')}" ${subscription?'disabled':migration&&row.scope==='aggregate'?'readonly':''}>`)}
    ${field(T('resource.unit'),`<select data-field="unit" ${subscription?'disabled':''}>${[...new Set([row.unit,'hour',...(price?.unit==='day'?['day']:[]),...(row.service==='EIP'?['Mbit/s','TB']:[]),'GB-month','GB-hour','GB','Requests','IOPS-Mo'])].map(unit=>`<option value="${E(unit)}" ${unit===row.unit?'selected':''}>${E(unit?unitLabel(unit,language):T('resource.unspecified'))}</option>`).join('')}</select>`)}
    ${field(T('resource.billing'),`<select class="mode-select" data-field="targetBilling">${['ONDEMAND','MONTHLY','YEARLY'].map(code=>`<option value="${code}" ${mode===code?'selected':''}>${billingLabel(code,language)}</option>`).join('')}</select>`)}
    ${row.service==='EVS'&&(subscription||row.huaweiMatch)||row.service==='DCS'&&row.huaweiMatch&&!migration?field(T(row.service==='DCS'?'inventory.field.capacity_gb':'resource.capacity'),`<input data-field="capacity" type="number" min="0" step="any" value="${row.capacity??''}" placeholder="${T('resource.capacityHint')}">`):''}
    ${field(T('resource.period'),`<select data-field="period"><option value="monthly" ${row.period==='monthly'?'selected':''}>${T(subscription?'resource.fullContract':'resource.fullMonth')}</option><option value="source-period" ${row.period==='source-period'?'selected':''}>${T('resource.sourcePeriod')}</option></select>`)}
   </div>
   <div class="target-row"><span class="target-arrow" aria-hidden="true">↳</span><select class="target-select" data-field="${display?'aiAlternative':'targetId'}" aria-label="${T('resource.targetAria')}"><option value="">${E(T(options.length?'resource.selectSku':'resource.noSku',{mode:billingLabel(mode,language)}))}</option>${row.huaweiSelection==='manual'&&!display?'<option value="__auto__">'+E(T('resource.hwAuto'))+'</option>':''}${options.map(p=>`<option value="${E(p.id)}" ${p.id===(display?.id??row.targetId)?'selected':''}>${E(p.sku)}${p.cpu?' · '+p.cpu+'vCPU / '+p.memory+'GB':''}${p.engine?' · '+E(p.engine):''}${specMatch?'':' · '+(priceValidation(p,catalog,{now}).valid?'$'+p.rate+'/'+unitLabel(p.unit,language):'Pending')}</option>`).join('')}</select></div>
   ${row.huaweiMatch?'<div class="row-notes">'+E(T('ai.origin.'+origin))+'</div>':''}
   ${display?`<div class="row-notes">${E(display.sku)} · ${E(display.description)}</div>
    <div class="row-notes">${ai.manualId?E(T('ai.originalNotes'))+'<br>':''}${[ai.recommendation.reason,...ai.recommendation.differences,...ai.recommendation.assumptions].map(E).join('<br>')}
    ${display.missing.length?'<br>'+E(T('ai.missing',{fields:display.missing.map(key=>T('ai.meter.'+key)).join(', ')})):''}</div>`:''}
   ${price&&!specIssue?`<div class="row-notes">${specMatch?'':E(price.description)+'<br>'}${E(priceValidation(price,catalog,{now}).valid?T('resource.verified',{date:dateLabel(price.verifiedAt,language)}):reasonLabel(priceValidation(price,catalog,{now}),language))}</div><div class="row-notes mapping-review">${row.huaweiMatch&&row.huaweiSelection!=='manual'&&!display?T('resource.hwMatched'):mappingReview(row,price).map(issue=>E(mappingLabel(issue,language))).join('<br>')}</div>`:''}
   ${row.huaweiMatch?`<div class="row-notes huawei-match">${[...(row.huaweiAssumptions??[]),row.huaweiUsageAssumption].filter(Boolean).map(reasonCode=>E(reasonLabel({reasonCode},language))).join(' ')}
   ${row.huaweiCandidates?.length?E(row.huaweiCandidates.slice(0,12).join(', ')):''}</div>`:''}
   ${spec?`<div class="row-notes huawei-spec-evidence">${specDetails} <a href="${E(spec.evidence.url)}" target="_blank" rel="noopener">${E(T('resource.hwSpecSource'))}</a>${specMatch.selected?' · '+E(T('resource.hwSpecPurchase')):''}</div>`:''}
   ${row.awsProfile?`<div class="row-notes aws-source-profile">${E([T('inventory.officialAws'),row.awsProfile.type,row.awsProfile.cpu?row.awsProfile.cpu+' vCPU':null,
    row.awsProfile.memory?row.awsProfile.memory+' GiB':null,row.awsProfile.architecture].filter(Boolean).join(' · '))}
    <a href="${E(row.awsProfile.evidence.specification.url)}" target="_blank" rel="noopener">${E(T('resource.hwSpecSource'))}</a></div>`:''}
   ${conditional?`<div class="row-notes huawei-conditional-reasons">${E(row.huaweiConditions.map(reasonCode=>reasonLabel({reasonCode},language)).join(' '))}</div>`:''}
   ${migration?.metering?`<div class="row-notes">${E(T('migration.meter',{
    source:migration.metering.sourceNodeHours??'—',average:migration.metering.sourceAverageNodes?.toFixed(2)??'—',
    count:migration.metering.targetInstanceQuantity??'—',target:migration.metering.targetInstanceHours??'—'}))}</div>`:''}
   ${migration?.comparison?`<div class="row-notes">${E(T('migration.comparison',{sku:migration.comparison.sku,
    rate:'USD '+migration.comparison.rate,unit:unitLabel(migration.comparison.unit,language)}))}</div>`:''}
   ${price?.specificationSource?`<div class="row-notes"><a href="${E(price.specificationSource)}" target="_blank" rel="noopener">${T('resource.hwSpecSource')}</a></div>`:''}
   ${row.huaweiCharge?`<div class="row-notes huawei-charge">${E(T('charge.'+row.huaweiCharge))}</div>`:''}
   ${relatedHuaweiCharges(row,result).map(({charge,row:component,result:line})=>{
    const chargeAmount=line.termScenario??line.conditionalScenario;
    const amount=chargeAmount==null?'':` · ${money(chargeAmount)} · ${E(billingLabel(line.billingMode,language))}`;
    const details=[...(component?.huaweiAssumptions??[]).map(reasonCode=>reasonLabel({reasonCode},language)),reasonLabel(line,language)].filter(Boolean);
    const source=line.item&&line.termScenario!==null?` · ${E(line.item.sku)} · ${E(dateLabel(line.item.verifiedAt,language))}`:'';
    return `<div class="row-notes ${line.status==='Pending'?'huawei-pending-charge':'huawei-related-charge'}">${E(T('charge.'+charge))}${line.status==='Pending'?' · '+E(T('status.pending')):line.status==='Conditional'?' · '+E(T('status.conditional')):''}${amount}${source}${details.length?' · '+E(details.join(' ')):''}</div>`;
   }).join('')}
   ${row.importSource?`<div class="row-notes">${E(row.importSource.sheet)} · ${T('inventory.row')} ${row.importSource.row}</div>`:''}
   <div class="row-notes source-notes">${E(T('resource.awsBilling',{billing:translateMessage(row.billing||'未提供',language)}))}<br>${E(translateMessage(row.notes,language))} ${E(reasonLabel(result,language))}</div>
   <div class="row-bottom">${display?'<span>'+E(T('ai.estimate'))+'</span>':migration&&!migration.unsupported&&row.awsProfile?`<button class="button secondary" data-review-condition="${E(row.id)}">${T('migration.review')}</button>`:conditional?`<button class="button secondary" data-review-condition="${E(row.id)}">${T('quote.reviewCondition')}</button>`:
    `<label class="check-line"><input data-field="accepted" type="checkbox" ${row.accepted?'checked':''} ${row.targetId&&!specIssue&&!row.awsMatchIssue?'':'disabled'}><span>${T('resource.accept')}</span></label>`}
    <div class="row-cost">${money(estimate)} <small>${T(result.status==='Period'||result.conditionalPeriod==='source-period'?'term.period':mode==='YEARLY'?'term.year':mode==='MONTHLY'?'term.month':'term.monthly')}</small></div></div>
  </article>`;
 }).join('');
}

export function migrationControls(row,language){
 const E=escapeHTML,T=(key,vars)=>t(key,language,vars);
 const settings=row.huaweiMigration?.settings??{},kind=row.huaweiMigration?.kind;
 const label=(key,control)=>`<label><span>${T('migration.field.'+key)}</span>${control}</label>`;
 const choice=(key,values)=>label(key,`<select name="${key}">${values.map(value=>
  `<option value="${E(value)}" ${(settings[key]?.value??'')===value?'selected':''}>${E(value==='ha'||value==='single'||value==='cluster'?T('migration.topology.'+value):
   key==='nodeGrouping'?T('migration.nodeGrouping.'+value):key==='role'?T('migration.role.'+value):value||'—')}</option>`).join('')}</select>`);
 const number=(key,step='any')=>label(key,`<input name="${key}" type="number" min="${step==='1'?1:0}" step="${step}" value="${E(settings[key]?.origin==='assumption'?'':settings[key]?.value??'')}">`);
 const input=(key)=>label(key,`<input name="${key}" maxlength="256" value="${E(settings[key]?.value??'')}">`);
 const storage=kind==='RDS'||kind==='OpenSearch'?[choice('storageType',kind==='RDS'?['Cloud SSD','ESSD']:['','SSD','SAS']),
  number('storageGiB'),number('storageHours'),number('storageQuantity','1')]:[];
 const engines=row.huaweiMigration?.engineVersions??{};
 const engine=settings.engine?.value,version=settings.version?.value;
 const versions=kind==='RDS'?label('version',`<select name="version" required>
  <option value="">${E(T('budget.selectVersion'))}</option>
  ${Object.entries(engines).flatMap(([name,values])=>values.map(value=>`<option value="${E(value)}" data-engine="${E(name)}"
   ${engine===name&&value===version?'selected':''} ${engine!==name?'hidden disabled':''}>${E(value)}</option>`)).join('')}</select>`):'';
 const controls=kind==='RDS'?[choice('engine',[...new Set([engine,...Object.keys(engines)].filter(Boolean))]),versions,choice('topology',['ha','single']),...storage]:
  kind==='ElastiCache'?[choice('engine',['Redis OSS']),choice('version',['4.0','5.0','6.0','7.0']),choice('topology',['ha','single','cluster']),
   number('cacheGiB'),number('replicas','1'),number('shards','1'),choice('nodeGrouping',['assumed','verified']),input('groupingEvidence'),number('sourcePeriodHours'),number('targetInstances','1')]:
   kind==='OpenSearch'?[choice('engine',['OpenSearch']),choice('role',['data']),input('version'),...storage]:[];
 const ranked=row.huaweiRanked??[];
 const candidates=ranked.length?`<label><span>${T('migration.candidate')}</span><select name="candidateId"><option value="">${T('resource.hwAuto')}</option>
  ${ranked.map(({item,cpu,memory,capacity,category})=>`<option value="${E(item.id)}" ${row.huaweiDesign?.candidateId===item.id?'selected':''}>
    ${E([item.sku,category??null,item.cpu?item.cpu+' vCPU / '+item.memory+' GiB':capacity?capacity+' GiB':null,
    cpu&&(cpu>1||memory>1)?cpu.toFixed(2)+'× CPU / '+memory.toFixed(2)+'× RAM':null,'USD '+item.rate+'/'+unitLabel(item.unit,language)]
     .filter(Boolean).join(' · '))}</option>`).join('')}</select></label>`:'';
 return `<div class="field-grid">${controls.join('')}${candidates}</div>
  ${ranked.length?`<p class="row-notes">${T('migration.ranked')}</p>`:''}
  ${kind==='ElastiCache'&&settings.cacheGiB?.origin==='assumption'?`<p class="row-notes">${T('migration.assumedSize')}</p>`:''}`;
}
export function summaryModel(rows,output,language='zh'){
 const T=(key,vars)=>t(key,language,vars);
 const lines=huaweiQuoteLines(rows,output),results=lines.map(line=>line.result);
 const valid=results.filter(r=>r.status==='Valid'),period=results.filter(r=>r.status==='Period'),pending=results.filter(r=>r.status==='Pending');
 const conditional=results.filter(result=>result.status==='Conditional'),conditionalCount=conditional.length;
 const estimate=(period,key)=>{
  const amounts=conditional.filter(result=>(result.conditionalPeriod==='source-period')===period).map(result=>result[key]);
  return amounts.length?sumMoney(amounts):null;
 };
 const pendingCount=pending.length,total=valid.length+period.length+pendingCount+conditionalCount;
 const onlyPeriod=period.length>0&&valid.length===0,quoted=onlyPeriod?period:valid;
 const sum=key=>sumMoney(quoted.map(result=>result[key])),has=quoted.length>0;
 const hasYear=quoted.some(result=>result.billingMode==='YEARLY'),hasPrepaid=quoted.some(result=>result.upfrontScenario!==null);
 const notes=[];
 if(!rows.length)notes.push(T('quote.initialNote'));
 else{
  if(onlyPeriod)notes.push(T('quote.periodNote'));
  else if(quoted.length)notes.push(T(hasYear?'quote.yearNote':'quote.standardNote'));
  if(period.length&&!onlyPeriod)notes.push(T('quote.mixedNote',{count:period.length}));
  if(pendingCount||conditionalCount)notes.push(T('quote.pendingNote'));
 }
 const groups={};for(const {row,result} of lines)if(quoted.includes(result))(groups[row.service]??=[]).push(result.scenario);
 return {
  ready:valid.length+period.length,total,has,onlyPeriod,hasPrepaid,conditionalCount,
  conditionalMonthly:estimate(false,'conditionalMonthly'),conditionalPeriod:estimate(true,'conditionalScenario'),
  monthly:has?sum('monthly'):null,scenario:has?sum('scenario'):null,annual:has&&!onlyPeriod?sum('annual'):null,upfront:hasPrepaid?sum('upfrontScenario'):null,
  monthlyLabel:T(onlyPeriod?'quote.period':hasYear?pendingCount||conditionalCount||period.length?'quote.partialYear':'quote.yearEquivalent':pendingCount||conditionalCount||period.length?'quote.partial':'quote.monthly'),
  annualLabel:T(onlyPeriod?'quote.annualPeriod':hasYear?'quote.annualYear':'quote.annual'),
  scenarioLabel:T(hasYear?'quote.scenarioYear':'quote.scenario'),
  note:notes.join(' '),
  status:T(!rows.length?'status.waiting':pendingCount?'status.pendingCount':conditionalCount?'quote.conditional':has?'status.confirmed':'status.review',{count:pendingCount||conditionalCount}),
  statusClass:pendingCount||conditionalCount?'pending':has?'valid':'neutral',
  coverage:T('quote.coverage',{ready:valid.length+period.length,total}),
  groups:Object.entries(groups).map(([service,amounts])=>[service,sumMoney(amounts)]).sort((a,b)=>b[1]-a[1])
 };
}
export function breakdownHTML(summary,language='zh'){
 if(!summary.has)return `<div class="skeleton-bar"></div><p>${t('quote.empty',language)}</p>`;
 const total=summary.scenario,list=summary.groups;
 return `<div class="chart-bar">${list.map(([name,value],i)=>`<span style="width:${total?value/total*100:100/list.length}%;background:${COLORS[i%COLORS.length]}" title="${escapeHTML(name)} ${money(value)}"></span>`).join('')}</div>${list.map(([name,value],i)=>`<div class="chart-legend"><span><i style="background:${COLORS[i%COLORS.length]}"></i>${escapeHTML(serviceLabel(name,language))}</span><span>${money(value)}</span></div>`).join('')}`;
}
export function catalogueHTML(items,catalog,language='zh'){
 return items.slice(0,120).map(price=>{const validation=priceValidation(price,catalog),valid=validation.valid;return `<tr><td>${escapeHTML(serviceLabel(price.service,language))}<small>${escapeHTML(price.engine||price.os)}</small></td><td>${escapeHTML(price.sku)}<small>${escapeHTML(price.productId)}</small></td><td>${escapeHTML(billingLabel(price.billingMode,language))}</td><td>${valid?'$'+price.rate.toFixed(6).replace(/0+$/,'').replace(/\.$/,''):'—'}</td><td>${escapeHTML(unitLabel(price.unit,language))}</td><td><span class="badge ${valid?'valid':'pending'}" title="${escapeHTML(reasonLabel(validation,language))}">${t(valid?'catalog.valid':validation.code==='PRICE_EXPIRED'?'catalog.expired':'catalog.review',language)}</span></td></tr>`;}).join('')||`<tr><td colspan="6">${t('catalog.empty',language)}</td></tr>`;
}
