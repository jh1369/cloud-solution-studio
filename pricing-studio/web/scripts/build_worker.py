"""Build a dependency-free Cloudflare Worker with private-site assets embedded."""
import base64,gzip,json,os,re
from pathlib import Path
from build_offline import build as build_offline
from catalog_updater.models import digest
from catalog_updater.publication import MAX_CATALOG_BYTES, MAX_STATE_BYTES, STATE_KEY
ROOT=Path(__file__).resolve().parents[1]
assets={}
for p in (ROOT/'public').rglob('*'):
 if p.is_file() and 'server' not in p.relative_to(ROOT/'public').parts:
  assets['/'+p.relative_to(ROOT/'public').as_posix()]=base64.b64encode(p.read_bytes()).decode()
# An online-only release can carry forward its reviewed offline attachment.
archive_path=os.environ.get('PRICING_OFFLINE_ARCHIVE')
offline_archive=Path(archive_path) if archive_path else build_offline(ROOT/'outputs/offline')[1]
download_path='/downloads/pricing-studio-offline.zip'
assets[download_path]=base64.b64encode(offline_archive.read_bytes()).decode()
catalog=json.loads((ROOT/'public/catalog.json').read_text())
source=(ROOT/'worker.mjs').read_text().replace('/*ASSETS*/{}',json.dumps(assets)).replace('/*CATALOG*/{}',json.dumps(catalog)).replace('/*OFFLINE_DOWNLOAD*/{}',json.dumps({'path':download_path,'filename':offline_archive.name}))
dcs_specs=(ROOT/'public/huawei-dcs-specs.mjs').read_text()
dcs_api=(ROOT/'huawei-dcs-spec-api.mjs').read_text().split('\n',1)[1]  # Imports the DCS module above.
source=source.replace('/*HUAWEI_DCS_SPECS*/',re.sub(r'^export ','',dcs_specs+'\n'+dcs_api,flags=re.M))
inspector=re.sub(r'^export ','',(ROOT/'public/catalog_status.mjs').read_text(),flags=re.M)
publication=re.sub(r'^export ','',(ROOT/'tcp_publication.mjs').read_text(),flags=re.M)
snapshot={}
snapshot_dir=os.environ.get('TCP_RELEASE_PUBLICATION')
if snapshot_dir:
 directory=Path(snapshot_dir)
 state_bytes=(directory/STATE_KEY).read_bytes()
 state=json.loads(state_bytes)
 reference=state.get('catalog') or {}
 sha=reference.get('sha256','')
 if len(state_bytes)>MAX_STATE_BYTES or state.get('effectiveState')!='ACTIVE' or not re.fullmatch(r'[a-f0-9]{64}',sha):
  raise ValueError('TCP release requires a verified publication')
 catalog_bytes=(directory/'tcp/catalogs'/f'{sha}.json').read_bytes()
 if len(catalog_bytes)!=reference.get('size') or len(catalog_bytes)>MAX_CATALOG_BYTES or digest(catalog_bytes)!=sha:
  raise ValueError('TCP release catalog does not match its publication')
 snapshot={'sha256':sha,'state':base64.b64encode(state_bytes).decode(),
           'catalog':base64.b64encode(gzip.compress(catalog_bytes,mtime=0)).decode(),'size':len(catalog_bytes)}
source=source.replace('/*TCP_INSPECTOR*/',inspector).replace('/*TCP_PUBLICATION*/',publication).replace('/*TCP_RELEASE*/{}',json.dumps(snapshot))
p=ROOT/'dist/server/index.js';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source)
manifest_path=ROOT/'.openai/hosting.json'
if manifest_path.exists():
 manifest=json.loads(manifest_path.read_text());manifest.pop('static',None);manifest_path.write_text(json.dumps(manifest))
print('Worker packaged with',len(assets),'assets;',len(source),'bytes')
