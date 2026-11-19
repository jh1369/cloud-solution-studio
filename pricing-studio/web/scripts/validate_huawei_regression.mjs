import {readFileSync,statSync} from 'node:fs';
import {validateHuaweiRegression} from '../public/huawei-regression.mjs';

const paths=process.argv.slice(2);
try{
 if(paths.length<1||paths.length>2)throw Error('Provide one or two exported statistics JSON files.');
 const reports=paths.map(path=>{
  if(!path.endsWith('.json')||statSync(path).size>65536)throw Error('Expected an exported statistics JSON file.');
  let data;
  try{data=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('The statistics file could not be parsed.');}
  return {report:data,totals:validateHuaweiRegression(data)};
 });
 if(reports.length===2){
  const [first,second]=reports;
  if(first.report.webVersion!==second.report.webVersion||first.report.stage!=='initial'||second.report.stage!=='reviewed'||
   first.totals.input!==second.totals.input||
   Object.keys({...first.report.billingModes,...second.report.billingModes}).some(mode=>
    first.report.billingModes[mode]!==second.report.billingModes[mode])){
   throw Error('A release pair must have the same version, row count and billing-mode counts in initial/reviewed order.');
  }
 }
 process.stdout.write(JSON.stringify(reports,null,2)+'\n');
}catch(error){
 process.stderr.write(error.code?'Unable to open the statistics file.\n':error.message+'\n');
 process.exitCode=1;
}
