import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import express from 'express';
import {registerCalDashboard} from '../cal-dashboard.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const manifest=read('public/data/coverage/manifest.json');
const places=Object.entries(manifest.cities).filter(([,c])=>c.districts.includes('24'));
const app=express();registerCalDashboard(app);const server=app.listen(0);
await new Promise(resolve=>server.once('listening',resolve));
after(()=>new Promise(resolve=>server.close(resolve)));
const base='http://127.0.0.1:'+server.address().port;
const get=async path=>{const response=await fetch(base+path);assert.equal(response.status,200,path);return response.json();};

test('all 55 CA-24 localities load complete records without losing or duplicating a project',async()=>{
 assert.equal(places.length,55);
 const requests=new Map();
 const context=vm.createContext({COVERAGE_EXPANSION:structuredClone(manifest),REGIONAL_DATA:{cities:{}},LOCAL_CITY_PHOTOS:{},MEETING_DIRECTORY:{},HOUSING_RECORDS:{activity:{}},fetch:async url=>{
  requests.set(url,(requests.get(url)||0)+1);
  return {ok:true,json:async()=>read('public'+url)};
 }});
 vm.runInContext(readFileSync(new URL('../public/coverage-data.js',import.meta.url),'utf8'),context);
 await Promise.all(places.flatMap(([key])=>[context.DashboardCoverage.load(key,context.REGIONAL_DATA.cities),context.DashboardCoverage.load(key,context.REGIONAL_DATA.cities)]));
 for(const [key,c] of places){
  const actual=context.REGIONAL_DATA.cities[key].data,expected=read('public'+c.recordsUrl).records;
  assert.equal(actual.length,c.recordCount,c.label);
  assert.equal(new Set(actual.map(r=>r.id)).size,actual.length,c.label);
  assert.deepEqual(Array.from(actual,r=>r.id),expected.map(r=>r.id),c.label);
  assert.equal(requests.get(c.recordsUrl),1,c.label);
 }
});

test('every CA-24 detail, housing pagination, environmental pagination and map endpoint responds consistently',async()=>{
 for(const [,c] of places){
  const id=c.coverageId;
  const detail=await get('/api/cal/place/'+id);
  assert.ok(detail.resources.length&&detail.statistics&&detail.housing,c.label);
  assert.ok(detail.boardUrl&&detail.meetingUrl,c.label);
  for(const path of ['/api/cal/projects?id=','/api/cal/environmental?id=']){
   const first=await get(path+id),last=await get(path+id+'&page='+first.pages);
   assert.equal(first.total,last.total,c.label);
   const ids=new Set(first.records.map(r=>r.id));
   if(first.pages>1)assert.ok(last.records.every(r=>!ids.has(r.id)),c.label);
  }
  const map=await get('/api/cal/map?id='+id+'&district=24');
  assert.equal(map.count,map.points.length,c.label);
  assert.equal(new Set(map.points.map(p=>p.id)).size,map.count,c.label);
  assert.ok(map.points.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)),c.label);
 }
 for(const boundary of ['119','120']){
  const map=await get('/api/cal/map?district=24&boundary='+boundary);
  assert.ok(map.count>0);assert.equal(new Set(map.points.map(p=>p.id)).size,map.count);
 }
});

test('CA-24 retains official board, zoning, transport and statistics sources with honest regional news labels',()=>{
 for(const [,c] of places){
  assert.ok(c.resources.some(r=>/Zoning|GIS/.test(r.cat)),c.label);
  assert.ok(c.resources.some(r=>r.cat==='Transportation'),c.label);
  if(c.kind==='city')assert.doesNotMatch(c.planning,/countyofsb|slocounty|venturacounty/,c.label);
  assert.ok(c.deciders.length&&c.join.length,c.label);
  assert.ok(c.news.length,c.label);
  for(const n of c.news.filter(n=>n.scope==='county')){assert.equal(n.sourceArea,c.county+' County');assert.match(n.snippet,/outside/);}
  for(const b of [...c.deciders,...c.join])assert.doesNotMatch(b.name,/ordinance(?! committee)|never certified/i);
 }
 for(const key of ['oxnard','sanbuenaventuraventura'])assert.ok(manifest.cities[key].zoningLayers.length,key);
 for(const key of ['arroyogrande','groverbeach','oxnard']){
  const c=manifest.cities[key];
  assert.ok(c.resources.filter(r=>r.cat==='Zoning').every(r=>!/(slocounty|venturacounty)\./.test(new URL(r.url).hostname)),key);
 }
 const news=places.flatMap(([,c])=>c.news);
 assert.ok(news.some(n=>n.topic==='transportation'&&n.source!=='California CEQAnet · official filing'));
 assert.ok(news.some(n=>n.topic==='housing'&&n.source!=='California CEQAnet · official filing'));
});

test('topic classification preserves source categories and environmental filing status',()=>{
 const script=`import sys,json\nsys.path.insert(0,'scripts/cal')\nfrom topics import article_topic,record_type\nprint(json.dumps([article_topic(x) for x in ['New apartments proposed in Goleta','Bus service expansion','Council adopts budget']]+[record_type(x) for x in [{'name':'Highway 101 bridge replacement'},{'name':'Railroad Avenue apartments','developmentType':'Residential'},{'name':'Warehouse development'},{'name':'Park restoration'}]]))`;
 const output=JSON.parse(execFileSync('python3',['-c',script],{cwd:new URL('../',import.meta.url)}));
 assert.deepEqual(output,['housing','transportation','developments','Transportation','Residential','Industrial','Environmental review']);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const start=html.indexOf('function topicCategoryMatches('),end=html.indexOf('// ============== SUNNYVALE',start);
 const matches=vm.runInNewContext(html.slice(start,end)+';topicCategoryMatches');
 assert.equal(matches({type:'Environmental review'},'Building'),true);
 assert.equal(matches({type:'Industrial'},'Building'),true);
 assert.equal(matches({type:'Transportation'},'Housing'),false);
 for(const [,c] of places)for(const r of read('public'+c.recordsUrl).records.filter(r=>r.sourceType==='ceqanet'))assert.equal(r.stage,'filed');
});

test('publisher names and county headlines cannot masquerade as city reporting',()=>{
 const script=`import sys,json
sys.path.insert(0,'scripts/cal')
from topics import local_headline
print(json.dumps([local_headline(*x) for x in [('Montecito housing proposal - The Santa Barbara Independent','The Santa Barbara Independent','Santa Barbara','city'),('Santa Barbara County approves road funding - KSBY','KSBY','Santa Barbara','city'),('Santa Barbara MTD changes bus service - KSBY','KSBY','Santa Barbara','city')]]))`;
 assert.deepEqual(JSON.parse(execFileSync('python3',['-c',script],{cwd:new URL('../',import.meta.url)})),[null,null,'Santa Barbara MTD changes bus service']);
});

test('published environmental coordinates reject malformed points, other places and polygon holes',()=>{
 const script=`import sys,json
sys.path.insert(0,'scripts/cal')
from coordinates import published_point,within_locality
point=published_point('34°25\\\'23"N 119°49\\\'58"W')
geometry={'type':'Polygon','coordinates':[[[-120,34],[-119,34],[-119,35],[-120,35],[-120,34]],[[-119.9,34.3],[-119.7,34.3],[-119.7,34.5],[-119.9,34.5],[-119.9,34.3]]]}
print(json.dumps([point,published_point('34°99\\\'0"N 119°0\\\'0"W'),published_point('unknown'),within_locality(point,geometry),within_locality((-119.5,34.5),geometry),within_locality((-118,34),geometry)]))`;
 const result=JSON.parse(execFileSync('python3',['-c',script],{cwd:new URL('../',import.meta.url)}));
 assert.ok(Math.abs(result[0][0]+119.83277778)<1e-6);assert.ok(Math.abs(result[0][1]-34.42305556)<1e-6);
 assert.deepEqual(result.slice(1),[null,null,false,true,false]);
 const source=read('public/cal/data/environmental.json');
 let located=0,transport=0;
 for(const [,c] of places)for(const row of read('public'+c.recordsUrl).records.filter(r=>r.sourceType==='ceqanet'&&r.lat!==null)){
  located++;if(row.type==='Transportation')transport++;
  const original=source.records[row.id.slice(row.id.indexOf('ceqa-'))];
  assert.ok(original?.coordinates);assert.match(row.locationSource,/Published CEQAnet/);
  assert.ok(row.lat>=c.bbox.minLat&&row.lat<=c.bbox.maxLat&&row.lng>=c.bbox.minLng&&row.lng<=c.bbox.maxLng);
 }
 assert.ok(located>0);assert.ok(transport>0);
});

test('zoning ignores stale responses and keeps requests inside the API viewport limit',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('async function loadTopicZoning('),html.indexOf('function renderTopicMap('));
 let bounds=[-119.8,34.3,-119.6,34.5],zoom=12,painted=0;
 const requests=[];
 const m={zoningCity:'testcity',zoningToggle:{checked:true},zoningStatus:{textContent:''},zoning:{clearLayers(){}},map:{getBounds:()=>({getWest:()=>bounds[0],getSouth:()=>bounds[1],getEast:()=>bounds[2],getNorth:()=>bounds[3]}),getZoom:()=>zoom,setZoom:z=>{zoom=z;}}};
 const context=vm.createContext({topicMaps:{Housing:m},currentCity:'testcity',window:{COVERAGE_EXPANSION:{cities:{testcity:{coverageId:'test-id',zoningLayers:[{}]}}}},document:{getElementById:()=>({offsetWidth:900})},AbortController,escapeHtml:String,L:{geoJSON:()=>({addTo:()=>painted++})},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 vm.runInContext(code,context);
 const old=context.loadTopicZoning('Housing');
 bounds=[-119.79,34.31,-119.61,34.49];
 const latest=context.loadTopicZoning('Housing');
 assert.equal(requests[0].options.signal.aborted,true);
 const response={ok:true,json:async()=>({type:'FeatureCollection',features:[],authority:'Test city'})};
 requests[0].resolve(response);await old;assert.equal(painted,0);
 requests[1].resolve(response);await latest;assert.equal(painted,1);
 const pending=context.loadTopicZoning('Housing');await pending;assert.equal(requests.length,2,'Same bounds reuse the rendered response');
 m.zoningToggle.checked=false;await context.loadTopicZoning('Housing');assert.equal(m.zoningQuery,null);
 m.zoningToggle.checked=true;bounds=[-120,34,-119,35];await context.loadTopicZoning('Housing');
 assert.ok(zoom>12);assert.equal(requests.length,2,'Overlarge views zoom before fetching');
});

test('participation calendars stay in the chosen city or county',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const predicate=html.slice(html.indexOf('function giMatchesPlace('),html.indexOf('function giFiltered('));
 const calendar=html.slice(html.indexOf('function giMonthEvents('),html.indexOf('const GI_MONTHS'));
 const ctx=vm.createContext({giCity:'goleta',activeCounty:'Santa Barbara',CITIES:{goleta:{county:'Santa Barbara'},santabarbara:{county:'Santa Barbara'},sunnyvale:{county:'Santa Clara'}},giAllBoards:()=>[],giOnlyStarred:false,giHearings:{hearings:[{city:'goleta',date:'2026-10-27',body:'Planning Commission'},{city:'santabarbara',date:'2026-10-27',body:'Planning Commission'},{city:'sunnyvale',date:'2026-10-27',body:'City Council'}]}});
 vm.runInContext(predicate+calendar,ctx);
 assert.deepEqual(Array.from(ctx.giMonthEvents(2026,9),x=>x.city),['goleta']);
 ctx.giCity='all';assert.deepEqual(Array.from(ctx.giMonthEvents(2026,9),x=>x.city),['goleta','santabarbara']);
});

test('civic news excludes isolated crash reports and social reposts while keeping transport policy',()=>{
 const script=`import sys,json
sys.path.insert(0,'scripts/cal')
from topics import civic_news,article_topic
print(json.dumps([civic_news('Goleta highway collision leaves two injured','Local News'),civic_news('Goleta train depot project advances','Facebook'),civic_news('Goleta train depot project advances','Local News'),civic_news('Council funds safety improvements after fatal crash','Local News'),article_topic('Goleta train depot project advances')]))`;
 assert.deepEqual(JSON.parse(execFileSync('python3',['-c',script],{cwd:new URL('../',import.meta.url)})),[false,false,true,true,'transportation']);
});
