// Refresh public city-reported housing activity and a representative project sample.
// node scripts/import-hcd-housing.js [--from-dir /path/to/cached/api/responses]
import {readFileSync,writeFileSync} from 'node:fs';
import {normalizeName,normalizeRecord,recordIdentity,RESOURCE_IDS} from './lib/hcd-housing.js';
const catalog=JSON.parse(readFileSync('public/data/municipalities.json'));
const root='https://data.ca.gov/api/3/action/';
const cache=process.argv.includes('--from-dir')?process.argv[process.argv.indexOf('--from-dir')+1]:null;
const years=['2024','2025'],counties=[...new Set(catalog.cities.map(c=>c.county))];
async function get(table){
 if(cache)return JSON.parse(readFileSync(cache+'/hcd-APR-Table-'+table+'.json'));
 const packageUrl=root+'package_show?id=housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year';
 const meta=await(await fetch(packageUrl)).json();const resource=meta.result.resources.find(r=>r.id===RESOURCE_IDS[table]);
 const sql='SELECT * FROM "'+resource.id+'" WHERE "YEAR" IN ('+years.map(y=>"'"+y+"'").join(',')+') AND "CNTY_NAME" IN ('+counties.map(c=>"'"+c+"'").join(',')+') ORDER BY "YEAR" DESC, "_id" LIMIT 100000';
 const res=await fetch(root+'datastore_search_sql?'+new URLSearchParams({sql}),{signal:AbortSignal.timeout(90000)});const data=await res.json();
 if(!res.ok||!data.success||data.result.records.length>=100000)throw Error('Incomplete HCD response '+table);
 return {resource,records:data.result.records};
}
const [a,a2]=await Promise.all([get('A'),get('A2')]);
const cities={},activity={},news=[];
const resource='https://data.ca.gov/dataset/housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year';
const count=(rows,key)=>rows.reduce((sum,r)=>sum+(Number(r[key])||0),0);
for(const city of catalog.cities){
 const matches=r=>normalizeName(r.JURIS_NAME)===normalizeName(city.key==='sthelena'?'Saint Helena':city.label)&&r.CNTY_NAME===city.county;
 const allA2=a2.records.filter(matches),year=Math.max(...allA2.map(r=>Number(r.YEAR)));
 if(!Number.isFinite(year))throw Error('No annual reporting data for '+city.label);
 const annual=allA2.filter(r=>Number(r.YEAR)===year),applications=a.records.filter(r=>matches(r)&&Number(r.YEAR)===year);
 // Keep annual totals separate from the limited project sample displayed on the map.
 activity[city.key]={year,permitted:count(annual,'NO_BUILDING_PERMITS'),completed:count(annual,'NO_OTHER_FORMS_OF_READINESS'),entitled:count(annual,'NO_ENTITLEMENTS'),applications:applications.length,proposed:count(applications,'TOT_PROPOSED_UNITS'),records:annual.length,source:resource,updated:a2.resource.last_modified};
 const bySite=new Map();
 // Table A2 milestones supersede application rows at the same reported address.
 for(const [table,rows] of [['A2',annual],['A',applications]]){
  for(const r of rows){const p=normalizeRecord(r,table,city);if(!p)continue;const key=recordIdentity(r),old=bySite.get(key);
   if(!old||old.sourceLabel===p.sourceLabel&&((p.lastDate||'')>(old.lastDate||'')||p.lastDate===old.lastDate&&p.units>old.units))bySite.set(key,p);
  }
 }
 const all=[...bySite.values()].sort((x,y)=>y.units-x.units||(y.lastDate||'').localeCompare(x.lastDate||''));
 const active=all.filter(p=>p.stage!=='completed'),complete=all.filter(p=>p.stage==='completed');
 // Up to 25 records, emphasizing larger developments while retaining completed examples.
 const chosen=[...active.slice(0,20),...complete.slice(0,5)];
 if(chosen.length<25)for(const p of all)if(chosen.length<25&&!chosen.includes(p))chosen.push(p);
 cities[city.key]=chosen;
 const totals=activity[city.key];
 news.push({city:city.key,topic:'housing',title:city.label+': '+totals.permitted.toLocaleString('en-US')+' homes permitted in '+year,
  snippet:'City-reported '+year+' housing activity: '+totals.permitted.toLocaleString('en-US')+' units received building permits and '+totals.completed.toLocaleString('en-US')+' received occupancy or readiness certificates. These are annual reported milestones, not current construction counts. The state download was updated '+a2.resource.last_modified.slice(0,10)+'.',
  source:'HCD · city-reported data update',date:a2.resource.last_modified.slice(0,10),url:root+'datastore_search?'+new URLSearchParams({resource_id:RESOURCE_IDS.A2,filters:JSON.stringify({JURIS_NAME:annual[0].JURIS_NAME,YEAR:String(year)}),limit:'1000'}),kind:'data-update'});
 if(!chosen.length)throw Error('No usable housing records for '+city.label);
}
const output={metadata:{source:resource,sourceUpdated:a2.resource.last_modified,retrieved:new Date().toISOString(),years,selection:'Up to 25 distinct reported addresses per city, prioritizing larger developments and retaining completed examples. Annual totals use all source rows. HCD coordinates are screened for score and proximity; missing locations are never replaced with city centers.',counties},cities,activity,news};
writeFileSync('public/data/housing-records.json',JSON.stringify(output,null,2)+'\n');
writeFileSync('public/data/housing-records.js','// Generated by scripts/import-hcd-housing.js\nwindow.HOUSING_RECORDS = '+JSON.stringify(output)+';\n');
console.log(Object.keys(cities).length+' cities · '+Object.values(cities).flat().length+' sourced housing records · '+Object.values(cities).flat().filter(p=>p.lat!==null).length+' mapped');
