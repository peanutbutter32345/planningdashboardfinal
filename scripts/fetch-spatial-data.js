// Public, reproducible snapshots. No credentials; never substitutes invented hazard data.
import {writeFileSync,mkdirSync} from 'node:fs';
import {dashboardProjects} from './sync-projects.js';
import {CITY_STATS} from '../data/stats.js';
import {REGIONAL_CITIES} from '../data/regional.js';
const directory=new URL('../public/futures/data/',import.meta.url);mkdirSync(directory,{recursive:true});
const retrieved=new Date().toISOString();
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(d.error)throw new Error(JSON.stringify(d.error));return d;}
const save=(name,data)=>writeFileSync(new URL(name,directory),JSON.stringify(data));
const task=process.argv[2];
if(task==='energy'){
 const base='https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/Power_Plant/FeatureServer/0';
 const meta=await json(base+'?f=json');const url=new URL(base+'/query');url.search=new URLSearchParams({f:'geojson',where:"County IN ('Santa Clara','San Mateo','Alameda','Contra Costa','San Francisco','Marin')",outFields:'CECPlantID,PlantName,Retired_Plant,County,Capacity_Latest,PriEnergySource',outSR:'4326',resultRecordCount:'3000'});
 const d=await json(url);if(d.exceededTransferLimit)throw new Error('Truncated energy response');
 save('energy.geojson',{...d,metadata:{source:base,agency:'California Energy Commission',retrieved,sourceUpdated:new Date(meta.editingInfo.lastEditDate).toISOString(),description:'Reported facilities and nameplate MW, not live generation or available grid capacity.'}});console.log(`Saved ${d.features.length} energy facilities.`);
}else if(task==='flood'){
 const base='https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28';
 const where="(SFHA_TF='T' OR ZONE_SUBTY LIKE '%0.2%') AND (DFIRM_ID LIKE '06081%' OR DFIRM_ID LIKE '06085%' OR DFIRM_ID LIKE '06001%' OR DFIRM_ID LIKE '06013%' OR DFIRM_ID LIKE '06075%' OR DFIRM_ID LIKE '06041%')";
 const make=extra=>{const u=new URL(base+'/query');u.search=new URLSearchParams({f:'geojson',where,outFields:'OBJECTID,DFIRM_ID,FLD_ZONE,ZONE_SUBTY,SFHA_TF',outSR:'4326',returnGeometry:'true',geometryPrecision:'5',maxAllowableOffset:'0.00003',orderByFields:'OBJECTID ASC',...extra});return u;};
 const count=await json(make({f:'json',returnCountOnly:'true'}));const features=[];
 for(let offset=0;offset<count.count;offset+=1000){const d=await json(make({resultOffset:String(offset),resultRecordCount:'1000'}));features.push(...d.features);console.log(`Flood zones ${features.length}/${count.count}`);}
 if(features.length!==count.count||new Set(features.map(f=>f.properties.OBJECTID)).size!==count.count)throw new Error('Incomplete or duplicate flood geometry');
 save('flood.geojson',{type:'FeatureCollection',features,metadata:{source:base,agency:'FEMA National Flood Hazard Layer',retrieved,count:count.count,requestedCounties:['San Mateo','Santa Clara','Alameda','Contra Costa','San Francisco','Marin'],counties:[...new Set(features.map(f=>({'06081C':'San Mateo','06085C':'Santa Clara','06001C':'Alameda','06013C':'Contra Costa','06075C':'San Francisco','06041C':'Marin'}[f.properties.DFIRM_ID])))],coverageNote:'The query includes six counties. Only counties returning mapped hazard polygons are listed as available. Missing polygons do not establish low risk.',description:'Special flood hazard and 0.2% annual-chance zones. Geometry generalized to approximately 3 m for screening; not an insurance or parcel determination. No match is not no risk.'}});
}else if(task==='housing'){
 const cities=[...new Set([...dashboardProjects().map(p=>p.city),...Object.keys(REGIONAL_CITIES)])];const data={};
 for(let i=0;i<cities.length;i+=4){await Promise.all(cities.slice(i,i+4).map(async city=>{
  const name=city==='westsanjose'?'San Jose':CITY_STATS[city]?.zillowName;
  // The site's supplied market index names are not present for every city.
  const names={gilroy:'Gilroy',morganhill:'Morgan Hill',santaclara:'Santa Clara',losgatos:'Los Gatos'};
  const label=name||REGIONAL_CITIES[city]?.label||names[city]||city;
  const slug=label.toLowerCase().replaceAll(' ','_');
  const url='https://census.bayareametro.gov/housing-units?location='+slug;
  const r=await fetch(url,{signal:AbortSignal.timeout(25000)});const html=await r.text();
  const text=html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const match=text.match(/had a total of\s+([\d,]+)\s+housing units in 2020/i);
  if(!match)throw new Error(`Missing housing stock for ${city} (${slug})`);
  data[city]={units:Number(match[1].replaceAll(',','')),year:2020,source:url,geography:label};
  console.log(city,data[city].units);
 }));}
 save('housing-stock.json',{metadata:{source:'https://census.bayareametro.gov/housing-units',agency:'MTC / ABAG; U.S. Census 2020 DHC H3',retrieved,description:'2020 housing stock. Older than project and price snapshots; not current housing stock.'},cities:data});
}else throw new Error('Choose energy, flood or housing');
