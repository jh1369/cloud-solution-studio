import {buildWorkbook} from './excel.mjs';
import {REGION,SERVICES,BILLING_MODES,billingOf,switchBilling,normalizeRows,parseText,recommend,calculate,parseBillPages} from './engine.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null||n===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(n);
const colors=['#7770df','#a99ce9','#83b7b0','#e3bc81','#a6b1cf','#c1a6ba'];
let catalog={items:[],ttlDays:7},rows=[],page=0,activeView='studio',busy=false;
function toast(message,error=false){const box=$('#message');box.textContent=message;box.classList.toggle('error',error);box.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.hidden=true,error?9000:5000);}
function settings(){const hours=+$('#hours').value,discount=+$('#discount').value/100;if(!Number.isFinite(hours)||hours<=0||hours>744)throw Error('月参考小时数需在 1–744 之间');if(!Number.isFinite(discount)||discount<0||discount>1)throw Error('折扣需在 0%–100% 之间');return {hours,discount};}
function results(){return rows.map(r=>calculate(r,catalog,settings()));}
function view(v){activeView=v;['studio','catalog','guide'].forEach(n=>$('#'+n+'-view').hidden=n!==v);$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===v));$('#crumb').textContent=({studio:'报价工作台',catalog:'官方价格目录',guide:'使用指南'})[v];if(v==='catalog')renderCatalog();window.scrollTo({top:0});}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
$$('[data-input]').forEach(b=>b.addEventListener('click',()=>{$$('[data-input]').forEach(t=>{t.classList.toggle('selected',t===b);t.setAttribute('aria-selected',String(t===b));});$('#text-pane').hidden=b.dataset.input!=='text';$('#file-pane').hidden=b.dataset.input!=='file';}));
$('#description').addEventListener('input',()=>$('#char-count').textContent=$('#description').value.length+' 字');
function setRows(newRows,append=false){if(!newRows.length)throw Error('没有识别到有效资源');for(const r of newRows)r.targetId=recommend(r,catalog);rows=append?rows.concat(newRows):newRows;if(rows.length>2000)throw Error('单次最多 2,000 行');page=0;render();toast(`已解析 ${newRows.length} 项资源，请核对后确认方案。`);}
$('#parse').addEventListener('click',()=>{try{setRows(parseText($('#description').value));}catch(e){toast(e.message,true);}});
function sample(){
 $('#description').value='2 台 EC2 m6i.2xlarge Linux，每台每月 730 小时\n1 个 EBS gp3 500 GB，每月使用\n1 台 RDS db.m5.large MySQL，每月 730 小时';
 $('#char-count').textContent=$('#description').value.length+' 字';
 try{setRows(parseText($('#description').value));}catch(e){toast(e.message,true);}
}
$('#sample').onclick=sample;$('#empty-sample').onclick=sample;
$('#add').onclick=()=>{rows.push({id:crypto.randomUUID(),product:'EC2',specification:'',region:'',quantity:null,usage:null,unit:'hour',billing:'未提供',targetBilling:'ONDEMAND',targetQuantity:null,capacity:null,service:'ECS',scope:'resource',period:'monthly',notes:'手动添加，请补全规格、数量和用量。',accepted:false,targetId:'',manualRate:null});page=Math.floor((rows.length-1)/10);render();};
function render(){
 let output;try{output=results();}catch(e){toast(e.message,true);$('#monthly-money').textContent='—';$('#annual-money').textContent='—';$('#scenario-money').textContent='—';$('#quote-status').textContent='输入需修正';$('#export').disabled=true;return;}
 $('#resource-count').textContent=rows.length;$('#export').disabled=!rows.length;$('#confirm-all').disabled=!rows.some(r=>r.targetId&&!r.accepted);$('#refresh-prices').disabled=busy||!rows.some(r=>r.targetId);
 if(!rows.length)return;
 const first=page*10,display=rows.slice(first,first+10);
 $('#resources').innerHTML=display.map((r,i)=>{const result=output[first+i],p=catalog.items.find(p=>p.id===r.targetId),mode=billingOf(r),subscription=mode!=='ONDEMAND',options=catalog.items.filter(p=>p.service===r.service&&p.billingMode===mode);return `<article class="resource-row" data-id="${esc(r.id)}"><div class="resource-head"><span class="service-icon">${r.service==='EVS'?'▱':r.service==='RDS'?'▥':'▦'}</span><div class="resource-name">${esc(r.product)}<small>${esc(r.specification.slice(0,120)||'待填写规格')} ${r.region?'· '+esc(r.region):''}</small></div><span class="badge ${result.status==='Pending'?'pending':'valid'}">${result.status==='Valid'?'可计价':result.status==='Period'?'来源账期':'Pending'}</span><button class="delete-row" data-delete="${esc(r.id)}" aria-label="删除资源">×</button></div><div class="field-grid"><label>华为服务族<select data-field="service">${[...new Set([...Object.keys(SERVICES),r.service])].map(s=>`<option ${s===r.service?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>${r.scope==='aggregate'&&!subscription?'来源台数（未知）':'目标资源数量'}<input data-field="targetQuantity" type="number" min="0" step="any" value="${r.targetQuantity??r.quantity??''}" placeholder="待填写" ${r.scope==='aggregate'&&!subscription?'disabled':''}></label><label>${r.scope==='aggregate'?'来源账期累计用量':subscription?'来源月用量（订阅不按小时折算）':'每资源月用量'}<input data-field="usage" type="number" min="0" step="any" value="${r.usage??''}" placeholder="待填写" ${subscription?'disabled':''}></label><label>用量单位<select data-field="unit" ${subscription?'disabled':''}>${[...new Set([r.unit,'hour','GB-month','GB-hour','GB','Requests','IOPS-Mo'])].map(s=>`<option value="${esc(s)}" ${s===r.unit?'selected':''}>${esc(s||'需确认')}</option>`).join('')}</select></label><label>华为云目标计费<select data-field="targetBilling">${Object.entries(BILLING_MODES).map(([key,label])=>`<option value="${key}" ${mode===key?'selected':''}>${label}</option>`).join('')}</select></label>${subscription&&r.service==='EVS'?`<label>目标容量 GB（每盘）<input data-field="capacity" type="number" min="1" step="any" value="${r.capacity??''}" placeholder="不可从账单累计量推断"></label>`:''}<label>目标用量 / 订阅方案<select data-field="period"><option value="monthly" ${r.period==='monthly'?'selected':''}>${subscription?'完整订阅方案（1个月 / 1年）':'完整月用量'}</option><option value="source-period" ${r.period==='source-period'?'selected':''}>来源账期 · 不外推</option></select></label></div><div class="target-row"><span class="target-arrow">↳</span><select class="target-select" data-field="targetId" aria-label="华为云目标规格"><option value="">${options.length?'选择'+BILLING_MODES[mode]+'目标 SKU…':'此服务暂无已验证的'+BILLING_MODES[mode]+'价格'}</option>${options.map(p=>`<option value="${esc(p.id)}" ${p.id===r.targetId?'selected':''}>${esc(p.sku)}${p.cpu?' · '+p.cpu+'vCPU / '+p.memory+'GB':''}${p.engine?' · '+p.engine:''} · $${p.rate}/${p.unit}</option>`).join('')}</select></div>${p?`<div class="row-notes">${esc(p.description)}<br>官方验证：${esc(new Date(p.verifiedAt).toLocaleString('zh-CN'))} · 仅当前选中计费项，配套资源另计。</div>`:''}<div class="row-notes">AWS 原计费方式：${esc(r.billing||'未提供')}（仅来源记录，不决定华为云定价）。<br>${esc(r.notes)} ${esc(result.reason)}</div><div class="row-bottom"><label class="check-line"><input data-field="accepted" type="checkbox" ${r.accepted?'checked':''} ${r.targetId?'':'disabled'}> 已核对目标规格与计价假设</label><div class="row-cost">${fmt(result.termScenario)} <small>${mode==='YEARLY'?' / 1年预付':mode==='MONTHLY'?' / 1个月预付':result.status==='Period'?' / 本期':' / 月'}</small></div></div></article>`;}).join('');
 $('#resource-pagination').hidden=rows.length<=10;$('#page-info').textContent=`${first+1}–${Math.min(first+10,rows.length)} / ${rows.length} 项`;$('#prev-page').disabled=page===0;$('#next-page').disabled=first+10>=rows.length;
 renderSummary(output);
}
function renderSummary(output){
 const valid=output.filter(r=>r.status==='Valid'),period=output.filter(r=>r.status==='Period'),pending=output.filter(r=>r.status==='Pending');
 const onlyPeriod=period.length>0&&valid.length===0,quoted=onlyPeriod?period:valid;
 const sum=key=>quoted.reduce((s,r)=>s+(r[key]??0),0),has=quoted.length>0;
 const hasYear=quoted.some(r=>r.billingMode==='YEARLY'),hasPrepaid=quoted.some(r=>r.upfrontScenario!==null);
 $('#upfront-row').hidden=!hasPrepaid;$('#upfront-money').textContent=fmt(sum('upfrontScenario'));
 $('#scenario-label').textContent=hasYear?'折后月均参考':'折后月度情景';
 $('#monthly-label').textContent=onlyPeriod?'来源账期费用 · USD':hasYear?(pending.length?'已验证部分月均 · 包年摊销':'月均参考 · 包年按12月摊销'):pending.length||period.length?'已验证部分月费 · USD':'月度费用 · USD';
 $('#monthly-money').innerHTML=(has?esc(fmt(sum('monthly'))):'—')+`<span> / ${onlyPeriod?'本期':'月'}</span>`;
 $('#annual-money').textContent=has&&!onlyPeriod?fmt(sum('annual')):'—';
 $('#annual-label').textContent=onlyPeriod?'年度预估 · 不外推':hasYear?'年度参考 · 含官方包年价':'年度情景 · 非包年价';
 $('#scenario-money').textContent=has?fmt(sum('scenario')):'—';
 const status=$('#quote-status');status.className='badge '+(pending.length?'pending':has?'valid':'neutral');status.textContent=pending.length?`${pending.length} 项 Pending`:has?'已确认方案':'等待确认';
 $('#coverage').textContent=`${valid.length+period.length} / ${rows.length} 项可计价`;
 $('#quote-note').textContent=onlyPeriod?'当前按来源账期累计用量计算，不代表整月。年度不外推。':period.length?`${period.length} 项来源账期单独列示，未计入月费小计。`:pending.length?'当前仅为已验证部分小计，Pending 项未计入，不能视为完整报价。':hasYear?'包年使用独立官方年价；月均金额仅作摊销比较。按需/包月年度为延续12次情景。':'按需/包月年度为当前月方案延续12次的情景，不能当作包年订阅价格。';
 const groups={};rows.forEach((r,i)=>{if(quoted.includes(output[i]))groups[r.service]=(groups[r.service]||0)+output[i].scenario;});
 const list=Object.entries(groups).sort((a,b)=>b[1]-a[1]),total=sum('scenario');
 $('#breakdown').innerHTML=has?`<div class="chart-bar">${list.map(([k,v],i)=>`<span style="width:${total?v/total*100:100/list.length}%;background:${colors[i%colors.length]}" title="${esc(k)} ${fmt(v)}"></span>`).join('')}</div>${list.map(([k,v],i)=>`<div class="chart-legend"><span><i style="background:${colors[i%colors.length]}"></i>${esc(k)}</span><span>${fmt(v)}</span></div>`).join('')}`:'<div class="skeleton-bar"></div><p>补全并确认资源后查看费用分布</p>';
}
$('#resources').addEventListener('change',event=>{const f=event.target.dataset.field;if(!f)return;const row=rows.find(r=>r.id===event.target.closest('[data-id]').dataset.id);if(!row)return;
 const v=event.target;row[f]=f==='accepted'?v.checked:['quantity','targetQuantity','capacity','usage'].includes(f)?v.value===''?null:Number(v.value):v.value;
 if(f==='targetBilling')switchBilling(row,v.value,catalog);
 if(['targetId','service','targetQuantity','capacity','usage','unit','period'].includes(f)){row.accepted=false;if(f==='service')row.targetId='';}
 render();});
$('#resources').addEventListener('click',event=>{const b=event.target.closest('[data-delete]');if(!b)return;rows=rows.filter(r=>r.id!==b.dataset.delete);page=Math.min(page,Math.max(0,Math.ceil(rows.length/10)-1));if(!rows.length){location.reload();return;}render();});
$('#prev-page').onclick=()=>{page--;render();};$('#next-page').onclick=()=>{page++;render();};
$('#bulk-billing').addEventListener('change',event=>{if(!event.target.value)return;rows.forEach(row=>switchBilling(row,event.target.value,catalog));render();toast('已切换华为云计费模式，请重新核对并确认方案；不支持该模式的项目保持 Pending。');event.target.value='';});
 $('#hours').addEventListener('change',render);$('#discount').addEventListener('change',render);
$('#confirm-all').onclick=()=>{$('#confirm-check').checked=false;$('#apply-confirm').disabled=true;$('#confirm-dialog').showModal();};
$('#confirm-check').onchange=e=>$('#apply-confirm').disabled=!e.target.checked;$('#cancel-confirm').onclick=()=>$('#confirm-dialog').close();
$('#apply-confirm').onclick=()=>{rows.forEach(r=>{if(r.targetId)r.accepted=true;});$('#confirm-dialog').close();render();toast('已确认所选方案；有缺失字段的资源仍保持 Pending。');};
async function importFile(file){
 if(!file)return;if(file.size>10*1024*1024){toast('文件不能超过 10 MB',true);return;}
 toast('正在浏览器内解析文件…');
 try{
  const bytes=await file.arrayBuffer();let parsed;
  if(/\.pdf$/i.test(file.name)){
   if(!window.pdfjsLib)throw Error('PDF 解析器未加载，请刷新重试');
   pdfjsLib.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.js';
   const doc=await pdfjsLib.getDocument({data:bytes,isEvalSupported:false}).promise;if(doc.numPages>50)throw Error('PDF 最多支持 50 页');
   const pages=[];
   for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p),content=await page.getTextContent();let grouped=[];
    for(const item of content.items){if(!item.str?.trim())continue;const y=item.transform[5];let line=grouped.find(g=>Math.abs(g.y-y)<2);if(!line){line={y,items:[]};grouped.push(line);}line.items.push({x:item.transform[4],text:item.str});}
    grouped.sort((a,b)=>b.y-a.y);pages.push(grouped.map(g=>g.items.sort((a,b)=>a.x-b.x).map(t=>t.text).join(' ')).join('\n'));
   }
   parsed=parseBillPages(pages);await doc.destroy();
  }else if(/\.(csv|xlsx)$/i.test(file.name)){
   if(!window.XLSX)throw Error('Excel 解析器未加载，请刷新重试');
   const book=XLSX.read(bytes,{type:'array',cellFormula:false,cellHTML:false});const input=book.Sheets[book.SheetNames.includes('Input')?'Input':book.SheetNames[0]];
   parsed=normalizeRows(XLSX.utils.sheet_to_json(input,{defval:''}));
  }else throw Error('请选择 CSV、XLSX 或 AWS 文字版 PDF');
  setRows(parsed);
 }catch(e){console.error('Import error:',e.name);toast(e.message||'文件解析失败，请检查格式',true);}
 $('#file').value='';
}
$('#file').onchange=e=>importFile(e.target.files[0]);
['dragenter','dragover'].forEach(name=>$('#dropzone').addEventListener(name,e=>{e.preventDefault();$('#dropzone').classList.add('drag');}));
['dragleave','drop'].forEach(name=>$('#dropzone').addEventListener(name,e=>{e.preventDefault();$('#dropzone').classList.remove('drag');if(name==='drop')importFile(e.dataTransfer.files[0]);}));
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
$('#template').onclick=()=>download('\uFEFFproduct,specification,region,quantity,usage,billing_method,unit\r\nEC2,m6i.2xlarge Linux,eu-central-1,2,730,on-demand,hour\r\nEBS,gp3,eu-central-1,1,500,on-demand,GB-month\r\nRDS,db.m5.large MySQL Single-AZ,eu-central-1,1,730,on-demand,hour\r\n','aws-resource-template.csv','text/csv;charset=utf-8');
function exportExcel(){
 try{
  if(!window.XLSX)throw Error('Excel 模块未加载');const opts=settings();
  const finalBook=buildWorkbook(XLSX,rows,catalog,opts,$('#project-name').value);
  XLSX.writeFile(finalBook,'Huawei-Cloud-Quotation-'+new Date().toISOString().slice(0,10)+'.xlsx');toast('已导出五张工作表，包含价格依据与 Pending 原因。');
 }catch(e){toast(e.message,true);}
}
$('#export').onclick=exportExcel;
function renderCatalog(){const q=$('#catalog-search').value.trim().toLowerCase(),service=$('#catalog-service').value,mode=$('#catalog-mode').value;const list=catalog.items.filter(p=>(!service||p.service===service)&&(!mode||p.billingMode===mode)&&(!q||JSON.stringify([p.service,p.sku,p.id,p.engine,p.description]).toLowerCase().includes(q)));
 $('#catalog-rows').innerHTML=list.slice(0,120).map(p=>`<tr><td>${esc(p.service)}<small>${esc(p.engine||p.os)}</small></td><td>${esc(p.sku)}<small>${esc(p.productId)}</small></td><td>${esc(BILLING_MODES[p.billingMode])}</td><td>$${p.rate.toFixed(6).replace(/0+$/,'').replace(/\.$/,'')}</td><td>${esc(p.unit)}</td><td><span class="badge ${new Date(p.verifiedAt).getTime()+catalog.ttlDays*86400000>Date.now()?'valid':'pending'}">${new Date(p.verifiedAt).getTime()+catalog.ttlDays*86400000>Date.now()?'官方已验证':'已过期'}</span></td></tr>`).join('')||'<tr><td colspan="6">未找到匹配的规格</td></tr>';
 $('#catalog-foot').textContent=`${list.length} 个匹配规格${list.length>120?' · 当前展示前 120 个，请搜索缩小范围':''} · 所有价格均为 eu-west-101 / USD，快照有效期 7 天。`;
}
$('#catalog-search').oninput=renderCatalog;$('#catalog-service').onchange=renderCatalog;$('#catalog-mode').onchange=renderCatalog;
$('#export-evidence').onclick=()=>download(JSON.stringify(catalog,null,2),'huawei-official-price-evidence.json','application/json');
$('#refresh-prices').onclick=async()=>{
 const ids=[...new Set(rows.map(r=>r.targetId).filter(Boolean))];busy=true;render();toast('正在向华为云官方接口重新核价…');let success=0,failed=0;
 try{for(let i=0;i<ids.length;i+=10){const res=await fetch('/api/rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids.slice(i,i+10)})});if(!res.ok)throw Error('官方核价服务暂不可用，保留原有价格及验证时间。');const data=await res.json();for(const p of data.items||[]){const index=catalog.items.findIndex(v=>v.id===p.id);if(index>=0){catalog.items[index]=p;success++;}}failed+=(data.pending||[]).length;}
 toast(`已重新验证 ${success} 个规格${failed?`，${failed} 个未返回价格；保留原证据及有效期`:''}。`);
 }catch(e){toast(e.message,true);}finally{busy=false;render();if(activeView==='catalog')renderCatalog();}
};
try{
 const res=await fetch('/catalog.json');if(!res.ok)throw Error('目录加载失败');catalog=await res.json();
 $('#catalog-summary').textContent=`${catalog.items.length} 个已验证计价方案（按需 / 包月 / 包年） · ${new Set(catalog.items.map(i=>i.service)).size} 类服务 · EU–Dublin`;
 $('#catalog-date').textContent=`最近构建验证：${new Date(catalog.verifiedAt).toLocaleString('zh-CN')} · USD · 7 天有效期 · 可按所选规格在线重新核价`;
 $('#catalog-service').innerHTML='<option value="">全部服务</option>'+[...new Set(catalog.items.map(i=>i.service))].sort().map(s=>`<option>${esc(s)}</option>`).join('');
 if(new Date(catalog.verifiedAt).getTime()+catalog.ttlDays*86400000<Date.now()){$('.connection').innerHTML='<i style="background:#c69a49"></i> 价格快照需刷新';}
}catch(e){$('.connection').textContent='目录暂不可用';toast('价格目录暂不可用，仍可导入资源；所有价格保持 Pending。',true);}
