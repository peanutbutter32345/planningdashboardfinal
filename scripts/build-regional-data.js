// Reproducible regional expansion. Sources are public city pages and ACS Census tables.
import {readFileSync,writeFileSync} from 'node:fs';
const rows=[
['sanjose','San Jose','Santa Clara',37.3382,-121.8863,'68000','https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/planning-division/major-development-projects','https://sanjose.legistar.com/Calendar.aspx'],
['sanfrancisco','San Francisco','San Francisco',37.7749,-122.4194,'67000','https://sfplanning.org/major-development-projects','https://sfgov.legistar.com/Calendar.aspx'],
['berkeley','Berkeley','Alameda',37.8715,-122.2730,'06000','https://berkeleyca.gov/construction-development/land-use-development','https://berkeleyca.gov/your-government/boards-commissions/planning-commission'],
['oakland','Oakland','Alameda',37.8044,-122.2712,'53000','https://www.oaklandca.gov/Planning-Building/Major-Development-Projects','https://oakland.legistar.com/Calendar.aspx'],
['albany','Albany','Alameda',37.8869,-122.2977,'00674','https://www.albanyca.gov/Departments/Community-Development/Planning-Zoning/Major-Projects','https://www.albanyca.gov/Government/Meetings-Agendas'],
['emeryville','Emeryville','Alameda',37.8313,-122.2852,'22594','https://www.emeryville.org/Development/Projects-Permitting/Major-Development-Projects','https://emeryville.legistar.com/Calendar.aspx'],
['alameda','Alameda','Alameda',37.7652,-122.2416,'00562','https://www.alamedaca.gov/Departments/Planning-Building-and-Transportation/Planning-Division/Major-Planning-Projects','https://alameda.legistar.com/Calendar.aspx'],
['fremont','Fremont','Alameda',37.5483,-121.9886,'26000','https://www.fremont.gov/government/departments/planning','https://www.fremont.gov/government/agenda-center'],
['newark','Newark','Alameda',37.5297,-122.0402,'50916','https://www.newarkca.gov/departments/community-development/planning-division/development-projects','https://www.newarkca.gov/departments/council-meetings-agendas-minutes'],
['unioncity','Union City','Alameda',37.5934,-122.0438,'81204','https://www.unioncityca.gov/462/Station-East-Residential','https://www.unioncityca.gov/AgendaCenter'],
['hayward','Hayward','Alameda',37.6688,-122.0808,'33000','https://www.hayward-ca.gov/business/for-developers','https://hayward.legistar.com/Calendar.aspx'],
['sanleandro','San Leandro','Alameda',37.7249,-122.1561,'68084','https://www.sanleandro.org/1300/Development-Activities','https://sanleandro.legistar.com/Calendar.aspx'],
['elcerrito','El Cerrito','Contra Costa',37.9161,-122.3108,'21796','https://www.elcerrito.gov/198/New-Development','https://www.elcerrito.gov/Archive.aspx'],
['richmond','Richmond','Contra Costa',37.9358,-122.3477,'60620','https://www.ci.richmond.ca.us/2098/Planning-Division','https://www.ci.richmond.ca.us/Archive.aspx?AMID=30'],
['sausalito','Sausalito','Marin',37.8591,-122.4853,'70364','https://www.sausalito.gov/departments/community-development/planning-building-project-status','https://www.sausalito.gov/city-government/city-council/meetings-and-agendas'],
['millvalley','Mill Valley','Marin',37.9060,-122.5450,'47710','https://www.cityofmillvalley.gov/201/Planning-Building','https://www.cityofmillvalley.gov/AgendaCenter'],
['tiburon','Tiburon','Marin',37.8735,-122.4566,'78666','https://www.townoftiburon.gov/520/Projects-Under-Review','https://www.townoftiburon.gov/266/Agendas-Minutes']
];
const output=new URL('../public/data/regions.json',import.meta.url);
let data;try{data=JSON.parse(readFileSync(output));}catch{data={reviewed:'2026-09-19',cities:{}};}
for(const [key,label,county,lat,lng,fips,planning,meetings] of rows){
 const old=data.cities[key]||{};
 data.cities[key]={...old,label,county,center:{lat,lng},zoom:key==='sanjose'?11:12,bbox:{minLat:lat-.07,maxLat:lat+.07,minLng:lng-.08,maxLng:lng+.08},fips,planning,meetings,reviewed:'2026-09-19',data:old.data||[],news:old.news||[],resources:old.resources||[],stats:old.stats||{}};
}
const headers={'User-Agent':'SouthBayDashboard/1.0 (https://southbaydashboard.com; public civic data)'};
if(process.argv.includes('--census')){
 const entries=Object.entries(data.cities);
 for(let offset=0;offset<entries.length;offset+=20){
 const batch=entries.slice(offset,offset+20);
 const ids=batch.map(([,c])=>'16000US06'+c.fips);
 const url='https://api.censusreporter.org/1.0/data/show/acs2024_5yr?table_ids=B01003,B19013,B25064,B25003,B25035,B25077,B08301,B08013&geo_ids='+ids.join(',');
 const res=await fetch(url,{headers,signal:AbortSignal.timeout(45000)});if(!res.ok)throw Error('ACS '+res.status);const json=await res.json();
 for(const [key,{label,fips}] of batch){
  const id='16000US06'+fips;const d=json.data[id];const name=json.geography[id].name;
  if(!name.toLowerCase().includes(label.toLowerCase()))throw Error('Wrong Census geography '+key+' '+name);
  const v=(table,col)=>{const x=d[table].estimate[table+col];return typeof x==='number'&&x>=0?x:null;};
  const ratio=(n,d)=>n!==null&&d!==null&&d>0?n/d:null;
  const share=(n,d)=>{const x=ratio(n,d);return x===null?null:x*100;};
  const total=v('B08301','001'),home=v('B08301','021');
  const commuters=total!==null&&home!==null?total-home:null;
  data.cities[key].stats={population:v('B01003','001'),medianIncome:v('B19013','001'),medianGrossRent:v('B25064','001'),renterSharePct:share(v('B25003','003'),v('B25003','001')),medianYearBuilt:v('B25035','001'),censusHomeValue:v('B25077','001'),meanCommuteMin:ratio(v('B08013','001'),commuters),transitSharePct:share(v('B08301','010'),v('B08301','001')),homeValue:null,rent:null,homeValueSeries:[],rentSeries:[],asOf:'2020–2024 ACS 5-year',source:'https://censusreporter.org/profiles/'+id+'/',sourceApi:url};
  console.log(key,name,data.cities[key].stats.population);
 }
 }
}
writeFileSync(output,JSON.stringify(data,null,2)+'\n');
writeFileSync(new URL('../public/data/regions.js',import.meta.url),'// Generated from regions.json by scripts/build-regional-data.js\nwindow.REGIONAL_DATA = '+JSON.stringify(data)+';\n');
