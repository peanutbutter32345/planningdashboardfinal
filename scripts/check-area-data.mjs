// Read-only checks of each covered locality. No account, email or cron requests.
// node scripts/check-area-data.mjs --base=http://127.0.0.1:4017 --live-zoning --output=/tmp/area-audit.json
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const option=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const baseURL=option('base','http://127.0.0.1:4017').replace(/\/$/,'');
const output=option('output','/tmp/california-area-audit.json');
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const manifest=read('public/data/coverage/manifest.json'),base=read('public/data/municipalities.json').cities;
const jobs=[...[...base,{key:'westsanjose',label:'West San Jose'}].map(c=>({url:baseURL+'/api/sources?city='+c.key,kind:'sources',label:c.label})),...Object.entries(manifest.cities).flatMap(([k,c])=>[{url:baseURL+'/api/sources?city='+k,kind:'sources',label:c.label},{url:baseURL+c.recordsUrl,kind:'records',label:c.label,count:c.recordCount},{url:baseURL+'/api/cal/place/'+c.coverageId,kind:'place',label:c.label}])];
const layers=new Map();for(const c of Object.values(manifest.cities))for(const layer of c.zoningLayers||[])layers.set(layer.url,{url:layer.url+'/query?where=1%3D1&outFields='+encodeURIComponent(layer.field)+'&returnGeometry=false&resultRecordCount=1&f=json',kind:'zoning',label:layer.name});
if(process.argv.includes('--live-zoning'))jobs.push(...layers.values());
let cursor=0;const results=[];
await Promise.all(Array.from({length:6},async()=>{while(cursor<jobs.length){const job=jobs[cursor++];try{const r=await fetch(job.url,{signal:AbortSignal.timeout(12000)});const d=await r.json();let ok=r.ok&&!d.error;if(job.kind==='records')ok=ok&&d.records?.length===job.count;if(job.kind==='zoning')ok=ok&&d.features?.length>0;if(job.kind==='sources')ok=ok&&Array.isArray(d)&&d.length>0;if(job.kind==='place')ok=ok&&d.id&&d.coverage?.length>0;results.push({...job,ok:Boolean(ok),http:r.status,detail:ok?null:d.error||Object.keys(d)});}catch(e){results.push({...job,ok:false,detail:e.message});}}}));
const counts={};for(const r of results){counts[r.kind]??={pass:0,fail:0};counts[r.kind][r.ok?'pass':'fail']++;}
fs.writeFileSync(output,JSON.stringify({checked:new Date().toISOString(),baseURL,counts,results},null,2)+'\n');console.log(JSON.stringify(counts));console.log(JSON.stringify(results.filter(r=>!r.ok)));

if(results.some(r=>!r.ok))process.exitCode=1;
