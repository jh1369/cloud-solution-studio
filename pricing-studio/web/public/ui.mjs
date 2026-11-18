import {SERVICES,billingOf,priceValidation,mappingReview,sumMoney} from './engine.mjs';
import {t,billingLabel,unitLabel,dateLabel,serviceLabel,translateMessage,reasonLabel,mappingLabel} from './i18n.mjs';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>value===null||value===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(value);
export const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const COLORS=['#c36bf1','#e8b775','#78cbb6','#8c90e6','#e790bf','#a5baca'];
export function emptyResources(language='zh'){
 const T=(key,vars)=>t(key,language,vars);
 return `<div class="empty-state"><div class="empty-art">${icon('map')}</div><h3>${T('empty.title')}</h3><p>${T('empty.text')}</p><button class="text-button" data-sample>${T('empty.sample')} →</button></div>`;
}
export function resourceHTML(rows,output,catalog,language='zh',page=0,now=Date.now()){
 const T=(key,vars)=>t(key,language,vars),E=escapeHTML;
 return rows.slice(page*10,page*10+10).map((row,index)=>{
  const result=output[page*10+index],price=catalog.items.find(p=>p.id===row.targetId),mode=billingOf(row),subscription=mode!=='ONDEMAND';
  const options=catalog.items.filter(p=>p.service===row.service&&p.billingMode===mode);
  const services=[...new Set([...Object.keys(SERVICES),row.service])];
  const field=(label,html)=>`<label><span>${E(label)}</span>${html}</label>`;
  const badge=result.status==='Valid'?'valid':result.status==='Period'?'period':'pending';
  return `<article class="resource-row" data-id="${E(row.id)}">
   <div class="resource-head"><span class="service-icon">${icon(row.service==='EVS'?'layers':'server')}</span><div class="resource-name">${E(row.product)}<small title="${E(row.specification)}">${E(row.specification.slice(0,120)||T('resource.specMissing'))}${row.region?' · '+E(row.region):''}</small></div><span class="badge ${badge==='pending'?'pending':'valid'}">${T('status.'+badge)}</span><button class="delete-row" data-delete="${E(row.id)}" aria-label="${T('resource.delete')}">×</button></div>
   <div class="field-grid">
    ${field(T('resource.service'),`<select data-field="service">${services.map(s=>`<option value="${E(s)}" ${s===row.service?'selected':''}>${E(serviceLabel(s,language))}</option>`).join('')}</select>`)}
    ${field(T(row.scope==='aggregate'&&!subscription?'resource.unknownCount':'resource.quantity'),`<input data-field="targetQuantity" type="number" min="1" step="1" value="${row.targetQuantity??row.quantity??''}" placeholder="${T('resource.required')}" ${row.scope==='aggregate'&&!subscription?'disabled':''}>`)}
    ${field(T(row.scope==='aggregate'?'resource.aggregateUsage':subscription?'resource.sourceUsage':'resource.monthlyUsage'),`<input data-field="usage" type="number" min="0" step="any" value="${row.usage??''}" placeholder="${T('resource.required')}" ${subscription?'disabled':''}>`)}
    ${field(T('resource.unit'),`<select data-field="unit" ${subscription?'disabled':''}>${[...new Set([row.unit,'hour','GB-month','GB-hour','GB','Requests','IOPS-Mo'])].map(unit=>`<option value="${E(unit)}" ${unit===row.unit?'selected':''}>${E(unit?unitLabel(unit,language):T('resource.unspecified'))}</option>`).join('')}</select>`)}
    ${field(T('resource.billing'),`<select class="mode-select" data-field="targetBilling">${['ONDEMAND','MONTHLY','YEARLY'].map(code=>`<option value="${code}" ${mode===code?'selected':''}>${billingLabel(code,language)}</option>`).join('')}</select>`)}
    ${subscription&&row.service==='EVS'?field(T('resource.capacity'),`<input data-field="capacity" type="number" min="1" step="any" value="${row.capacity??''}" placeholder="${T('resource.capacityHint')}">`):''}
    ${field(T('resource.period'),`<select data-field="period"><option value="monthly" ${row.period==='monthly'?'selected':''}>${T(subscription?'resource.fullContract':'resource.fullMonth')}</option><option value="source-period" ${row.period==='source-period'?'selected':''}>${T('resource.sourcePeriod')}</option></select>`)}
   </div>
   <div class="target-row"><span class="target-arrow" aria-hidden="true">↳</span><select class="target-select" data-field="targetId" aria-label="${T('resource.targetAria')}"><option value="">${E(T(options.length?'resource.selectSku':'resource.noSku',{mode:billingLabel(mode,language)}))}</option>${options.map(p=>`<option value="${E(p.id)}" ${p.id===row.targetId?'selected':''}>${E(p.sku)}${p.cpu?' · '+p.cpu+'vCPU / '+p.memory+'GB':''}${p.engine?' · '+E(p.engine):''} · ${priceValidation(p,catalog,{now}).valid?'$'+p.rate+'/'+unitLabel(p.unit,language):'Pending'}</option>`).join('')}</select></div>
   ${price?`<div class="row-notes">${E(price.description)}<br>${E(priceValidation(price,catalog,{now}).valid?T('resource.verified',{date:dateLabel(price.verifiedAt,language)}):reasonLabel(priceValidation(price,catalog,{now}),language))}</div><div class="row-notes mapping-review">${mappingReview(row,price).map(issue=>E(mappingLabel(issue,language))).join('<br>')}</div>`:''}
   <div class="row-notes source-notes">${E(T('resource.awsBilling',{billing:translateMessage(row.billing||'未提供',language)}))}<br>${E(translateMessage(row.notes,language))} ${E(reasonLabel(result,language))}</div>
   <div class="row-bottom"><label class="check-line"><input data-field="accepted" type="checkbox" ${row.accepted?'checked':''} ${row.targetId?'':'disabled'}><span>${T('resource.accept')}</span></label><div class="row-cost">${money(result.termScenario)} <small>${T(mode==='YEARLY'?'term.year':mode==='MONTHLY'?'term.month':result.status==='Period'?'term.period':'term.monthly')}</small></div></div>
  </article>`;
 }).join('');
}
export function summaryModel(rows,output,language='zh'){
 const T=(key,vars)=>t(key,language,vars);
 const valid=output.filter(r=>r.status==='Valid'),period=output.filter(r=>r.status==='Period'),pending=output.filter(r=>r.status==='Pending');
 const onlyPeriod=period.length>0&&valid.length===0,quoted=onlyPeriod?period:valid;
 const sum=key=>sumMoney(quoted.map(result=>result[key])),has=quoted.length>0;
 const hasYear=quoted.some(result=>result.billingMode==='YEARLY'),hasPrepaid=quoted.some(result=>result.upfrontScenario!==null);
 const notes=[];
 if(!rows.length)notes.push(T('quote.initialNote'));
 else{
  if(onlyPeriod)notes.push(T('quote.periodNote'));
  else if(quoted.length)notes.push(T(hasYear?'quote.yearNote':'quote.standardNote'));
  if(period.length&&!onlyPeriod)notes.push(T('quote.mixedNote',{count:period.length}));
  if(pending.length)notes.push(T('quote.pendingNote'));
 }
 const groups={};rows.forEach((row,i)=>{if(quoted.includes(output[i]))(groups[row.service]??=[]).push(output[i].scenario);});
 return {
  ready:valid.length+period.length,total:rows.length,has,onlyPeriod,hasPrepaid,
  monthly:has?sum('monthly'):null,scenario:has?sum('scenario'):null,annual:has&&!onlyPeriod?sum('annual'):null,upfront:hasPrepaid?sum('upfrontScenario'):null,
  monthlyLabel:T(onlyPeriod?'quote.period':hasYear?pending.length||period.length?'quote.partialYear':'quote.yearEquivalent':pending.length||period.length?'quote.partial':'quote.monthly'),
  annualLabel:T(onlyPeriod?'quote.annualPeriod':hasYear?'quote.annualYear':'quote.annual'),
  scenarioLabel:T(hasYear?'quote.scenarioYear':'quote.scenario'),
  note:notes.join(' '),
  status:T(!rows.length?'status.waiting':pending.length?'status.pendingCount':has?'status.confirmed':'status.review',{count:pending.length}),
  statusClass:pending.length?'pending':has?'valid':'neutral',
  coverage:T('quote.coverage',{ready:valid.length+period.length,total:rows.length}),
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
