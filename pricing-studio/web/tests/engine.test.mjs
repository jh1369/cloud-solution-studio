import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseText,normalizeRows,recommend,calculate,cost,family,parseBillPages} from '../public/engine.mjs';
const catalog=JSON.parse(await readFile(new URL('../public/catalog.json',import.meta.url)));
import {syntheticCatalog} from './fixtures/synthetic-catalog.mjs';
const fixture=syntheticCatalog();
function row(){const r=parseText('2 台 EC2 m6i.2xlarge Linux，每台每月 730 小时')[0];r.targetId=recommend(r,fixture);r.accepted=true;return r;}
test('Chinese text extracts count and usage',()=>{const r=row();assert.equal(r.quantity,2);assert.equal(r.usage,730);assert.equal(r.service,'ECS');assert.ok(r.targetId);});
test('Unknown description stays incomplete',()=>{const r=parseText('我要一套高可用系统')[0];assert.equal(r.quantity,null);assert.equal(r.usage,null);assert.equal(r.service,'Unmapped');});
test('No confirmed mapping means Pending',()=>{const r=row();r.accepted=false;assert.equal(calculate(r,fixture).status,'Pending');});
test('Missing quantity is never invented',()=>{const r=row();r.quantity=null;assert.equal(calculate(r,fixture).status,'Pending');});
test('Unsupported billing stays Pending',()=>{const r=row();r.targetBilling='SPOT';assert.equal(calculate(r,fixture).status,'Pending');});
test('Valid quote uses official rate and discount',()=>{const r=row(),p=fixture.items.find(p=>p.id===r.targetId),v=calculate(r,fixture,{hours:730,discount:.15});assert.equal(v.status,'Valid');assert.deepEqual({monthly:v.monthly,scenario:v.scenario,annual:v.annual},cost(2,730,p.rate,.15));});
test('Expired price is Pending',()=>{const r=row(),old={...fixture,items:fixture.items.map(p=>({...p,verifiedAt:'2020-01-01'}))};assert.equal(calculate(r,old).status,'Pending');});
test('Wrong service does not quote',()=>{const r=row();r.service='RDS';assert.equal(calculate(r,fixture).status,'Pending');});
test('Monthly storage conversion uses explicit reference hours',()=>{const r=parseText('1 个 EBS gp3 500 GB')[0];r.targetId=recommend(r,fixture);r.accepted=true;const v=calculate(r,fixture,{hours:730,discount:0});assert.equal(v.effectiveUsage,365000);assert.equal(v.status,'Valid');});
test('Unsupported IOPS remains Pending',()=>{const r=parseText('1 个 EBS gp3 500 GB')[0];r.targetId=recommend(r,fixture);r.accepted=true;r.unit='IOPS-Mo';assert.equal(calculate(r,fixture).status,'Pending');});
test('Aggregate billing rows preserve unknown count and period',()=>{const [r]=normalizeRows([{'AWS Service':'Elastic Compute Cloud','Description':'Linux m6i.2xlarge','Period Aggregate Usage':'1,460','Original Unit':'Hrs','Billing Method':'on-demand'}]);assert.equal(r.quantity,null);assert.equal(r.scope,'aggregate');assert.equal(r.period,'source-period');r.targetId=recommend(r,fixture);r.accepted=true;const v=calculate(r,fixture);assert.equal(v.status,'Period');assert.equal(v.monthly,cost(1,1460,v.item.rate).monthly);});
test('PDF multiline rows and service context',()=>{const r=parseBillPages(['Elastic Compute Cloud USD 10.00\nEU (Frankfurt) USD 10.00\nAmazon Elastic Compute Cloud running Linux/UNIX USD 10.00\n$0.01 per On Demand Linux\nm6i.2xlarge Instance Hour 1,000 Hrs USD 10.00']);assert.equal(r.length,1);assert.equal(r[0].usage,1000);assert.equal(r[0].service,'ECS');assert.equal(r[0].quantity,null);});
test('PDF retains the start page for split rows and the current page for single-line rows',()=>{
 const rows=parseBillPages([
  'Elastic Compute Cloud USD 14.60\nEU (Frankfurt) USD 14.60\n$0.01 per On Demand Linux',
  'm6i.2xlarge Instance Hour 1,460 Hrs USD 14.60\nRelational Database Service USD 7.30\nEU (Frankfurt) USD 7.30\nMySQL db.m5.large On Demand 730 Hrs USD 7.30'
 ]);
 assert.deepEqual(rows.map(({service,usage,sourcePage})=>[service,usage,sourcePage]),[['ECS',1460,1],['RDS',730,2]]);
});
test('CSV rejects nonfinite and negative usage',()=>{for(const usage of ['NaN','Infinity',-1])assert.throws(()=>normalizeRows([{product:'EC2',quantity:1,usage}]));});
test('CSV unknown usage and quantity remain null',()=>{const [r]=normalizeRows([{product:'EC2'}]);assert.equal(r.usage,null);assert.equal(r.quantity,null);});
test('Decimal arithmetic rounds half up',()=>{assert.deepEqual(cost(2,730,.1,.15),{monthly:146,scenario:124.1,annual:1489.2});assert.equal(cost(1,1,.005).monthly,.01);});
test('Discount boundary validation',()=>{assert.throws(()=>cost(1,1,1,1.1));assert.throws(()=>cost(1,1,1,-.1));assert.equal(cost(1,1,1,1).scenario,0);});
test('Family mapping recognizes EC2 subcharges',()=>{assert.equal(family('Elastic Compute Cloud','EBS'),'EVS');assert.equal(family('Elastic Compute Cloud','Amazon NatGateway'),'NAT Gateway');});
test('No private account information in deployed catalogue',()=>{for(const p of catalog.items){assert.equal(p.currency,'USD');assert.equal(p.region,'eu-west-101');assert.equal(p.evidence.response.productId,p.productId);assert.equal(p.evidence.response.officialWebsiteAmount,p.rate);assert.ok(p.sourceUrl.startsWith('https://portal.eu.huaweicloud.com/'));}});
