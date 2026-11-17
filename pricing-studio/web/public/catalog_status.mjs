// Read-only online detection. Full parsing, history and promotion run in the local updater.
export const TCP_PRICE_PAGE='https://www.t-cloud-public.com/en/prices/price-calculator';
function official(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||!['www.t-cloud-public.com','t-cloud-public.com'].includes(parsed.hostname)||parsed.username||parsed.password||parsed.port)throw Error('Unapproved TCP public URL');return parsed.href;}
export function discoverTCPDocument(html,page=TCP_PRICE_PAGE){
 const links=new Set();official(page);
 for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)){
  const url=new URL(match[1].replaceAll('&amp;','&'),page),path=decodeURIComponent(url.pathname);
  if(/\.pdf$/i.test(path)&&/service[-_ ]?description|servicedescription/i.test(path))links.add(official(url.href));
 }
 if(links.size!==1)throw Error('Missing or ambiguous official Service Description link');
 return [...links][0];
}
async function limited(response,limit){
 if(Number(response.headers.get('Content-Length'))>limit)throw Error('Official response exceeds size limit');
 const reader=response.body?.getReader();if(!reader)throw Error('Missing official response body');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Official response exceeds size limit');chunks.push(value);}}
 catch(error){await reader.cancel();throw error;}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function getOfficial(url,fetcher){
 for(let i=0;i<5;i++){
  const response=await fetcher(official(url),{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('Location');if(!location)throw Error('Invalid redirect');url=official(new URL(location,url).href);continue;
  }
  if(!response.ok)throw Error('Official TCP source unavailable');return {response,url};
 }
 throw Error('Too many redirects');
}
export async function inspectTCPSource(packaged,{fetcher=fetch,now=()=>new Date().toISOString()}={}){
 try{
  const page=await getOfficial(TCP_PRICE_PAGE,fetcher);
  const url=discoverTCPDocument(new TextDecoder().decode(await limited(page.response,2*1024*1024)),page.url);
  const pdf=await getOfficial(url,fetcher),bytes=await limited(pdf.response,16*1024*1024);
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Official response is not a PDF');
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const unchanged=packaged.source?.sha256===sha256;
  return {...packaged,lastCheckedAt:now(),status:unchanged?(packaged.currentVersion?'UNCHANGED':'PENDING_REVIEW'):'DOCUMENT_CHANGED_REVIEW_REQUIRED',candidateVersion:unchanged?packaged.candidateVersion:null,documentRevision:unchanged?packaged.documentRevision:null,source:{...(unchanged?packaged.source:{}),url:pdf.url,sha256,fetchedAt:now()},reasons:unchanged?(packaged.reasons||[]):['LOCAL_PARSE_AND_REVIEW_REQUIRED'],checkScope:'DETECTION_ONLY_NO_PROMOTION'};
 }catch{return {...packaged,lastCheckedAt:now(),status:'CHECK_FAILED',reasons:['OFFICIAL_DETECTION_FAILED'],checkScope:'DETECTION_ONLY_NO_PROMOTION'};}
}
