"""Verify Huawei EU pay-per-use, 1-month and 1-year prices independently."""
import json, urllib.request, urllib.error, re, hashlib, math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
BASE='https://portal.eu.huaweicloud.com'
PATH='/api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo'
INQUIRY='/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource'
REGION='eu-west-101'
MODES={'ONDEMAND':('hour',None),'MONTHLY':('month',2),'YEARLY':('year',3)}
PUBLIC_NAT_DAILY='https://support.huaweicloud.com/eu/price-natgateway/nat_billing_0005.html'
def fetch(url,payload=None):
 req=urllib.request.Request(url,data=json.dumps(payload).encode() if payload else None,headers={'Content-Type':'application/json','Origin':'https://www.huaweicloud.com'})
 try:
  with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
 except urllib.error.HTTPError as error:
  raise ValueError(error.read().decode()[:1200]) from error
def get(path):
 url=f'{BASE}{PATH}?urlPath={path}&region={REGION}&language=en-us&station=en-EU&tag=general.online.portal'
 data=fetch(url)
 if data.get('urlPath')!=path or data.get('region')!=REGION:return []
 rows=[]
 for key,values in data.get('product',{}).items():
  if not isinstance(values,list):continue
  for item in values:
   if not isinstance(item,dict) or 'resourceSpecCode' not in item:continue
   spec=item['resourceSpecCode'];desc=item.get('productSpecSysDesc','');size=False
   if path=='ecs':
    if key!='ec2_vm' or not re.match(r'(c[679]|s[367]|m[367]|t6)\.',spec) or not spec.endswith(('.linux','.win')):continue
    service='ECS'
   elif path=='evs':service='EVS';size=True
   elif path=='rds':
    if key!='rds_rds.vm':continue
    service='RDS'
   elif path=='elb':
    if key!='elb_elbv3' or spec!='elbv3.professional':continue
    service='ELB'
   elif path=='redis':service='DCS'
   elif path=='nat':service='NAT Gateway'
   elif path=='cce':service='CCE'
   else:continue
   cpu=re.search(r'(?:vCPUs?|cpu):\s*(\d+)',desc,re.I);mem=re.search(r'(?:Memory|mem):\s*(\d+)MB',desc,re.I)
   if cpu and int(cpu[1])>32:continue
   for plan in item.get('planList',[]):
    mode=plan.get('billingMode')
    if mode not in MODES or not plan.get('productId') or isinstance(plan.get('amount'),bool) or not isinstance(plan.get('amount'),(float,int)) or not math.isfinite(plan['amount']) or plan['amount']<0:continue
    public_nat_day=mode=='ONDEMAND' and path=='nat' and key=='natgateway_natgateway' and item['resourceType']=='hws.resource.type.natgateway'
    if mode=='ONDEMAND' and (isinstance(plan.get('measureUnit'),bool) or plan.get('measureUnit')!=(0 if public_nat_day else 4) or 'duration' not in plan.get('usageFactor','').lower()):continue
    if path=='elb' and (mode!='ONDEMAND' or plan.get('usageFactor')!='instance_duration'):continue
    if mode!='ONDEMAND' and plan.get('periodNum')!=1:continue
    unit,period_type=MODES[mode]
    if public_nat_day:unit='day'
    rows.append(dict(id=plan['productId'] if mode=='ONDEMAND' else plan['productId']+':'+mode,service=service,sku=spec,description=desc,cpu=int(cpu[1]) if cpu else None,memory=int(mem[1])/1024 if mem else None,os='Windows' if spec.endswith('.win') else 'Linux',arch=item.get('instanceArch','Review Required'),engine=item.get('engineType',''),resourceType=item['resourceType'],cloudServiceType=item['cloudServiceType'],productId=plan['productId'],usageFactor=plan.get('usageFactor'),size=size,unit=('GB-' if size else '')+unit,billingMode=mode,periodType=period_type,periodNum=1 if period_type else None,catalogUrl=url,siteCode=plan.get('siteCode','HWC')))
 return rows
def verify(chunk):
 mode=chunk[0]['billingMode']
 payload={'regionId':REGION,'chargingMode':1 if mode=='ONDEMAND' else 0,'subscriptionNum':1,'siteCode':'HWC','productInfos':[]}
 if mode!='ONDEMAND':payload.update(periodType=MODES[mode][1],periodNum=1)
 for index,row in enumerate(chunk):
  product={key:row[key] for key in ['cloudServiceType','resourceType','productId']}
  product.update(id=str(index),resourceSpecCode=row['sku'],productNum=1)
  if mode=='ONDEMAND':product.update(usageFactor=row['usageFactor'],usageMeasureId=0 if row.get('unit')=='day' else 4,usageValue=1)
  if row['size']:product.update(resourceSize=1,resouceSizeMeasureId=17)
  payload['productInfos'].append(product)
 try:result=fetch(BASE+INQUIRY,payload)
 except ValueError:
  if len(chunk)==1:
   print('Pending:',mode,chunk[0]['sku'],flush=True);return []
  return [item for row in chunk for item in verify([row])]
 if result.get('currency')!='USD':raise ValueError('Currency not verified')
 verified=[]
 quotes=result.get('productRatingResult',[])
 if not isinstance(quotes,list):return []
 def quote_index(quote):
  if not isinstance(quote,dict) or not isinstance(quote.get('id'),str) or not re.fullmatch(r'0|[1-9]\d*',quote['id']):return None
  index=int(quote['id'])
  return index if index<len(chunk) else None
 indices=Counter(index for quote in quotes if (index:=quote_index(quote)) is not None)
 for quote in quotes:
  index=quote_index(quote)
  if index is None or indices[index]!=1:continue
  row=chunk[index];rate=quote.get('officialWebsiteAmount')
  if isinstance(rate,bool) or not isinstance(rate,(float,int)) or not math.isfinite(rate) or rate<0 or rate>1e12 or quote.get('productId')!=row['productId']:continue
  row.update(rate=rate,currency='USD',region=REGION,verifiedAt=datetime.now(timezone.utc).isoformat(),sourceUrl=BASE+INQUIRY,evidence={'request':payload['productInfos'][index],'inquiry':{k:v for k,v in payload.items() if k!='productInfos'},'response':quote,'currency':result['currency'],'responseSha256':hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()})
  if row.get('unit')=='day':row['evidence']['billingSource']=PUBLIC_NAT_DAILY
  verified.append(row)
 return verified
def main():
 with ThreadPoolExecutor(max_workers=4) as executor:batches=list(executor.map(get,['ecs','evs','rds','elb','redis','nat','cce']))
 items=list({row['id']:row for batch in batches for row in batch}.values());chunks=[]
 for mode in MODES:
  group=[row for row in items if row['billingMode']==mode]
  chunks.extend(group[index:index+10] for index in range(0,len(group),10))
 with ThreadPoolExecutor(max_workers=4) as executor:verified=[row for batch in executor.map(verify,chunks) for row in batch]
 if not verified:raise ValueError('No official prices verified; preserve existing catalogue')
 output={'region':REGION,'currency':'USD','verifiedAt':datetime.now(timezone.utc).isoformat(),'ttlDays':7,'source':'Huawei Cloud EU public calculator + independent officialWebsiteAmount inquiry for each billing mode','items':verified}
 target=ROOT/'public/catalog.json';temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(output,ensure_ascii=False));temporary.replace(target)
 print('Verified price plans:',len(verified),'by mode:',{mode:sum(row['billingMode']==mode for row in verified) for mode in MODES},flush=True)

if __name__=='__main__':
 main()
