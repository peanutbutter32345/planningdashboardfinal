// Optional refresh of address points from the public US Census geocoder.
// Keep ambiguous matches unmapped; never replace missing coordinates with a city center.
import {readFileSync,writeFileSync} from 'node:fs';
const file=new URL('../public/data/regions.json',import.meta.url);
const data=JSON.parse(readFileSync(file));
const candidates=Object.values(data.cities).flatMap(c=>c.data.filter(p=>p.lat==null&&/^\d+\s/.test(p.addr)).map(p=>({p,city:c.label})));
for(let i=0;i<candidates.length;i+=3){await Promise.all(candidates.slice(i,i+3).map(async({p,city})=>{
 const address=p.addr.split(/\s[\/—]\s/)[0]+', '+city+', CA';
 const url=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');url.search=new URLSearchParams({address,benchmark:'Public_AR_Current',format:'json'});
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);
  const j=await r.json();const a=j.result?.addressMatches||[];
  if(a.length!==1||a[0].addressComponents?.city?.toLowerCase()!==city.toLowerCase()){console.log(p.id,'no unambiguous city match');return;}
  const {x:lng,y:lat}=a[0].coordinates;
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  Object.assign(p,{lat,lng,locationAccuracy:'Approximate Census address match; not parcel geometry',geocodeSource:url.href});
  p.flag=p.flag.replace(' Map coordinates not verified.','')+' Approximate address point from the US Census geocoder.';
  console.log(p.id,'located');
 }catch(e){console.log(p.id,e.message);}
}));}
writeFileSync(file,JSON.stringify(data,null,2)+'\n');
