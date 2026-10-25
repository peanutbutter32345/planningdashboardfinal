import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import express from 'express';
import {registerCalDashboard} from '../cal-dashboard.js';
const read=name=>JSON.parse(readFileSync(new URL('../public/cal/data/'+name,import.meta.url),'utf8'));
const geography=read('geography.json'),profiles=read('profiles.json').profiles,housing=read('housing-summary.json'),stats=read('statistics.json'),photos=read('photos.json');
const app=express();app.use(express.json());let lastPrompt;
registerCalDashboard(app,{hasAI:true,model:'test-model',llm:{chat:{completions:{create:async request=>{lastPrompt=JSON.parse(request.messages.at(-1).content);return {choices:[{message:{content:'Check the official planning record [s0].'}}]};}}}}});
const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));
const call=async(path,body)=>{const response=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:response.status,body:await response.json(),headers:response.headers};};

test('six current and future districts are distinct, and every covered place has a jurisdiction profile',()=>{
 for(const congress of ['119','120'])assert.deepEqual(read('districts-'+congress+'.geojson').features.map(f=>f.properties.district).sort(),['19','20','21','24','26','27']);
 assert.equal(geography.metadata.futureFrom,'2027-01-03');
 const ids=new Set(profiles.map(p=>p.id));assert.equal(ids.size,profiles.length);
 for(const p of [...geography.places,...geography.counties]){
  assert.ok(ids.has(p.id),p.name);assert.ok(p.districts.length||p.futureDistricts.length||p.name==='San Diego'||p.kind==='county'||geography.metadata.extraPlaces.includes(p.geoid),p.name);
  assert.ok(profiles.some(c=>c.kind==='county'&&c.county===p.county),p.county);
  assert.ok(Number.isFinite(p.center.lat)&&Number.isFinite(p.center.lng));
 }
 const ojai=profiles.find(p=>p.name==='Ojai');assert.ok(ojai.districts.includes('24'));assert.ok(ojai.districts.includes('26'));assert.equal(ojai.split,true);
});
test('all profiles have official source links, explicit scopes and usable annual-record files',()=>{
 for(const p of profiles){
  assert.ok(p.resources.length>=7,p.name);assert.equal(new URL(p.website).protocol,'https:');assert.ok(p.meetingUrl);assert.ok(p.boardUrl);
  for(const r of p.resources){assert.equal(new URL(r.url).protocol,'https:',r.url);assert.ok(r.scope);}
  const data=read('housing/'+p.id+'.json');assert.equal(data.records.length,housing.jurisdictions[p.id].records,p.name);
  const seen=new Set();for(const r of data.records){assert.ok(!seen.has(r.id),r.id);seen.add(r.id);assert.ok(r.units>0);assert.ok([2023,2024,2025].includes(r.year));assert.equal(r.lat===null,r.lng===null);if(r.lat!==null){assert.ok(r.lat>=32&&r.lat<=42.1);assert.ok(r.lng>=-125&&r.lng<=-113.9);}const source=new URL(r.source);assert.equal(source.hostname,'data.ca.gov');const filters=JSON.parse(source.searchParams.get('filters'));assert.ok(filters.JURIS_NAME);assert.ok(filters.APN||filters.STREET_ADDRESS);}
 }
});
test('estimates retain their periods and uncertainty, and photographs have licenses and local files',()=>{
 for(const p of profiles){const s=stats.places[p.id];assert.ok(s);if(s.available){assert.ok(s.population>=0);assert.match(s.period,/2020.*2024/);assert.ok(s.tables.B19013.startsWith('https://www2.census.gov/'));assert.ok(s.margins);}}
 for(const image of Object.values(photos.photos)){assert.ok(image.by&&image.license&&image.source);assert.ok(existsSync(new URL('../public'+image.url,import.meta.url)));assert.ok(image.source.startsWith('https://commons.wikimedia.org/'));}
});
test('catalog stays small and loads record pages separately',async()=>{
 const r=await call('/api/cal/catalog');assert.equal(r.status,200);assert.equal(r.body.places.length,profiles.length);assert.equal(r.body.name,'Cal Civic Dashboard');assert.ok(JSON.stringify(r.body).length<400000);assert.match(r.headers.get('cache-control'),/public/);
 for(const p of r.body.places){assert.equal(p.records,undefined);assert.equal(p.resources,undefined);assert.equal(p.news,undefined);}
});
test('housing pages, milestone filters and unknown identifiers are handled without leaking files',async()=>{
 const first=await call('/api/cal/projects?id=p0669070&page=1'),second=await call('/api/cal/projects?id=p0669070&page=2');assert.equal(first.status,200);assert.equal(first.body.records.length,18);assert.ok(first.body.total>18);assert.equal(second.body.page,2);const ids=new Set(first.body.records.map(r=>r.id));assert.ok(second.body.records.every(r=>!ids.has(r.id)));
 const permitted=await call('/api/cal/projects?id=p0669070&stage=permitted');assert.ok(permitted.body.records.every(r=>r.stage==='permitted'));
 assert.equal((await call('/api/cal/projects?id=p0669070&q=NONEXISTENT_TEST_ADDRESS')).body.total,0);
 assert.equal((await call('/api/cal/projects?id=p0669070&page=0')).status,400);assert.equal((await call('/api/cal/projects?id=unknown')).status,404);assert.equal((await call('/api/cal/place/unknown')).status,404);
});
test('maps include only verified locations in the requested boundary set and keep unlocated counts',async()=>{
 const r=await call('/api/cal/map?id=p0669070&district=24&boundary=119');assert.equal(r.status,200);assert.equal(r.body.count,r.body.points.length);assert.ok(r.body.count>0);assert.ok(r.body.points.every(p=>p.lat!==null&&p.lng!==null));
 const other=await call('/api/cal/map?id=p0669070&district=19&boundary=119');assert.equal(other.body.count,0);assert.ok(other.body.outside>0);
 assert.equal((await call('/api/cal/map?district=99')).status,400);assert.equal((await call('/api/cal/map?boundary=999')).status,400);assert.equal((await call('/api/cal/map?id=unknown')).status,404);
});
test('community profiles route to county government without fabricating a live meeting schedule',async()=>{
 const community=profiles.find(p=>p.kind==='community'&&p.county==='Santa Barbara');const r=await call('/api/cal/place/'+community.id);assert.equal(r.status,200);assert.equal(r.body.meetingScope,'Santa Barbara County');assert.ok(r.body.resources.some(r=>r.scope==='county'));
 const meetings=await call('/api/cal/meetings/'+community.id);assert.equal(meetings.body.status,'directory');assert.deepEqual(meetings.body.events,[]);assert.ok(meetings.body.url.startsWith('https://'));
});
test('AI questions use only the chosen locality and known sources, with size and rate limits',async()=>{
 assert.equal((await call('/api/cal/ask',{place:'unknown',question:'Question'})).status,400);assert.equal((await call('/api/cal/ask',{place:'p0669070',question:'a'.repeat(1001)})).status,400);
 const r=await call('/api/cal/ask',{place:'p0669070',question:'What housing is proposed near State Street?'});assert.equal(r.status,200);assert.equal(lastPrompt.locality,'Santa Barbara');assert.ok(lastPrompt.projects.every(p=>p.jurisdiction==='p0669070'));assert.ok(r.body.sources.every(s=>s.url.startsWith('https://')));assert.equal(r.headers.get('cache-control'),'no-store');
 for(let i=0;i<11;i++)assert.equal((await call('/api/cal/ask',{place:'p0669070',question:'Which source should I read?'})).status,200);
 assert.equal((await call('/api/cal/ask',{place:'p0669070',question:'One more?'})).status,429);
});

test('county views include covered city records as well as unincorporated reporting',async()=>{
 const county=profiles.find(p=>p.kind==='county'&&p.county==='Santa Barbara');
 const detail=await call('/api/cal/place/'+county.id);assert.ok(detail.body.housing.records>housing.jurisdictions[county.id].records);assert.ok(detail.body.housing.reportingJurisdictions.includes('Santa Barbara'));
 const list=await call('/api/cal/projects?id='+county.id);assert.ok(list.body.records.some(p=>p.jurisdiction!==county.id));assert.match(list.body.metadata.geography,/Covered reporting jurisdictions/);
});
test('unreachable live meeting feeds retain the official agenda link and do not invent events',async()=>{
 const realFetch=globalThis.fetch;globalThis.fetch=(input,options)=>String(input).startsWith('https://webapi.legistar.com/')?Promise.reject(Error('Test feed outage')):realFetch(input,options);
 try{const r=await call('/api/cal/meetings/'+profiles.find(p=>p.client==='fresno').id);assert.equal(r.status,200);assert.equal(r.body.status,'unavailable');assert.deepEqual(r.body.events,[]);assert.ok(r.body.url.startsWith('https://'));}finally{globalThis.fetch=realFetch;}
});
test('the retired separate preview redirects to the original BayDashboard',async()=>{
 const response=await fetch(base+'/cal/',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/');
 const bayHTML=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(bayHTML,/<title>The Bay Dashboard<\/title>/);
});

test('every locality has the same evidence checklist, with missing data distinguished from directories',async()=>{
 const audit=await call('/api/cal/coverage');assert.equal(audit.status,200);assert.equal(audit.body.places.length,profiles.length);
 const keys=audit.body.places[0].features.map(f=>f.key);
 for(const p of audit.body.places){assert.deepEqual(p.features.map(f=>f.key),keys,p.name);for(const f of p.features){assert.ok(['imported','live','directory','lookup','unavailable'].includes(f.status));if(f.status==='unavailable')assert.equal(f.count,0);for(const source of f.sources)assert.equal(new URL(source.url).protocol,'https:');}}
 const land=read('land-use.json');for(const p of profiles.filter(p=>p.kind==='city'))for(const l of land.places[p.id].layers){assert.doesNotMatch(l.name,/airport|safety|inspection|flood|history/i);assert.ok(!l.url.includes('lacounty.gov'),p.name+' must not inherit county zoning');}
});
test('environmental filings preserve source text, locality attribution and complete county exports',async()=>{
 const env=read('environmental.json');assert.ok(Object.keys(env.records).length>8000);
 for(const p of profiles.filter(p=>p.kind==='city'))assert.ok(env.places[p.id].length,p.name);
 for(const r of Object.values(env.records)){assert.match(r.source,/^https:\/\/ceqanet\.lci\.ca\.gov\//);assert.ok(r.date>=env.from&&r.date<=env.through);assert.ok(r.name);assert.ok(r.counties.length);assert.equal(typeof r.transportation,'boolean');}
 const first=await call('/api/cal/environmental?id=p0669070'),second=await call('/api/cal/environmental?id=p0669070&page=2');assert.equal(first.status,200);assert.equal(first.body.records.length,12);assert.equal(first.body.owner,'Santa Barbara');assert.ok(!first.body.records.some(a=>second.body.records.some(b=>a.id===b.id)));
 const county=await call('/api/cal/environmental?id=p0669070&scope=county');assert.equal(county.body.owner,'Santa Barbara County');assert.ok(county.body.total>first.body.total);
 const transport=await call('/api/cal/environmental?id=p0669070&sector=transportation');assert.ok(transport.body.records.every(r=>r.transportation));
 assert.equal((await call('/api/cal/environmental?id=bad')).status,404);assert.equal((await call('/api/cal/environmental?id=p0669070&page=0')).status,400);assert.equal((await call('/api/cal/environmental?id=p0669070&sector=bad')).status,400);
});
test('zoning queries accept only bounded local areas and the verified agency layer',async()=>{
 assert.equal((await call('/api/cal/zoning/p0669070?bbox=-124,32,-114,42')).status,400);
 assert.equal((await call('/api/cal/zoning/p0669070?bbox=-122,37,-121.99,37.01')).status,400);
 assert.equal((await call('/api/cal/zoning/p0669070?bbox=-119.71,34.41,-119.70,34.42&layer=-1')).status,404);
 const realFetch=globalThis.fetch;let upstream;
 globalThis.fetch=(input,options)=>String(input).startsWith('https://gisportal.santabarbaraca.gov/')?(upstream=String(input),Promise.resolve(new Response(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-119.71,34.41],[-119.70,34.41],[-119.70,34.42],[-119.71,34.41]]]},properties:{zone:'R-2',OWNER:'Must not expose unused attributes'}}]}),{status:200,headers:{'content-type':'application/json'}}))):realFetch(input,options);
 try{const r=await call('/api/cal/zoning/p0669070?bbox=-119.71,34.41,-119.70,34.42');assert.equal(r.status,200);assert.equal(r.body.features[0].properties.zone,'R-2');assert.deepEqual(Object.keys(r.body.features[0].properties),['zone']);assert.match(upstream,/MapServer\/401\/query/);assert.match(upstream,/resultRecordCount=1000/);}finally{globalThis.fetch=realFetch;}
});


test('the added district catalog and San Diego all-coverage map are available',async()=>{
 const catalog=await call('/api/cal/catalog');assert.deepEqual(catalog.body.districts.map(d=>d.id).sort(),['19','20','21','24','26','27']);
 const all=await call('/api/cal/map?id=p0666000&district=all');assert.equal(all.status,200);assert.ok(all.body.count>3000);assert.ok(all.body.points.every(p=>p.jurisdiction==='p0666000'));
 const filtered=await call('/api/cal/map?id=p0666000&district=24');assert.equal(filtered.body.count,0);
});

 test('all five added city maps include their own coordinates without claiming CA-24 membership',async()=>{
 for(const anchor of geography.metadata.populationExpansion.anchors){
  const id='p'+anchor.geoid;
  const all=await call('/api/cal/map?id='+id+'&district=all');
  assert.equal(all.status,200);assert.ok(all.body.count>0,anchor.name);
  assert.ok(all.body.points.every(p=>p.jurisdiction===id));
  const district=await call('/api/cal/map?id='+id+'&district=24');assert.equal(district.body.count,0);
 }
});

test('new community maps retain county-owned records that fall inside their Census boundary',async()=>{
 const communities=profiles.filter(p=>p.kind==='community'&&geography.metadata.extraPlaces.includes(p.geoid)&&housing.jurisdictions[p.id].mapped);
 assert.ok(communities.length);
 for(const p of communities){
  const response=await call('/api/cal/map?id='+p.id+'&district=all');
  assert.equal(response.body.count,housing.jurisdictions[p.id].mapped,p.name);
  assert.ok(response.body.points.every(r=>r.jurisdiction.startsWith('c')));
 }
});
test('Compton uses its dated published report instead of inventing recent housing activity',()=>{
 const p=profiles.find(p=>p.name==='Compton');
 assert.equal(housing.jurisdictions[p.id].year,2023);
 assert.ok(housing.jurisdictions[p.id].records>0);
 assert.ok(read('housing/'+p.id+'.json').records.every(r=>r.year===2023));
});
