import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const section=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
const rules=section('let zoningSources =','/* A map inside the record');
const render=section('async function renderRules(', 'let projSheetReturnFocus');
function rulesContext(fetch){
  const host={innerHTML:''};
  const context=vm.createContext({fetch,AbortSignal,window:{COVERAGE_EXPANSION:{cities:{}}},document:{getElementById:()=>host},escapeHtml:String});
  vm.runInContext(rules+render,context);
  return {context,host};
}
const response=data=>({ok:true,json:async()=>data});

test('failed rule layers remain unknown, deduplicate requests, and retry on the next record',async()=>{
  let calls=0,working=false;
  const {context,host}=rulesContext(async url=>{
    calls++;if(!working)return {ok:false};
    return response(url.includes('zoning-sources')?{cities:{}}:{zones:[]});
  });
  await Promise.all([context.loadRuleLayers(),context.loadRuleLayers()]);
  assert.equal(calls,2);
  await context.renderRules({lat:37,lng:-122},'test',{label:'Test',county:'Santa Clara',ctaLinks:[]});
  assert.match(host.innerHTML,/directory could not load/);
  assert.match(host.innerHTML,/Transit-zone data could not load/);
  assert.doesNotMatch(host.innerHTML,/standards do not apply/);
  working=true;await context.loadRuleLayers();
  const settled=calls;await context.loadRuleLayers();assert.equal(calls,settled);
  await context.renderRules({lat:37,lng:-122},'test',{label:'Test',county:'Santa Clara',ctaLinks:[]});
  assert.match(host.innerHTML,/No transit zone in the connected/);
  assert.doesNotMatch(host.innerHTML,/could not load/);
});

test('ArcGIS HTTP 200 errors are unavailable, while an empty feature list is a valid no-match',async()=>{
  let data={error:{code:499,message:'Token required'}};
  const {context}=rulesContext(async url=>response(url.includes('zoning-sources')?{cities:{test:{url:'https://example.com/MapServer/1',field:'ZONE'}}}:url.includes('sb79')?{zones:[]}:data));
  await context.loadRuleLayers();
  assert.equal(await context.zoningAt('test',37,-122),null);
  data={features:[]};assert.equal((await context.zoningAt('test',37,-122)).district,null);
  data={features:[{attributes:{ZONE:'R-2'}}]};assert.equal((await context.zoningAt('test',37,-122)).district,'R-2');
});

test('a replaced project sheet never receives a late zoning response',async()=>{
  let finish,fetches=0;
  const {context,host}=rulesContext(async()=>{fetches++;return new Promise(r=>finish=r);});
  vm.runInContext("zoningSources={cities:{test:{url:'https://example.com/1',field:'ZONE'}}};sb79Zones={zones:[]};",context);
  const pending=context.renderRules({lat:37,lng:-122},'test',{label:'Test',county:'Santa Clara',ctaLinks:[]});
  await Promise.resolve();await Promise.resolve();assert.equal(fetches,1);
  const replacement={innerHTML:'Loading new record'};context.document.getElementById=()=>replacement;
  finish(response({features:[{attributes:{ZONE:'OLD'}}]}));await pending;
  assert.equal(replacement.innerHTML,'Loading new record');assert.equal(host.innerHTML,'');
});

test('closing a project sheet cancels its pending map animation',()=>{
  const cancelled=[];
  const ctx=vm.createContext({clearTimeout:id=>cancelled.push(id),document:{getElementById:()=>({hidden:false}),body:{style:{}}},projSheetReturnFocus:null});
  vm.runInContext(section('let sheetMap =','const SHEET_MAP_ZOOM')+section('function closeProjectSheet(){',"document.getElementById('projSheetClose').addEventListener"),ctx);
  vm.runInContext('sheetMapTimers=[1,2,3];closeProjectSheet();',ctx);
  assert.deepEqual(cancelled,[1,2,3]);
  vm.runInContext('closeProjectSheet()',ctx);assert.equal(cancelled.length,3);
});

test('county topic padding excludes records already shown and prefers the selected county',()=>{
  const source=section('  const visibleIds=new Set(list.map(d=>d.id));','  DashboardBrowse.mountPager(document.getElementById(\'topicCityGrid');
  const local={id:'local',_sourceCity:'a'},nearby={id:'nearby',_sourceCity:'b'},remote={id:'remote',_sourceCity:'c'};
  const ctx=vm.createContext({list:[local],activeCounty:'Santa Barbara',currentCity:'all',view:{scope:'city'},categoryKey:'dev',CITIES:{all:{label:'Santa Barbara County'},a:{county:'Santa Barbara'},b:{county:'Santa Barbara'},c:{county:'Alameda'}},BAY_AREA_VIEW:{data:[remote,local,nearby]},topicCategoryMatches:()=>true,regionCardHtml:()=>''});
  vm.runInContext(source+'globalThis.result=pad.items.map(d=>d.id);',ctx);
  assert.deepEqual(Array.from(ctx.result),['nearby','remote']);
});

test('hero photos stay in the selected city or county and ignore late image loads',()=>{
  const images=[];
  const classes=()=>({add(){},remove(){}});
  const layers={heroBgA:{style:{},classList:classes()},heroBgB:{style:{},classList:classes()}};
  const credit={innerHTML:''};
  const photo=name=>({url:'/'+name+'.jpg',cap:name,by:'Photographer',lic:'CC BY',source:'https://example.com/'+name});
  const ctx=vm.createContext({currentCity:'slo',activeCounty:'',CITY_PHOTOS:{slo:photo('SLO'),sb:photo('Santa Barbara'),goleta:photo('Goleta')},CITIES:{slo:{county:'San Luis Obispo'},sb:{county:'Santa Barbara'},goleta:{county:'Santa Barbara'},all:{}},document:{getElementById:id=>layers[id],querySelector:()=>credit},escapeHtml:String,Image:class{constructor(){images.push(this);}}});
  vm.runInContext(section('let heroBgIdx =','function heroIsVisible()'),ctx);
  assert.deepEqual(Array.from(ctx.heroBgOrder()),['slo']);
  ctx.paintHeroBg();ctx.currentCity='sb';ctx.paintHeroBg();
  images[1].onload();images[0].onload();
  assert.match(credit.innerHTML,/Santa Barbara/);assert.doesNotMatch(credit.innerHTML,/SLO/);
  ctx.currentCity='all';ctx.activeCounty='Santa Barbara';
  assert.deepEqual(Array.from(ctx.heroBgOrder()),['sb','goleta']);
});

test('cards without coordinates expose an honest location note instead of a dead map action',()=>{
  const ctx=vm.createContext({projectStage:()=>({label:'Filed'}),CAT_MAP:{dev:{color:'green',label:'Housing'}},categoryOf:()=> 'dev',tileVoyager:()=>null,cityOfProject:()=> 'city',currentCity:'city',window:{LOCAL_CITY_PHOTOS:{}},escapeHtml:String,photoCredit:()=>'',starButtonHtml:()=>'',stampStyle:()=>'',freshnessLabel:()=>'',citySourceLink:()=>null});
  vm.runInContext(section('function projectCardHtml(', '// Cards borrowed'),ctx);
  const unlocated=ctx.projectCardHtml({id:'test',addr:'Test',lat:null,lng:null});
  assert.match(unlocated,/Location not verified/);assert.doesNotMatch(unlocated,/class="locate-btn"/);
  assert.match(ctx.projectCardHtml({id:'test',addr:'Test',lat:35,lng:-120}),/class="locate-btn"/);
});

test('large map builds yield between batches, cancel stale work, and defer hidden maps',async()=>{
  const frames=[],drawn=[];
  let visible=true,rows=Array.from({length:501},(_,i)=>({id:'old'+i,lat:35,lng:-120,addr:'Old'}));
  const ctx=vm.createContext({overviewBuildVersion:0,overviewMarkersDirty:false,mapProvider:'google',gMap:{},gMarkers:{},markerProjects:new WeakMap(),document:{getElementById:id=>id==='screenDashboard'?{offsetWidth:visible?900:0}:{hidden:false,textContent:''}},DATA:()=>rows,OverviewMapUtils:{groupLocations:data=>data.map(p=>[p])},clearMarkers(){},markerIconGoogle(){return {};},google:{maps:{Marker:class {constructor(data){drawn.push(data);}addListener(){}}}},renderUserLocationMarker(){},renderCityBoundary(){},updateMapVisibility(){},fitOverviewMap(){},requestAnimationFrame:fn=>frames.push(fn)});
  vm.runInContext(section('async function buildMarkersForCurrentProvider(){','function fitOverviewMap(){'),ctx);
  const stale=ctx.buildMarkersForCurrentProvider();assert.equal(drawn.length,250);
  rows=[{id:'new',lat:34,lng:-119,addr:'New'}];await ctx.buildMarkersForCurrentProvider();
  frames.shift()();await stale;assert.equal(drawn.length,251);
  visible=false;await ctx.buildMarkersForCurrentProvider();assert.equal(drawn.length,251);assert.equal(ctx.overviewMarkersDirty,true);
  visible=true;rows=Array.from({length:501},(_,i)=>({id:'new'+i,lat:35,lng:-120,addr:'New'}));
  frames.length=0;const full=ctx.buildMarkersForCurrentProvider();
  frames.shift()();await Promise.resolve();
  frames.shift()();await full;
  assert.equal(drawn.length,752,'All 501 locations survive batching');
});

test('loading more records invalidates resource search and refreshes the active county',()=>{
  const city={data:[{id:'new'}],feed:[],ctaLinks:[]};
  let county;
  const ctx=vm.createContext({CITIES:{city,all:{}},BAY_AREA_VIEW:{},PROJECT_CITY:new Map(),BANK_INDEX:[{id:'old'}],activeCounty:'Test',setCountyScope:value=>county=value,window:{dashboardContext:{projects:[]},dispatchEvent(){}},CustomEvent:class{}});
  vm.runInContext(section('function rebuildCoverageAggregates(){','let coverageSelectionVersion'),ctx);
  ctx.rebuildCoverageAggregates();assert.equal(ctx.BANK_INDEX,null);assert.equal(county,'Test');
  assert.equal(ctx.BAY_AREA_VIEW.data[0].id,'new');assert.equal(ctx.window.dashboardContext.projects[0].id,'new');
});
