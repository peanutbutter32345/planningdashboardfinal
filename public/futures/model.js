// Transparent sensitivity model, not an empirically calibrated housing forecast.
export const MODEL_VERSION = '2.0';
export const AS_OF = '2026-09-18';
export const BASE_YEAR = 2026;
export const DEFAULTS = Object.freeze({year:2031, rate:6, costs:3, delay:0, gridDelay:0, priceTrend:2, elasticity:1, floodDiscount:0, energyUse:5000, policies:[]});
export const STAGES = Object.freeze({proposed:{years:6, cap:.55}, review:{years:4.5, cap:.70}, approved:{years:3, cap:.85}, construction:{years:1.5, cap:.95}});
export const POLICIES = [
  {id:'sb79', code:'SB 79', session:'2025–26', title:'More homes near transit', status:'Enacted', date:'Operative July 1, 2026', kind:'enacted', tag:'Transit', effect:'Test 9 months faster delivery for early-stage projects within ½ mile of a mapped station.', summary:'Creates a housing pathway near qualifying transit. Local ordinances, alternative plans and site-specific exceptions still matter.', caveat:'Our approximate station buffers do not establish SB 79 eligibility or additional zoning capacity.', source:'https://www.hcd.ca.gov/planning-and-research/sb79-tod', sourceLabel:'California HCD', months:9},
  {id:'ab130', code:'AB 130', session:'2025–26', title:'A shorter path for infill', status:'Enacted', date:'Signed June 30, 2025', kind:'enacted', tag:'Review', effect:'Test 6 months faster delivery for proposed and under-review housing.', summary:'Adds a CEQA exemption for qualifying infill housing, subject to statutory conditions.', caveat:'Infill, site and labor eligibility are not established by this dataset; this is a broad sensitivity test.', source:'https://www.gov.ca.gov/2025/06/30/governor-newsom-signs-into-law-groundbreaking-reforms-to-build-more-housing-affordability/', sourceLabel:'Governor of California', months:6},
  {id:'sb423', code:'SB 423', session:'2023–24', title:'Streamlined housing approvals', status:'Enacted', date:'Check current HCD determinations', kind:'enacted', tag:'Approvals', effect:'Test 6 months faster delivery for early-stage projects with ≥10% disclosed affordable units.', summary:'Updates the streamlined ministerial approval pathway. Requirements depend on the jurisdiction and qualifying project.', caveat:'The 10% screen is a modeling proxy, not a determination of legal eligibility. Some jurisdictions require 50%.', source:'https://www.hcd.ca.gov/planning-and-community-development/statutory-determinations', sourceLabel:'California HCD', months:6},
  {id:'sb417', code:'SB 417 / Prop. 1', session:'2025–26', title:'Affordable housing bond', status:'On the ballot', date:'Vote: November 3, 2026', kind:'pending', tag:'Funding', effect:'If approved and funded, test 9 months faster delivery from 2028 for projects with ≥50% disclosed affordable units.', summary:'The November 2026 measure would authorize $11.25 billion in statewide housing bonds if voters approve it.', caveat:'Passage, local allocation and funding timing are unknown. 2028 and the delivery effect are assumptions, not a funding commitment.', source:'https://voterguide.sos.ca.gov/propositions/1/title-summary.htm', sourceLabel:'CA Secretary of State', months:9},
  {id:'sb131', code:'SB 131', session:'2025–26', title:'Environmental review reform', status:'Enacted', date:'Signed June 30, 2025', kind:'enacted', tag:'Watchlist', effect:'Context only · no separate model effect.', summary:'Changes environmental review pathways alongside AB 130. Tracked here without stacking another blanket housing benefit.', caveat:'Application depends on project specifics. No additional speed assumption is assigned.', source:'https://www.gov.ca.gov/2025/06/30/governor-newsom-signs-into-law-groundbreaking-reforms-to-build-more-housing-affordability/', sourceLabel:'Governor of California', months:0}
];
// Approximate station centers, hand-curated for geographic context. Not an official TOD layer.
// Subset of Caltrain/BART; VTA, BRT, service frequency, entrances and parcel boundaries omitted.
export const STATIONS = [
 ['Daly City BART',37.7062,-122.4691],['Colma BART',37.6846,-122.4662],['South SF BART',37.6642,-122.4441],['San Bruno BART',37.6378,-122.4161],
 ['Millbrae',37.6003,-122.3867],['Burlingame',37.5795,-122.3450],['San Mateo',37.5680,-122.3240],['Hayward Park',37.5532,-122.3090],['Hillsdale',37.5375,-122.2970],['Belmont',37.5208,-122.2758],['San Carlos',37.5073,-122.2604],['Redwood City',37.4852,-122.2320],['Menlo Park',37.4540,-122.1822],['Palo Alto',37.4433,-122.1650],['California Avenue',37.4292,-122.1420],['San Antonio',37.4073,-122.1072],['Mountain View',37.3945,-122.0760],['Sunnyvale',37.3785,-122.0308],['Lawrence',37.3705,-121.9976],['Santa Clara',37.3532,-121.9366],['San Jose Diridon',37.3297,-121.9024],['Tamien',37.3111,-121.8847],['Milpitas BART',37.4103,-121.8910],['Berryessa BART',37.3684,-121.8747],['Morgan Hill',37.1296,-121.6506],['Gilroy',37.0035,-121.5661],['South SF Caltrain',37.6556,-122.4043],['San Bruno Caltrain',37.6306,-122.4118]
].map(([name,lat,lng])=>({name,lat,lng}));
const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const number = (v,fallback)=>v!==null && v!=='' && Number.isFinite(Number(v)) ? Number(v) : fallback;
export function normalizeSettings(input={}){
 const rawPolicies = Array.isArray(input.policies) ? input.policies : [];
 return {year:Math.round(clamp(number(input.year,2031),2027,2040)), rate:clamp(number(input.rate,6),3,10), costs:clamp(number(input.costs,3),-2,8), delay:clamp(number(input.delay,0),-12,24), gridDelay:clamp(number(input.gridDelay,0),0,24), priceTrend:clamp(number(input.priceTrend,2),-5,8), elasticity:clamp(number(input.elasticity,1),0,3), floodDiscount:clamp(number(input.floodDiscount,0),0,30), energyUse:clamp(number(input.energyUse,5000),2000,12000), policies:[...new Set(rawPolicies.filter(id=>POLICIES.some(p=>p.id===id && p.months>0)))]};
}
export function distanceKm(a,b){
 if(!validPoint(a)||!validPoint(b)) return Infinity;
 const r=Math.PI/180, dlat=(b.lat-a.lat)*r, dlng=(b.lng-a.lng)*r;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;
 return 6371*2*Math.asin(Math.sqrt(clamp(h,0,1)));
}
export function validPoint(p){return Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;}
export function nearestStation(p){return STATIONS.reduce((best,s)=>{const km=distanceKm(p,s);return km<best.km?{...s,km}:best;},{name:'No mapped station',km:Infinity});}
export function projectEstimate(project,input={}){
 const settings=normalizeSettings(input), stage=Object.hasOwn(STAGES,project.stage)?STAGES[project.stage]:null;
 const units=Number.isFinite(project.units)&&project.units>0?project.units:0;
 if(!stage||!units||!['Residential','Mixed Use'].includes(project.type)) return null;
 const station=nearestStation(project), early=['proposed','review'].includes(project.stage);
 const bmr=Number.isFinite(project.bmr)&&project.bmr>=0?Math.min(units,project.bmr):null;
 const selected=new Set(settings.policies), effects=[];
 if(early&&selected.has('sb79')&&station.km<=.804672) effects.push({id:'sb79',months:9});
 if(early&&selected.has('ab130')) effects.push({id:'ab130',months:6});
 if(early&&selected.has('sb423')&&bmr!==null&&bmr/units>=.1) effects.push({id:'sb423',months:6});
 if(project.stage!=='construction'&&selected.has('sb417')&&settings.year>=2028&&bmr!==null&&bmr/units>=.5) effects.push({id:'sb417',months:9});
 const months=Math.min(18,effects.reduce((n,e)=>n+e.months,0));
 // These coefficients are scenario assumptions, explicitly surfaced in the methodology.
 const multiplier=clamp(1+(settings.rate-6)*.10+(settings.costs-3)*.04,.45,1.8);
 const years=Math.max(.5,stage.years*multiplier+(settings.delay+settings.gridDelay)/12-months/12);
 const elapsed=settings.year-BASE_YEAR;
 const fraction=t=>stage.cap*(1-Math.exp(-Math.LN2*elapsed/t));
 const expected=units*fraction(years);
 const low=units*fraction(years*1.5)*.8;
 const high=Math.min(units,units*fraction(years*.7)*1.15);
 const last=Date.parse(project.lastDate), stale=!Number.isFinite(last)||Date.parse(AS_OF)-last>730*86400000;
 return {...project,units,bmr,station,nearTransit:station.km<=.804672,expected,low,high,affordable:bmr===null?null:expected*(bmr/units),years,effects,months,stale};
}
export function estimateProjects(projects,input={}){
 const seen=new Set(), rows=[];
 for(const p of projects){const key=`${p.city||p._sourceCity||''}:${p.id}`;if(seen.has(key))continue;seen.add(key);const row=projectEstimate(p,input);if(row)rows.push(row);}
 const total=key=>rows.reduce((sum,p)=>sum+(p[key]||0),0);
 return {rows,units:total('units'),expected:total('expected'),low:total('low'),high:total('high'),affordable:total('affordable'),affordableKnown:rows.filter(p=>p.bmr!==null).length,stale:rows.filter(p=>p.stale).length,mapped:rows.filter(validPoint).length,nearTransit:rows.filter(p=>p.nearTransit).reduce((sum,p)=>sum+p.expected,0)};
}
export const MAP_DEFAULTS = Object.freeze({city:'all',layer:'heat',flood:true,energy:true,seaLevel:0,basemap:'light'});
export function readScenario(search){
 const p=new URLSearchParams(search),input={};
 for(const key of Object.keys(DEFAULTS))if(key!=='policies')input[key]=p.get(key);
 input.policies=(p.get('policies')||'').split(',');
 return {...normalizeSettings(input),city:p.get('area')||'all',layer:['heat','delivery','change','affordable','prices','exposure'].includes(p.get('layer'))?p.get('layer'):'heat',flood:p.get('flood')!=='0',energy:p.get('energy')!=='0',seaLevel:Math.round(clamp(number(p.get('seaLevel'),0),0,6)),basemap:p.get('basemap')==='satellite'?'satellite':'light'};
}
export function scenarioQuery(state){
 const s=normalizeSettings(state);
 return new URLSearchParams({...s,policies:s.policies.join(','),view:'futures',area:state.city||'all',layer:state.layer||'heat',flood:state.flood===false?'0':'1',energy:state.energy===false?'0':'1',seaLevel:state.seaLevel||0,basemap:state.basemap||'light'}).toString();
}

// How much of a city's price marker to draw at a given zoom. A hundred labelled cards at regional
// zoom cover each other and the map under them, so the marker is a dot until the reader is close
// enough for the labels to have room.
export function priceMarkerSize(zoom){
 if(!Number.isFinite(zoom))return 'dot';
 if(zoom>=11.5)return 'card';
 if(zoom>=10.2)return 'chip';
 return 'dot';
}
