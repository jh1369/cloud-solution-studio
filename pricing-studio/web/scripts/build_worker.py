"""Build a dependency-free Cloudflare Worker with private-site assets embedded."""
import base64,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
assets={}
for p in (ROOT/'public').rglob('*'):
 if p.is_file() and 'server' not in p.relative_to(ROOT/'public').parts:
  assets['/'+p.relative_to(ROOT/'public').as_posix()]=base64.b64encode(p.read_bytes()).decode()
catalog=json.loads((ROOT/'public/catalog.json').read_text())
source=(ROOT/'worker.mjs').read_text().replace('/*ASSETS*/{}',json.dumps(assets)).replace('/*CATALOG*/{}',json.dumps(catalog))
p=ROOT/'dist/server/index.js';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source)
manifest_path=ROOT/'.openai/hosting.json'
if manifest_path.exists():
 manifest=json.loads(manifest_path.read_text());manifest.pop('static',None);manifest_path.write_text(json.dumps(manifest))
print('Worker packaged with',len(assets),'assets;',len(source),'bytes')
