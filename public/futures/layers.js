import {hazardIndex,screenFlood,FUEL_NAMES} from './spatial.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class PublicLayers {
 constructor(map,onReady,onStatus){this.map=map;this.onReady=onReady;this.onStatus=onStatus;this.risks=new Map();this.energy=null;this.flood=null;this.stock=null;this.sea=null;this.seaLevel=0;this.settings={};this.loading=false;this.errors={};}
 async load(){
  if(this.loading)return;this.loading=true;
  const tasks=[['flood','flood.geojson'],['energy','energy.geojson'],['stock','housing-stock.json']];
  await Promise.all(tasks.map(async([key,file])=>{try{
   const r=await fetch('/futures/data/'+file,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.json();
   if(key==='flood'){
    if(!Array.isArray(data.features)||!data.metadata)throw new Error('Invalid flood snapshot');
    this.flood=data;this.index=hazardIndex(data);this.risks.clear();
    this.floodLayer=L.geoJSON(data,{pane:'fxHazards',renderer:L.canvas({pane:'fxHazards',padding:.5}),style:f=>({color:f.properties.SFHA_TF==='T'?'#2688b8':'#a684ce',weight:.5,fillColor:f.properties.SFHA_TF==='T'?'#389ec5':'#b599d0',fillOpacity:.34}),onEachFeature:(f,l)=>l.bindPopup(`<div class="fx-popup"><small>FEMA · snapshot ${esc(data.metadata.retrieved.slice(0,10))}</small><h3>${f.properties.SFHA_TF==='T'?'Special flood hazard area':'0.2% annual-chance zone'}</h3><p>Zone ${esc(f.properties.FLD_ZONE)}<br>${esc(f.properties.ZONE_SUBTY||'1% annual-chance flood hazard')}</p><small>Generalized geometry. Check the official map for parcel or insurance decisions.</small><p><a href="https://msc.fema.gov/portal/home" target="_blank" rel="noopener">FEMA Map Service Center ↗</a></p></div>`)});
   }else if(key==='energy'){
    if(!Array.isArray(data.features)||!data.metadata)throw new Error('Invalid energy snapshot');
    this.energy=data;this.energyLayer=L.layerGroup();
    data.features.filter(f=>f.properties.Retired_Plant===0&&f.geometry?.type==='Point').forEach(f=>{
     const p=f.properties,[lng,lat]=f.geometry.coordinates;const storage=p.PriEnergySource==='BAT';const color=storage?'#8270aa':p.PriEnergySource==='SUN'?'#b58b26':'#c06b33';
     L.marker([lat,lng],{pane:'fxEnergy',icon:L.divIcon({className:'fx-energy-marker',html:`<span style="--energy:${color}">${storage?'▰':'ϟ'}</span>`,iconSize:[24,24],iconAnchor:[12,12]}),title:p.PlantName}).bindTooltip(esc(p.PlantName)).bindPopup(`<div class="fx-popup"><small>CALIFORNIA ENERGY COMMISSION</small><h3>${esc(p.PlantName)}</h3><p><b>${Number(p.Capacity_Latest).toFixed(1)} MW</b> nameplate capacity<br>${esc(FUEL_NAMES[p.PriEnergySource]||p.PriEnergySource)} · ${esc(p.County)}</p><small>${storage?'Battery power capacity; stored energy duration is not supplied.':'Nameplate is not live generation or deliverable local grid capacity.'}<br>Source updated ${esc(data.metadata.sourceUpdated.slice(0,10))}</small><p><a href="https://www.energy.ca.gov/data-reports/energy-maps-and-spatial-data" target="_blank" rel="noopener">CEC public data ↗</a></p></div>`).addTo(this.energyLayer);
    });
   }else{if(!data.cities)throw new Error('Invalid housing-stock snapshot');this.stock=data;}
   delete this.errors[key];this.apply(this.settings);this.onReady(key);
  }catch(error){this.errors[key]=error.message;this.onStatus(`${key==='stock'?'Price baseline':key==='flood'?'Flood zones':'Energy facilities'} unavailable. Other layers remain usable.`);this.onReady(key);}}));
 }
 risk(p){const key=p.city+':'+p.id;if(!this.risks.has(key))this.risks.set(key,screenFlood(p,this.index));return this.risks.get(key);}
 apply(settings){this.settings=settings;
  if(this.floodLayer)this.toggle(this.floodLayer,settings.flood);
  if(this.energyLayer)this.toggle(this.energyLayer,settings.energy);
  const level=Number(settings.seaLevel)||0;
  if(level!==this.seaLevel){if(this.sea)this.map.removeLayer(this.sea);this.sea=null;this.seaLevel=level;delete this.errors.sea;
   if(level>0){this.sea=L.tileLayer(`https://www.coast.noaa.gov/arcgis/rest/services/dc_slr/slr_${level}ft/MapServer/tile/{z}/{y}/{x}`,{pane:'fxSea',maxNativeZoom:18,maxZoom:19,opacity:.7,attribution:'Sea-level scenario: NOAA Office for Coastal Management'}).addTo(this.map);this.sea.on('tileerror',()=>{if(!this.errors.sea){this.errors.sea='Tile unavailable';this.onStatus('NOAA sea-level tiles unavailable in this view. Do not interpret a blank layer as no flooding.');this.onReady('sea');}});}
  }
 }
 toggle(layer,visible){if(visible&&!this.map.hasLayer(layer))layer.addTo(this.map);if(!visible&&this.map.hasLayer(layer))this.map.removeLayer(layer);}
}
