"""Build a dependency-free Cloudflare Worker with private-site assets embedded."""
import base64,json
from pathlib import Path
from build_offline import build as build_offline, ZIP_NAME
ROOT=Path(__file__).resolve().parents[1]
assets={}
for p in (ROOT/'public').rglob('*'):
 if p.is_file() and 'server' not in p.relative_to(ROOT/'public').parts:
  assets['/'+p.relative_to(ROOT/'public').as_posix()]=base64.b64encode(p.read_bytes()).decode()
# Serve the reviewed offline ZIP as a real attachment, behind the same Site gate.
_,offline_archive=build_offline(ROOT/'outputs/offline')
download_path='/downloads/pricing-studio-offline.zip'
assets[download_path]=base64.b64encode(offline_archive.read_bytes()).decode()
catalog=json.loads((ROOT/'public/catalog.json').read_text())
source=(ROOT/'worker.mjs').read_text().replace('/*ASSETS*/{}',json.dumps(assets)).replace('/*CATALOG*/{}',json.dumps(catalog)).replace('/*OFFLINE_DOWNLOAD*/{}',json.dumps({'path':download_path,'filename':ZIP_NAME}))
p=ROOT/'dist/server/index.js';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source)
manifest_path=ROOT/'.openai/hosting.json'
if manifest_path.exists():
 manifest=json.loads(manifest_path.read_text());manifest.pop('static',None);manifest_path.write_text(json.dumps(manifest))
print('Worker packaged with',len(assets),'assets;',len(source),'bytes')
