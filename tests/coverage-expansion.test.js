import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {REGIONAL_CITIES} from '../data/regional.js';
import {CITY_LABELS} from '../digest.js';
import {MEETING_DIRECTORY} from '../hearings.js';
import {sourcesForCity} from '../data/sources.js';
import {PROJECTS} from '../data/projects.js';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=read('public/data/coverage/manifest.json');
const base=read('public/data/municipalities.json').cities;
const coverage=read('public/cal/data/profiles.json').profiles;
const full=key=>read('public/data/coverage/'+key+'.json').records;

test('every covered city joins the original city directory without replacing a Bay Area city',()=>{
 assert.equal(Object.values(manifest.cities).filter(c=>c.kind==='city').length,61);
 for(const city of base)assert.ok(!manifest.cities[city.key],city.label+' must not be overwritten');
 for(const p of coverage.filter(p=>p.kind==='city')){
  assert.ok(base.some(c=>c.label===p.name&&c.county===p.county)||Object.values(manifest.cities).some(c=>c.coverageId===p.id),p.name);
 }
 for(const [key,c] of Object.entries(manifest.cities)){
  assert.equal(CITY_LABELS[key],c.label);assert.ok(MEETING_DIRECTORY[key].links.length);
  assert.ok(c.deciders.length&&c.join.length);assert.ok(c.news.length);assert.ok(c.resources.length);
  assert.ok(sourcesForCity(key).length);assert.ok(sourcesForCity(key).every(s=>s.city===c.label));
  assert.equal(REGIONAL_CITIES[key].data.length,c.recordCount);
  assert.ok(c.data.length<=8);assert.ok(c.coverageFacts);
  if(c.kind==='city'){const records=full(key);assert.ok(records.some(r=>r.sourceType==='hcd-apr'),key);assert.ok(records.some(r=>r.sourceType==='ceqanet'),key);}
 }
});
test('complete city records and saved project identifiers agree between browser and backend',()=>{
 const backend=new Map(PROJECTS.map(p=>[p.id,p]));
 const index=read('public/data/coverage/project-index.json');
 for(const [key,c] of Object.entries(manifest.cities))for(const row of full(key)){
  assert.equal(index[row.id],key);assert.equal(backend.get(row.id)?.city,key);
  assert.ok(row.sourceUrl.startsWith('https://'));assert.equal(row.lat==null,row.lng==null);
  if(row.sourceType==='ceqanet'){assert.equal(row.lat,null);assert.equal(row.units,null);assert.match(row.flag,/Environmental filing/);assert.ok(!row.desc.includes('<'));}
 }
});
test('new locality outlines and photo credits are retained without inventing market data',()=>{
 const boundaries=read('public/data/coverage/boundaries.json').cities;
 for(const [key,c] of Object.entries(manifest.cities)){
  assert.ok(boundaries[key].rings.length,key);
  assert.equal(c.stats.homeValue,null);assert.equal(c.stats.rent,null);
  const photo=manifest.photos[key];if(photo){assert.ok(photo.by&&photo.lic&&photo.source);assert.ok(existsSync(new URL('../public'+photo.url,import.meta.url)));}
 }
});
function loader(fetcher){
 const root={COVERAGE_EXPANSION:{cities:{a:{label:'A',recordsUrl:'/data/coverage/a.json',recordCount:2,data:[]}},photos:{},meetings:{},activity:{}},REGIONAL_DATA:{cities:{original:{label:'Original'}}},LOCAL_CITY_PHOTOS:{},MEETING_DIRECTORY:{},HOUSING_RECORDS:{activity:{}},fetch:fetcher};
 const ctx=vm.createContext(root);
 vm.runInContext(readFileSync(new URL('../public/coverage-data.js',import.meta.url),'utf8'),ctx);
 return {api:ctx.DashboardCoverage,cities:ctx.REGIONAL_DATA.cities};
}
test('opening a locality deduplicates requests and retains every full record',async()=>{
 let resolve,calls=0;
 const c=loader(()=>{calls++;return new Promise(r=>{resolve=r;});});
 const first=c.api.load('a',c.cities),second=c.api.load('a',c.cities);
 assert.equal(calls,1);assert.equal(c.cities.original.label,'Original');
 resolve({ok:true,json:async()=>({records:[{id:'1',lastDate:'2026-10-01'},{id:'2',lastDate:'2026-10-02'}]})});
 await Promise.all([first,second]);assert.equal(c.cities.a.data.length,2);assert.equal(c.cities.a.feed.length,2);
 assert.equal(await c.api.load('a',c.cities),false);assert.equal(calls,1);
});
test('failed or partial locality loads retain existing records and can be retried',async()=>{
 let attempt=0;
 const c=loader(async()=>{attempt++;return {ok:true,json:async()=>({records:attempt===1?[{id:'partial'}]:[{id:'1'},{id:'2'}]})};});
 c.cities.a.data=[{id:'preview'}];
 await assert.rejects(c.api.load('a',c.cities),/Incomplete/);assert.equal(c.cities.a.data[0].id,'preview');
 await c.api.load('a',c.cities);assert.equal(c.cities.a.data.length,2);assert.equal(attempt,2);
});
test('the existing site remains the entrypoint with its original tabs and map integration',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<title>The Bay Dashboard<\/title>/);assert.match(html,/id="mapGoogle"/);
 assert.match(html,/id="onboardOverlay"/);assert.match(html,/src="\/guest.js"/);assert.match(html,/src="\/admin-content.js"/);
 assert.ok(!existsSync(new URL('../public/cal/index.html',import.meta.url)));
 assert.ok(!existsSync(new URL('../render-cal.yaml',import.meta.url)));
});
