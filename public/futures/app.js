import {PublicLayers} from './layers.js';
import {priceScenario,annualElectricityGWh} from './spatial.js';
import {AS_OF,BASE_YEAR,DEFAULTS,MAP_DEFAULTS,MODEL_VERSION,POLICIES,STATIONS,normalizeSettings,estimateProjects,validPoint,readScenario,scenarioQuery} from './model.js';
const $=id=>document.getElementById(id);
const context=window.dashboardContext;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Math.round(value).toLocaleString('en-US');
const signed=value=>(Math.round(value)>0?'+':'')+fmt(value);
const fullProjects=context.projects;
const shared=new URLSearchParams(location.search).get('view')==='futures';
let state=shared?readScenario(location.search):{...DEFAULTS,...MAP_DEFAULTS,policies:[]};
if(!Object.hasOwn(context.cities,state.city))state.city='all';
let result,reference,rows=[],map,markers=new Map(),projectLayer,stationLayer,limit=20,selected=null,preset='baseline',toastTimer,initialized=false,publicLayers,heatLayer,priceLayer,baseLayer,labelLayer,baseKey,playTimer,expanded=false;
let cityPrices=[];
let activeView='map';
function showFutureView(view){
 const tabs=[...document.querySelectorAll('[data-fx-view]')];
 if(!tabs.some(tab=>tab.dataset.fxView===view))return;
 activeView=view;
 tabs.forEach(tab=>{const selected=tab.dataset.fxView===view;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(tab.getAttribute('aria-controls')).hidden=!selected;});
 pausePlayback();
 if(view==='map'){renderMap();requestAnimationFrame(()=>map?.invalidateSize());}
 else {if(map)clearHeat();if(view==='outlook'){renderImpacts();renderChart();}if(view==='policies')renderBills();if(view==='projects')renderTable();}
}
const money=value=>value==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const compactMoney=value=>value==null?'—':value>=1e6?'$'+(value/1e6).toFixed(2)+'M':'$'+Math.round(value/1000)+'k';
const controlKeys=['year','rate','costs','delay','gridDelay','priceTrend','elasticity','floodDiscount','energyUse'];
const cityLabel=()=>state.city==='all'?'Bay Area':context.cities[state.city].label;
function notify(message){$('fxStatus').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('fxStatus').textContent='',5000);}
function projects(){return state.city==='all'?fullProjects:fullProjects.filter(p=>p.city===state.city);}
function syncControls(){
 $('fxCity').value=state.city;
 $('fxLayerSelect').value=state.layer;
 $('fxScenarioSummary').textContent=cityLabel()+' · '+state.year+' scenario';
 for(const key of controlKeys)$('fx'+key[0].toUpperCase()+key.slice(1)).value=state[key];
 $('fxYearOut').textContent=state.year;$('fxMapYearOut').textContent=state.year;$('fxMapYear').value=state.year;
 $('fxGridDelayOut').textContent=state.gridDelay+' months';
 $('fxPriceTrendOut').textContent=state.priceTrend.toFixed(1)+'%';
 $('fxElasticityOut').textContent=state.elasticity.toFixed(2)+'×';
 $('fxFloodDiscountOut').textContent=state.floodDiscount+'%';
 $('fxEnergyUseOut').textContent=fmt(state.energyUse)+' kWh/yr';
 $('fxFlood').checked=state.flood;$('fxEnergy').checked=state.energy;$('fxSeaLevel').value=state.seaLevel;$('fxBasemap').value=state.basemap;
 $('fxSeaNote').hidden=!state.seaLevel;
 $('fxRateOut').textContent=state.rate.toFixed(2).replace(/0$/,'')+'%';
 $('fxCostsOut').textContent=state.costs.toFixed(1)+'%';
 $('fxDelayOut').textContent=signed(state.delay)+' months';
 document.querySelectorAll('[data-policy-toggle]').forEach(el=>el.checked=state.policies.includes(el.dataset.policyToggle));
 document.querySelectorAll('[data-layer]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.layer===state.layer)));
 document.querySelectorAll('[data-preset]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.preset===preset)));
 $('fxPresetNote').textContent=({baseline:'Reference: unchanged financing and no extra policy acceleration.',momentum:'Easier financing, lower cost growth and added uptake of enacted policies.',headwinds:'Higher financing costs, faster cost growth and a longer delivery delay.',coastal:'A +3 ft water-level scenario, extra grid delay and a 15% exposed-location discount. These are stress-test assumptions.',custom:'Custom scenario. Every control is an assumption you can change.'})[preset];
}
function update(fit=false){
 state={...state,...normalizeSettings(state)};
 result=estimateProjects(projects(),state);
 reference=estimateProjects(projects(),{...DEFAULTS,year:state.year});
 const base=new Map(reference.rows.map(p=>[p.id,p]));
 rows=result.rows.map(p=>({...p,baseline:base.get(p.id).expected,delta:p.expected-base.get(p.id).expected}));
 buildCityPrices();syncControls();renderMetrics();
 if(activeView==='map')renderMap(fit);
 if(activeView==='outlook'){renderImpacts();renderChart();}
 if(activeView==='policies')renderBills();
 if(activeView==='projects')renderTable();
 if(selected&&!rows.some(p=>p.id===selected))selected=null;
 if(selected&&markers.has(selected))markers.get(selected).openPopup();
}
function renderMetrics(){
 const delta=result.expected-reference.expected;
 $('fxMetrics').innerHTML=`<div class="fx-metric"><div class="fx-label">POTENTIAL DELIVERY BY ${state.year}</div><strong>${fmt(result.expected)}</strong><div class="fx-metric-note">${fmt(result.low)}–${fmt(result.high)} sensitivity range</div></div><div class="fx-metric"><div class="fx-label">CHANGE FROM REFERENCE</div><strong class="${delta>=0?'fx-positive':'fx-negative'}">${signed(delta)}</strong><div class="fx-metric-note">${reference.expected?((delta/reference.expected)*100).toFixed(1):'0.0'}% · same year & area</div></div><div class="fx-metric"><div class="fx-label">DISCLOSED AFFORDABLE DELIVERY</div><strong>${result.affordableKnown?fmt(result.affordable):'—'}</strong><div class="fx-metric-note">${result.affordableKnown} of ${rows.length} records disclose a split</div></div>`;
 $('fxMapTitle').textContent=cityLabel()+' · '+state.year;
 $('fxMapCaption').textContent=`${result.mapped} mapped housing records · ${state.year} scenario`;
 const absPercent=reference.expected?Math.abs(delta/reference.expected*100):0;
 $('fxInsightTitle').textContent=!rows.length?'No modeled housing in this sample.':Math.abs(delta)<.5?'Start with the reference.':`${absPercent.toFixed(0)}% ${delta>0?'more':'less'} delivery in this scenario.`;
 $('fxInsightText').textContent=!rows.length?'Choose another area. Missing records do not mean no housing is planned.':Math.abs(delta)<.5?'Try a policy or adjust financing to see where the pipeline is most sensitive. The reference is a comparison point, not a business-as-usual prediction.':`${fmt(Math.abs(delta))} ${delta>0?'more':'fewer'} reported units reach modeled delivery by ${state.year}. ${rows.filter(p=>p.effects.length).length} records receive a policy acceleration assumption. Housing costs also depend on demand, existing supply and incomes, which this model does not forecast.`;
 $('fxCoverage').textContent=`SAMPLE COVERAGE · ${rows.length} modeled records / ${fmt(result.units)} reported units. ${result.stale} have missing or >2-year-old status dates. ${rows.length-result.mapped} have no map location.`;
 $('fxTableSummary').textContent=`${rows.length} unfinished housing records in ${cityLabel()}. Gross units may include built phases and overlapping plans; this is not a count of net new homes.`;
 $('fxTableYear').textContent=state.year;
}
function renderChart(){
 const years=Array.from({length:state.year-BASE_YEAR+1},(_,i)=>BASE_YEAR+i);
 const points=years.map(year=>year===BASE_YEAR?{year,base:0,expected:0,low:0,high:0}:{year,base:estimateProjects(projects(),{...DEFAULTS,year}).expected,...estimateProjects(projects(),{...state,year})});
 const max=Math.max(1,...points.map(p=>Math.max(p.high,p.base))),w=480,h=150,pad=34;
 const x=year=>pad+(year-BASE_YEAR)/(state.year-BASE_YEAR)*(w-pad-12), y=value=>h-24-value/max*(h-38);
 const line=key=>points.map((p,i)=>`${i?'L':'M'}${x(p.year).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
 const area=line('high')+' '+[...points].reverse().map(p=>`L${x(p.year).toFixed(1)},${y(p.low).toFixed(1)}`).join(' ')+' Z';
 $('fxChart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cumulative modeled delivery from 2026 to ${state.year}: reference ${fmt(reference.expected)}, scenario ${fmt(result.expected)} units. Sensitivity range ${fmt(result.low)} to ${fmt(result.high)}."><title>Delivery outlook to ${state.year}</title>${[0,.5,1].map(f=>`<line x1="${pad}" x2="${w-12}" y1="${y(max*f)}" y2="${y(max*f)}" stroke="#e8edf0" stroke-dasharray="3 4"/><text x="${pad-5}" y="${y(max*f)+3}" text-anchor="end" fill="#8b97a0" font-size="8">${max*f>=1000?(max*f/1000).toFixed(1)+'k':fmt(max*f)}</text>`).join('')}<path d="${area}" fill="#3E4F24" opacity=".10"/><path d="${line('base')}" fill="none" stroke="#93a3b7" stroke-width="2" stroke-dasharray="5 4"/><path d="${line('expected')}" fill="none" stroke="#3E4F24" stroke-width="2.5"/><circle cx="${x(state.year)}" cy="${y(result.expected)}" r="4" fill="#3E4F24" stroke="white" stroke-width="2"/><text x="${pad}" y="${h-3}" fill="#8b97a0" font-size="9">2026</text><text x="${w-12}" y="${h-3}" text-anchor="end" fill="#3E4F24" font-size="9">${state.year}</text></svg>`;
}
function color(p){
 if(state.layer==='heat')return '#4b5242';
 if(state.layer==='exposure'){const risk=publicLayers?.risk(p);return risk?.level==='high'?'#1f82b2':risk?.level==='moderate'?'#9472ba':risk?.level==='unmatched'?'#aab4ab':'#818181';}
 if(state.layer==='change')return Math.abs(p.delta)<.5?'#98a8b6':p.delta>0?'#3E4F24':'#ba7953';
 if(state.layer==='affordable')return p.bmr===null?'#a5adb5':p.bmr/p.units>=.5?'#3E4F24':p.bmr>0?'#87956B':'#d9dfe6';
 return p.expected/p.units>=.65?'#3E4F24':p.expected/p.units>=.35?'#67794A':'#A3AC90';
}
function popup(p){const risk=publicLayers?.risk(p);const price=cityPrices.find(c=>c.key===p.city);const exposure=price?price.scenario*(1-((risk?.level==='high')?state.floodDiscount:0)/100):null;return `<div class="fx-popup"><small>${esc(p.cityLabel)} · ${esc(p.stage)}</small><h3>${esc(p.addr)}</h3><p><b>${fmt(p.expected)}</b> modeled units by ${state.year}<br><small>${fmt(p.low)}–${fmt(p.high)} sensitivity range</small></p><p>Reference: ${fmt(p.baseline)} · Change: ${signed(p.delta)}<br>Reported: ${fmt(p.units)} gross units<br>Affordable delivery: ${p.affordable===null?'Not disclosed':fmt(p.affordable)}</p><p>${p.effects.length?p.effects.map(e=>esc(POLICIES.find(b=>b.id===e.id).code)).join(' + '):'No extra policy acceleration'}</p><small>${p.nearTransit?'Near '+esc(p.station.name)+' (approximate).':'Outside the mapped station buffers.'}<br>${p.stale?'Status is missing or over two years old.':'Status dated '+esc(p.lastDate)+'.'}</small><div class="fx-popup-risk"><b>${esc(risk?.label||'Flood data loading')}</b>${risk?.zone?' · Zone '+esc(risk.zone):''}</div>${price?`<p>City index scenario: <b>${money(price.scenario)}</b>${risk?.level==='high'&&state.floodDiscount?`<br>Exposed-location example: ${money(exposure)}`:''}<br><small>City-based sensitivity, not this property’s value.</small></p>`:''}<p><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">City source ↗</a></p></div>`;}
function initMap(){
 if(map)return true;
 if(!window.L){$('fxMapError').hidden=false;$('fxMapError').textContent='Map library unavailable. Explore every project in the table below.';return false;}
 map=L.map('futureMap',{scrollWheelZoom:false,zoomControl:false,preferCanvas:true}).setView([37.47,-122.12],10);
 L.control.zoom({position:'bottomleft'}).addTo(map);
 // No visitor API key required. Display attribution alongside every tile.
 map.createPane('fxHazards').style.zIndex=350;map.createPane('fxSea').style.zIndex=360;map.createPane('fxEnergy').style.zIndex=480;map.createPane('fxPrices').style.zIndex=490;
 setBasemap();
 publicLayers=new PublicLayers(map,()=>{update();},notify);
 publicLayers.load();
 priceLayer=L.layerGroup().addTo(map);
 stationLayer=L.layerGroup().addTo(map);projectLayer=L.layerGroup().addTo(map);
 STATIONS.forEach(s=>{L.circle([s.lat,s.lng],{radius:804.672,color:'#8296b7',weight:1,fillOpacity:.055,dashArray:'3 5',interactive:false}).addTo(stationLayer);L.circleMarker([s.lat,s.lng],{radius:3,color:'#fff',weight:1,fillColor:'#7A6636',fillOpacity:1}).bindTooltip(esc(s.name)+' · approximate center').addTo(stationLayer);});
 return true;
}
// Hidden tabs have a zero-sized canvas. Avoid drawing or retaining animation frames there.
function clearHeat(){if(!heatLayer)return;L.Util.cancelAnimFrame(heatLayer._frame);heatLayer._frame=null;map.removeLayer(heatLayer);heatLayer=null;}
function createHeat(points,options){
 const layer=L.heatLayer(points,options),redraw=layer._redraw;
 layer._redraw=function(){if(!this._map||!this._canvas?.width||!this._canvas?.height||!this._map.getContainer().offsetWidth){this._frame=null;return;}return redraw.call(this);};
 return layer;
}
function fitMap(){if(!map)return;const mapped=rows.filter(validPoint);if(mapped.length)map.fitBounds(mapped.map(p=>[p.lat,p.lng]),{padding:[45,45],maxZoom:13,animate:false});else {const c=context.cities[state.city];map.setView([c.center.lat,c.center.lng],c.zoom||10);}}
function renderMap(fit=false){
 const legend=state.layer==='heat'?[['#e8bd55','Low'],['#eb8842','Modeled housing concentration'],['#a64749','High']]:state.layer==='prices'?[['#3E4F24','Lower than reference'],['#aab4ab','Unchanged'],['#bc784e','Higher than reference']]:state.layer==='exposure'?[['#1f82b2','Special flood hazard'],['#9472ba','0.2% annual chance'],['#aab4ab','No match ≠ no risk']]:state.layer==='delivery'?[['#A3AC90','<35% delivered'],['#67794A','35–65%'],['#3E4F24','≥65%']]:state.layer==='change'?[['#3E4F24','More delivery'],['#98a8b6','Unchanged'],['#ba7953','Less delivery']]:[['#3E4F24','≥50% affordable'],['#87956B','Some affordable'],['#d9dfe6','0 disclosed'],['#a5adb5','Unknown']];
 $('fxLegend').innerHTML=legend.map(([c,label])=>`<span><i style="background:${c}"></i>${label}</span>`).join('');
 if(!$('screenFutures').offsetParent||activeView!=='map')return;
 if(!initMap())return;
 publicLayers.apply(state);setBasemap();
 renderDataStatus();
 projectLayer.clearLayers();markers.clear();priceLayer.clearLayers();
 clearHeat();
 const layerNotes={heat:'Heat shows concentration of modeled gross delivery in the project sample; it is not a map of all homes. Intensity is comparable over time at the same zoom.',prices:'City-centered markers show a modeled city index, not prices for nearby parcels. Color shows the change from the same-year reference.',exposure:'Project points screened against generalized FEMA polygons. A no-match result does not establish low risk. NOAA water levels do not alter FEMA classifications.'};
 $('fxLayerNote').textContent=layerNotes[state.layer]||'Dots are project locations; size reflects modeled units. Station rings are approximate context, not legal eligibility.';
 if(state.layer==='heat'&&window.L.heatLayer){heatLayer=createHeat(rows.filter(validPoint).map(p=>[p.lat,p.lng,p.expected]),{radius:32,blur:24,max:700,maxZoom:11,minOpacity:.08,gradient:{.15:'#83a889',.4:'#d8c25a',.65:'#ee963f',.85:'#d96349',1:'#9d4051'}}).addTo(map);}
 if(state.layer==='prices'){if(!cityPrices.length)$('fxMapCaption').textContent=publicLayers.stock?'No city-price baseline for this area':'City price baselines loading…';renderPriceMarkers();requestAnimationFrame(()=>{map.invalidateSize();if(fit)fitMap();});return;}
 [...rows].sort((a,b)=>b.units-a.units).filter(validPoint).forEach(p=>{
  const value=state.layer==='change'?Math.abs(p.delta):state.layer==='affordable'?(p.affordable??0):p.expected;
  const marker=L.circleMarker([p.lat,p.lng],{radius:state.layer==='heat'?3.5:Math.max(4,Math.min(22,3+Math.sqrt(value)*.40)),color:'#fff',weight:state.layer==='heat'?.8:1.4,fillColor:color(p),fillOpacity:state.layer==='heat'?.5:.85}).bindPopup(popup(p)).bindTooltip(`${esc(p.addr)} · ${fmt(p.expected)} modeled units`);
  marker.on('click',()=>selected=p.id);marker.addTo(projectLayer);markers.set(p.id,marker);
 });
 requestAnimationFrame(()=>{map.invalidateSize();if(fit)fitMap();});
}
function renderBills(){
 const filter=$('fxBillFilter').value;
 $('fxBillList').innerHTML=POLICIES.filter(p=>filter==='all'||p.kind===filter).map(p=>`<article class="fx-bill"><div class="fx-bill-top"><span class="fx-bill-code">${p.code}</span><span class="fx-status-badge ${p.kind==='pending'?'pending':''}">${p.status}</span></div><h3>${p.title}</h3><div class="fx-bill-date">${p.session} session · ${p.date}</div><p>${p.summary}</p><div class="fx-bill-effect">${p.effect}</div><details><summary>Limits of this assumption</summary><p>${p.caveat}</p></details><div class="fx-bill-footer"><a href="${p.source}" target="_blank" rel="noopener">${p.sourceLabel} ↗</a>${p.months?`<button data-bill="${p.id}" aria-pressed="${state.policies.includes(p.id)}">${state.policies.includes(p.id)?'✓ In scenario':'+ Test assumption'}</button>`:'<span>Context only</span>'}</div></article>`).join('');
}
function tableRows(){const q=$('fxSearch').value.trim().toLowerCase(),sort=$('fxSort').value;return rows.filter(p=>`${p.addr} ${p.cityLabel}`.toLowerCase().includes(q)).sort((a,b)=>b[sort]-a[sort]||a.addr.localeCompare(b.addr));}
function renderTable(){
 const filtered=tableRows();
 $('fxRows').innerHTML=filtered.slice(0,limit).map(p=>`<tr><td>${validPoint(p)?`<button class="fx-project-link" data-project="${esc(p.id)}" aria-label="Locate ${esc(p.addr)} on future map">${esc(p.addr)} ↗</button>`:esc(p.addr)}<small>${esc(p.cityLabel)}${p.nearTransit?' · Near mapped transit':''}</small></td><td>${({review:'Under review',construction:'Building',proposed:'Proposed',approved:'Approved'})[p.stage]}</td><td>${fmt(p.units)}</td><td>${fmt(p.baseline)}</td><td><b>${fmt(p.expected)}</b><small>${fmt(p.low)}–${fmt(p.high)}</small></td><td class="${p.delta>=0?'fx-positive':'fx-negative'}">${signed(p.delta)}</td><td><span class="fx-quality">${p.stale?'Recheck status':'Dated record'}</span><small>${p.lastDate?esc(p.lastDate):'Date unknown'}</small></td></tr>`).join('')||'<tr><td colspan="7">No matching housing records. Try another area or search.</td></tr>';
 $('fxMore').hidden=filtered.length<=limit;
 $('fxMore').textContent=`Show more projects (${Math.min(limit,filtered.length)} of ${filtered.length})`;
}
function setPreset(value){pausePlayback();preset=value;const settings=value==='momentum'?{rate:4.5,costs:1.5,delay:-3,policies:['sb79','ab130','sb423']}:value==='headwinds'?{rate:8,costs:6,delay:12,policies:[]}:value==='coastal'?{gridDelay:9,delay:6,floodDiscount:15,seaLevel:3,flood:true,layer:'exposure'}:{};state={...state,...DEFAULTS,...settings,year:state.year};selected=null;update();}
function togglePolicy(id){state.policies=state.policies.includes(id)?state.policies.filter(p=>p!==id):[...state.policies,id];preset='custom';update();}
function exportCsv(){
 const cell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,'\t$&').replace(/"/g,'""')+'"';
 const header=['project_id','city','address','stage','reported_gross_units','reference_delivery','scenario_delivery','low_sensitivity','high_sensitivity','disclosed_affordable_delivery','delta','last_status_date','near_approximate_station','year','financing_rate_assumption','cost_growth_assumption','delay_months','grid_delay_months','price_trend_pct','supply_price_sensitivity','exposed_location_discount_pct','kwh_per_home_year','fema_screen','city_index_observed_2026','city_index_scenario','city_index_reference','noaa_sea_level_ft','policy_assumptions','as_of','model_version'];
 const csv=[header,...rows.map(p=>[p.id,p.cityLabel,p.addr,p.stage,p.units,Math.round(p.baseline),Math.round(p.expected),Math.round(p.low),Math.round(p.high),p.affordable===null?'Unknown':Math.round(p.affordable),Math.round(p.delta),p.lastDate||'Unknown',p.nearTransit,state.year,state.rate,state.costs,state.delay,state.gridDelay,state.priceTrend,state.elasticity,state.floodDiscount,state.energyUse,publicLayers?.risk(p).level||'unknown',cityPrices.find(c=>c.key===p.city)?.observed??'Unknown',cityPrices.find(c=>c.key===p.city)?Math.round(cityPrices.find(c=>c.key===p.city).scenario):'Unknown',cityPrices.find(c=>c.key===p.city)?Math.round(cityPrices.find(c=>c.key===p.city).reference):'Unknown',state.seaLevel,state.policies.join(';'),AS_OF,MODEL_VERSION])].map(row=>row.map(cell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`bay-civic-scenario-${state.city}-${state.year}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Scenario exported with its assumptions and data date.');
}
function setBasemap(){
 if(!map||baseKey===state.basemap)return;
 if(baseLayer)map.removeLayer(baseLayer);if(labelLayer){map.removeLayer(labelLayer);labelLayer=null;}
 const satellite=state.basemap==='satellite';
 const url=satellite?'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}':'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
 baseLayer=L.tileLayer(url,{maxZoom:19,maxNativeZoom:satellite?19:16,attribution:satellite?'Imagery: Esri, Vantor, Earthstar Geographics, GIS User Community':'Map: Esri, HERE, Garmin, OpenStreetMap contributors'}).addTo(map);baseKey=state.basemap;
 if(!satellite){if(!map.getPane('fxLabels')){map.createPane('fxLabels').style.zIndex=450;map.getPane('fxLabels').style.pointerEvents='none';}labelLayer=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',{pane:'fxLabels',maxNativeZoom:16,maxZoom:19}).addTo(map);}
 baseLayer.on('tileerror',()=>$('fxMapError').hidden=false);
 baseLayer.on('load',()=>{if(document.querySelector('#futureMap .leaflet-tile-loaded'))$('fxMapError').hidden=true;});
}
function pausePlayback(){clearInterval(playTimer);playTimer=null;$('fxPlay').textContent='▶ Play years';$('fxPlay').setAttribute('aria-pressed','false');$('fxMapPlay').textContent='▶';$('fxMapPlay').setAttribute('aria-pressed','false');$('fxMapPlay').setAttribute('aria-label','Play map years');}
function setExpanded(value){expanded=value;$('fxMapCard').classList.toggle('is-expanded',value);$('fxExpand').textContent=value?'✕ Close expanded map':'⛶ Expand map';$('fxExpand').setAttribute('aria-pressed',String(value));document.body.classList.toggle('fx-map-expanded',value);requestAnimationFrame(()=>map?.invalidateSize());}
function buildCityPrices(){
 cityPrices=[];if(!publicLayers?.stock)return;
 for(const [key,c] of Object.entries(context.cities)){
  if(key==='all'||(state.city==='all'&&key==='westsanjose')||(state.city!=='all'&&state.city!==key))continue;
  const records=rows.filter(p=>p.city===key),stock=publicLayers.stock.cities[key];
  const value=priceScenario({homeValue:context.stats[key]?.homeValue,stock:stock?.units,deltaUnits:records.reduce((n,p)=>n+p.delta,0),year:state.year,trend:state.priceTrend,elasticity:state.elasticity});
  if(value)cityPrices.push({...value,key,label:c.label,center:c.center,stock:stock.units,records:records.length});
 }
}
function renderPriceMarkers(){
 for(const c of cityPrices){const color=Math.abs(c.percent)<.005?'#6f7e72':c.percent<0?'#3E4F24':'#a95c38';
 L.marker([c.center.lat,c.center.lng],{pane:'fxPrices',icon:L.divIcon({className:'fx-price-marker',html:`<span style="--price-color:${color}"><small>${esc(c.label)}</small><b>${compactMoney(c.scenario)}</b><em>${c.percent>0?'+':''}${c.percent.toFixed(1)}% vs ref.</em></span>`,iconSize:[100,55],iconAnchor:[50,28]}),title:c.label+' modeled city index'}).bindPopup(`<div class="fx-popup"><small>${esc(c.label)} · CITY INDEX SENSITIVITY</small><h3>${money(c.scenario)} in ${state.year}</h3><p>Observed July 2026: ${money(c.observed)}<br>Same-year reference: ${money(c.reference)}<br>Supply scenario: ${c.percent.toFixed(2)}%</p>${state.floodDiscount?`<p>Illustrative exposed location: <b>${money(c.scenario*(1-state.floodDiscount/100))}</b><br><small>${state.floodDiscount}% user-assumed discount; not a property valuation.</small></p>`:''}<small>${fmt(c.stock)} homes in the 2020 stock denominator; ${c.records} modeled project records. Values are not parcel-specific.${c.key==='westsanjose'?' Uses citywide San Jose price and housing stock.':''}</small></div>`).addTo(priceLayer);
 }
}
function renderImpacts(){
 const floodReady=!!publicLayers?.flood;
 const high=floodReady?rows.filter(p=>publicLayers.risk(p).level==='high'):[];
 const exposed=high.reduce((n,p)=>n+p.expected,0);
 const totalStock=cityPrices.reduce((n,c)=>n+c.stock,0);
 const weighted=key=>totalStock?cityPrices.reduce((n,c)=>n+c[key]*c.stock,0)/totalStock:null;
 const value=weighted('scenario'),ref=weighted('reference');
 const plants=publicLayers?.energy?.features.filter(f=>f.properties.Retired_Plant===0)||[];
 const gwh=annualElectricityGWh(result.expected,state.energyUse);
 $('fxMapReadout').innerHTML=`<span>SCENARIO · ${state.year}</span><strong>${fmt(result.expected)} <small>modeled units</small></strong><div>${floodReady?fmt(exposed)+' in FEMA hazard areas':'Flood screening loading…'} · ${gwh.toFixed(1)} GWh/yr</div><div>${state.policies.length} policy assumptions · ${state.rate}% financing</div>`;
 $('fxImpacts').innerHTML=`<article><span class="fx-impact-icon">⌂</span><div><div class="fx-label">HOME-VALUE SCENARIO</div><strong>${compactMoney(value)}</strong><small>${value&&ref?((value/ref-1)*100).toFixed(2)+'% vs same-year reference':publicLayers?.errors.stock?'Housing stock unavailable':publicLayers?.stock?'No city price baseline available':'Loading housing stock…'}</small><p>${state.city==='all'?'Stock-weighted city index proxy':'City index · July 2026 baseline'}${state.floodDiscount&&value?'<br>Exposed-location example: '+compactMoney(value*(1-state.floodDiscount/100)):''}</p></div></article><article><span class="fx-impact-icon flood">≈</span><div><div class="fx-label">DELIVERY IN FEMA HAZARD AREAS</div><strong>${floodReady?fmt(exposed):'—'} <em>units</em></strong><small>${floodReady?high.length+' project locations in special hazard areas':'Flood screening '+(publicLayers?.errors.flood?'unavailable':'loading…')}</small><p>Point screening only · no match is not no risk</p></div></article><article><span class="fx-impact-icon energy">ϟ</span><div><div class="fx-label">MODELED ANNUAL ELECTRICITY</div><strong>${gwh.toFixed(1)} <em>GWh</em></strong><small>${fmt(state.energyUse)} kWh / home / year assumed</small><p>${publicLayers?.energy?plants.length+' regional facilities not flagged retired':'Energy inventory '+(publicLayers?.errors.energy?'unavailable':'loading…')} · capacity ≠ available supply</p></div></article>`;
 renderDataStatus();
}
function renderDataStatus(){
 if(!publicLayers)return;
 const tag=(ready,error,label)=>`<span class="${error?'unavailable':ready?'ready':'loading'}">${ready?'●':error?'!':'◌'} ${label}${error?' unavailable':ready?'':' loading'}</span>`;
 $('fxDataStatus').innerHTML=tag(publicLayers.flood,publicLayers.errors.flood,'FEMA · '+(publicLayers.flood?.metadata?.counties?.length||'…')+' counties')+tag(publicLayers.energy,publicLayers.errors.energy,'CEC · '+(publicLayers.energy?.features?.length||'…')+' facilities')+tag(publicLayers.stock,publicLayers.errors.stock,'Census housing stock · 2020')+(state.seaLevel?`<span class="${publicLayers.errors.sea?'unavailable':''}">NOAA · ${publicLayers.errors.sea?'tiles unavailable':('+'+state.seaLevel+' ft above MHHW · independent of year')}</span>`:'');
}
function init(){
 $('fxToggleControls').addEventListener('click',()=>{
  const open=$('fxToggleControls').getAttribute('aria-expanded')!=='true';
  $('fxToggleControls').setAttribute('aria-expanded',String(open));$('fxViewMap').dataset.controlsOpen=String(open);
  $('fxToggleControls').textContent=open?'Close scenario controls ↑':'Adjust this scenario ↓';
 });
 const tabs=[...document.querySelectorAll('[data-fx-view]')];
 tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>showFutureView(tab.dataset.fxView));
  tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[n].click();tabs[n].focus();});
 });
 document.querySelectorAll('a[href="#fxBills"]').forEach(a=>a.addEventListener('click',()=>showFutureView('policies')));
 $('fxLayerSelect').addEventListener('change',e=>{state.layer=e.target.value;if(state.layer==='exposure')state.flood=true;syncControls();renderMap();});
 $('fxCity').innerHTML='<option value="all">All Bay Area cities</option>'+Object.entries(context.cities).filter(([k])=>k!=='all').sort((a,b)=>a[1].label.localeCompare(b[1].label)).map(([key,c])=>`<option value="${key}">${esc(c.label)}</option>`).join('');
 $('fxPolicyControls').innerHTML=POLICIES.filter(p=>p.months).map(p=>`<label class="fx-policy-control"><span><b>${p.code}</b><small>${p.tag} · ${p.kind==='pending'?'If approved':'Extra uptake'}</small></span><input type="checkbox" data-policy-toggle="${p.id}" aria-label="Test ${p.code} acceleration"></label>`).join('');
 $('fxReviewed').textContent=`Status checked September 18, 2026 · Curated watchlist, not every housing bill. Open the official source for subsequent changes.`;
 if(shared)preset=Object.keys(DEFAULTS).every(key=>JSON.stringify(state[key])===JSON.stringify(DEFAULTS[key]))?'baseline':'custom';
 $('fxCity').addEventListener('change',e=>{state.city=e.target.value;limit=20;selected=null;update(true);});
 for(const key of controlKeys)$('fx'+key[0].toUpperCase()+key.slice(1)).addEventListener('input',e=>{state[key]=Number(e.target.value);if(key!=='year')preset='custom';update();});
 document.querySelectorAll('[data-policy-toggle]').forEach(el=>el.addEventListener('change',()=>togglePolicy(el.dataset.policyToggle)));
 document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>setPreset(el.dataset.preset)));
 document.querySelectorAll('[data-layer]').forEach(el=>el.addEventListener('click',()=>{state.layer=el.dataset.layer;if(state.layer==='exposure')state.flood=true;syncControls();renderMap();}));
 $('fxReset').addEventListener('click',()=>{pausePlayback();state={...DEFAULTS,...MAP_DEFAULTS,policies:[]};preset='baseline';selected=null;limit=20;$('fxSearch').value='';$('fxSort').value='expected';$('fxBillFilter').value='all';$('fxTransit').checked=true;if(map&&!map.hasLayer(stationLayer))stationLayer.addTo(map);update(true);});
 $('fxFit').addEventListener('click',fitMap);
 $('fxTransit').addEventListener('change',e=>{if(map)e.target.checked?stationLayer.addTo(map):map.removeLayer(stationLayer);});
 $('fxBillFilter').addEventListener('change',renderBills);
 $('fxBillList').addEventListener('click',e=>{const b=e.target.closest('[data-bill]');if(b)togglePolicy(b.dataset.bill);});
 $('fxSearch').addEventListener('input',()=>{limit=20;renderTable();});$('fxSort').addEventListener('change',renderTable);$('fxMore').addEventListener('click',()=>{limit+=20;renderTable();});
 $('fxRows').addEventListener('click',e=>{const b=e.target.closest('[data-project]');if(!b)return;const row=rows.find(p=>p.id===b.dataset.project);showFutureView('map');if(map&&row){if(state.layer==='prices'){state.layer='delivery';syncControls();renderMap();}selected=row.id;map.setView([row.lat,row.lng],15,{animate:false});markers.get(row.id)?.openPopup();$('futureMap').scrollIntoView({block:'center',behavior:'smooth'});}else notify('Map unavailable. Use the project register for the city source.');});
 $('fxShare').addEventListener('click',async()=>{const url=new URL(location.href);url.search=scenarioQuery(state);url.hash='';try{await navigator.clipboard.writeText(url.href);notify('Scenario link copied. It includes your area, year and assumptions.');}catch{const status=$('fxStatus');status.replaceChildren();const label=document.createElement('label');label.textContent='Copy this scenario link: ';const input=document.createElement('input');input.value=url.href;input.readOnly=true;label.append(input);status.append(label);input.select();}});
 $('fxExport').addEventListener('click',exportCsv);
 for(const [id,key] of [['fxFlood','flood'],['fxEnergy','energy']])$(id).addEventListener('change',e=>{state[key]=e.target.checked;renderMap();});
 $('fxSeaLevel').addEventListener('change',e=>{state.seaLevel=Number(e.target.value);syncControls();renderMap();});
 $('fxBasemap').addEventListener('change',e=>{state.basemap=e.target.value;setBasemap();});
 const play=()=>{if(playTimer){pausePlayback();return;}if(state.year>=2040)state.year=2027;$('fxPlay').textContent='Ⅱ Pause';$('fxPlay').setAttribute('aria-pressed','true');$('fxMapPlay').textContent='Ⅱ';$('fxMapPlay').setAttribute('aria-pressed','true');$('fxMapPlay').setAttribute('aria-label','Pause map years');playTimer=setInterval(()=>{if(state.year>=2040){pausePlayback();return;}state.year++;update();},1100);};
 $('fxPlay').addEventListener('click',play);$('fxMapPlay').addEventListener('click',play);
 $('fxMapYear').addEventListener('input',e=>{state.year=Number(e.target.value);update();});
 $('fxExpand').addEventListener('click',()=>setExpanded(!expanded));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded)setExpanded(false);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();});

 document.querySelector('.fx-disclosure a').addEventListener('click',()=>{$('fxMethod').open=true;});
 window.addEventListener('dashboard:screen',e=>{if(e.detail==='futures'){update(!initialized);initialized=true;}else {pausePlayback();if(map)clearHeat();}});
 update();
 if(shared){$('onboardOverlay').style.display='none';context.showScreen('futures');}
}
try{init();}catch(error){console.error('Future map failed to initialize',error);$('fxStatus').textContent='The future map could not initialize. Reload to retry; the project register is still available.';}
