// Read-only checks. Never calls registration, email, subscription, or cron routes.
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url)));
const expansion=read('scripts/cal/expansion-areas.json');
const targets=new Set(expansion.anchors.flatMap(a=>[a.name,...a.nearby.filter(p=>p.kind==='city').map(p=>p.name)]));
const manifest=read('public/data/coverage/manifest.json');
let previous={results:[]};try{previous=read('public/cal/data/connection-audit.json')}catch{}
const reuse=process.argv.includes('--retry')&&Date.now()-Date.parse(previous.checked)<3600000;
const prior=new Map(previous.results.map(r=>[r.url,r]));
const checks=new Map();
const headers={'User-Agent':'Mozilla/5.0 (compatible; BayDashboard source check)','Accept-Language':'en-US,en;q=0.9'};
function add(url,kind,label){if(!url?.startsWith('https://'))return;if(!checks.has(url))checks.set(url,{url,kind,labels:[]});checks.get(url).labels.push(label);}
for(const [key,c] of Object.entries(manifest.cities).filter(([,c])=>targets.has(c.label))){
 for(const r of c.resources)add(r.url,'resource',c.label+': '+r.title);
 for(const b of [...c.deciders,...c.join])add(b.link,'board',c.label+': '+b.name);
 for(const n of c.news)add(n.url,'news',c.label+': '+n.title);
 for(const layer of c.zoningLayers||[])add(layer.url+'/query?where=1%3D1&outFields='+encodeURIComponent(layer.field)+'&returnGeometry=false&resultRecordCount=1&f=json','arcgis',c.label+' zoning');
 const records=read('public/data/coverage/'+key+'.json').records;
 const row=records.find(r=>r.sourceType==='hcd-apr');if(row)add(row.sourceUrl,'hcd',c.label+' housing API');
}
// Check news, named boards, zoning and meeting directories across the entire expansion.
for(const c of Object.values(manifest.cities)){
 for(const b of [...c.deciders,...c.join])add(b.link,'board',c.label+': '+b.name);
 for(const n of c.news)add(n.url,'news',c.label+': '+n.title);
 add(c.meetings,'meeting-directory',c.label+' agendas');
 for(const layer of c.zoningLayers||[])add(layer.url+'/query?where=1%3D1&outFields='+encodeURIComponent(layer.field)+'&returnGeometry=false&resultRecordCount=1&f=json','arcgis',c.label+' zoning');
}
const meetings={...read('public/data/meetings.json'),...manifest.meetings};
for(const c of Object.values(meetings))if(c.client&&!c.alias)add('https://webapi.legistar.com/v1/'+c.client+'/Events?$top=1&$orderby=EventDate%20desc','legistar',c.label+' live meeting API');
for(const path of ['/api/health','/api/sources?city=losangeles','/api/hearings'])add('https://baydashboard.com'+path,'site-api','Production '+path);
console.log('Checking resources for '+targets.size+' target cities and news, boards, meeting directories and zoning across all '+Object.keys(manifest.cities).length+' expansion profiles');
const items=[...checks.values()];let next=0;const results=[];
async function check(item){
 const old=prior.get(item.url);if(reuse&&old?.status==='reachable')return {...old,...item,checkedAt:old.checkedAt||previous.checked};
 const started=Date.now();
 try{
  const isJson=['arcgis','hcd','legistar','site-api'].includes(item.kind);
  let res=await fetch(item.url,{method:'GET',headers,signal:AbortSignal.timeout(18000)});
  if(!isJson&&[403,404,405,501].includes(res.status))res=await fetch(item.url,{headers,signal:AbortSignal.timeout(18000)});
  let status=res.ok?'reachable':res.status===403||res.status===429?'restricted':'failed',detail=null;
  if(res.ok&&isJson){
   const body=await res.json();
   if(item.kind==='hcd'&&(!body.success||!Array.isArray(body.result?.records)||!body.result.records.length)){status='failed';detail='Missing HCD records';}
   if(item.kind==='legistar'){if(!Array.isArray(body)){status='failed';detail='Invalid meeting payload';}else detail={sampleCount:body.length,latestEvent:body[0]?.EventDate||null};}
   if(item.kind==='arcgis'&&(body.error||!body.features?.length)){status='failed';detail=body.error?.message||'No zoning sample';}
   if(item.kind==='site-api'&&body.errors?.length)detail={upstreamErrors:body.errors};
   if(item.kind==='site-api'&&item.url.endsWith('/api/health'))detail=body;
  }else await res.body?.cancel();
  return {...item,checkedAt:new Date().toISOString(),status,http:res.status,finalUrl:res.url,detail,ms:Date.now()-started};
 }catch(error){return {...item,checkedAt:new Date().toISOString(),status:'unavailable',detail:error.message,ms:Date.now()-started};}
}
await Promise.all(Array.from({length:4},async()=>{while(next<items.length){const item=items[next++];const result=await check(item);results.push(result);if(result.status!=='reachable')console.log(result.status,result.http||'',item.url);}}));
results.sort((a,b)=>a.url.localeCompare(b.url));
const summary={};for(const r of results)summary[r.status]=(summary[r.status]||0)+1;
const report={checked:new Date().toISOString(),scope:{resourceCities:[...targets],newsBoardsMeetingsZoning:'All '+Object.keys(manifest.cities).length+' expansion profiles',liveMeetingFeeds:'All configured clients'},note:'HTTP reachability is not a guarantee of content freshness. Restricted hosts may work in a browser. --retry reuses successful checks from the past hour; each result preserves its check time. HCD, zoning and meeting JSON payloads are validated. Production mutations and emails are not invoked.',summary,results};
writeFileSync(new URL('../../public/cal/data/connection-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
