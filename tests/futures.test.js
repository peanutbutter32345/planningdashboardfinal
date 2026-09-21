import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,MAP_DEFAULTS,POLICIES,STATIONS,normalizeSettings,distanceKm,projectEstimate,estimateProjects,priceMarkerSize,readScenario,scenarioQuery} from '../public/futures/model.js';
import {PROJECTS} from '../data/projects.js';
const project={id:'one',city:'sunnyvale',type:'Residential',stage:'review',units:100,bmr:20,lat:37.3785,lng:-122.0308,lastDate:'2026-09-01'};
test('reference settings survive missing, invalid and hostile URL inputs',()=>{
 assert.deepEqual(normalizeSettings({}),DEFAULTS);
 assert.deepEqual(normalizeSettings(readScenario('?view=futures')),DEFAULTS);
 const input=readScenario('?year=NaN&rate=999&costs=-999&delay=nope&policies=sb79,sb79,unknown&layer=bogus');
 assert.equal(input.year,2031);assert.equal(input.rate,10);assert.equal(input.costs,-2);assert.equal(input.delay,0);assert.deepEqual(input.policies,['sb79']);assert.equal(input.layer,'heat');
});
test('shared scenario round-trips all numeric and policy assumptions',()=>{
 const input={...DEFAULTS,...MAP_DEFAULTS,year:2035,priceTrend:3,elasticity:1.5,energyUse:7000,gridDelay:6,floodDiscount:12,flood:false,seaLevel:3,basemap:'satellite',rate:4.25,costs:-1.5,delay:9,policies:['sb79','sb417'],city:'mountainview',layer:'change'};
 assert.deepEqual(readScenario(scenarioQuery(input)),input);
});
test('completed, unknown stage, unknown units and nonhousing are excluded',()=>{
 for(const patch of [{stage:'completed'},{stage:'unknown'},{stage:'__proto__'},{stage:'constructor'},{units:null},{units:-1},{units:'100'},{type:'Commercial'}])assert.equal(projectEstimate({...project,...patch}),null);
});
test('station proximity is geodesic, distinguishes near and far, and handles absent geometry',()=>{
 assert.equal(distanceKm(STATIONS[0],STATIONS[0]),0);
 assert.ok(distanceKm({lat:0,lng:0},{lat:0,lng:1})>111&&distanceKm({lat:0,lng:0},{lat:0,lng:1})<112);
 assert.ok(projectEstimate(project,{policies:['sb79']}).effects.some(e=>e.id==='sb79'));
 assert.equal(projectEstimate({...project,lat:37,lng:-123},{policies:['sb79']}).effects.length,0);
 const missing=projectEstimate({...project,lat:null},{policies:['sb79']});assert.equal(missing.nearTransit,false);assert.ok(Number.isFinite(missing.expected));
});
test('unknown affordable count remains unknown and zero remains zero',()=>{
 assert.equal(projectEstimate({...project,bmr:null}).affordable,null);
 assert.equal(projectEstimate({...project,bmr:0}).affordable,0);
 assert.ok(projectEstimate({...project,bmr:500}).affordable<=projectEstimate(project).expected);
 assert.equal(estimateProjects([{...project,bmr:null}]).affordableKnown,0);
});
test('policy proxies respect stage, affordability, start year and overlap cap',()=>{
 const policies=POLICIES.map(p=>p.id);
 assert.equal(projectEstimate({...project,stage:'construction'},{policies}).effects.length,0);
 assert.equal(projectEstimate({...project,bmr:null},{policies:['sb423','sb417']}).effects.length,0);
 assert.equal(projectEstimate({...project,bmr:100},{year:2027,policies:['sb417']}).effects.length,0);
 assert.equal(projectEstimate({...project,bmr:100},{year:2028,policies:['sb417']}).effects.length,1);
 assert.equal(projectEstimate({...project,bmr:100},{policies}).months,18);
});
test('economic headwinds reduce delivery and acceleration increases it',()=>{
 const baseline=projectEstimate(project);
 assert.ok(projectEstimate(project,{rate:9,costs:6,delay:12}).expected<baseline.expected);
 assert.ok(projectEstimate(project,{rate:4,costs:1,delay:-6,policies:['sb79']}).expected>baseline.expected);
});
test('real dataset respects bounds, monotonic time, uncertainty and reproducibility',()=>{
 const earlier=estimateProjects(PROJECTS,{year:2027});const later=estimateProjects(PROJECTS,{year:2040});
 assert.ok(earlier.rows.length>100);assert.ok(later.expected>earlier.expected);
 for(const p of later.rows){assert.ok(0<=p.low&&p.low<=p.expected&&p.expected<=p.high&&p.high<=p.units);assert.ok(p.affordable===null||p.affordable<=p.expected);}
 assert.deepEqual(later,estimateProjects(PROJECTS,{year:2040}));
 for(const stage of ['proposed','review','approved','construction'])for(const year of [2027,2031,2040])for(const rate of [3,10]){
  const p=projectEstimate({...project,stage},{year,rate,costs:8,delay:24,policies:POLICIES.map(p=>p.id)});
  assert.ok(p.low<=p.expected&&p.expected<=p.high&&p.high<=p.units);
 }
});
test('aggregation deduplicates IDs within a city but preserves separate-city records',()=>{
 const result=estimateProjects([project,project,{...project,city:'other'}]);assert.equal(result.rows.length,2);assert.equal(result.units,200);
 assert.deepEqual(estimateProjects([]).rows,[]);
});

test('a city price marker shrinks to a dot when the whole region is on screen',()=>{
 // Regional zooms: one card per city covered the map and each other.
 assert.equal(priceMarkerSize(8),'dot');
 assert.equal(priceMarkerSize(9.5),'dot');
 assert.equal(priceMarkerSize(10),'dot');
 // County zoom shows the value alone.
 assert.equal(priceMarkerSize(10.2),'chip');
 assert.equal(priceMarkerSize(11.4),'chip');
 // Close enough for the labels to have room.
 assert.equal(priceMarkerSize(11.5),'card');
 assert.equal(priceMarkerSize(14),'card');
 assert.equal(priceMarkerSize(undefined),'dot');
});
