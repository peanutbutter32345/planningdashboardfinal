import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pointInGeometry,hazardIndex,screenFlood,priceScenario,annualElectricityGWh} from '../public/futures/spatial.js';
import {estimateProjects,DEFAULTS} from '../public/futures/model.js';
import {PROJECTS} from '../data/projects.js';
const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[3,3],[7,3],[7,7],[3,7],[3,3]];
const polygon={type:'Polygon',coordinates:[outer,hole]};
test('flood screening respects polygon holes, bounds and disjoint geometry',()=>{
 assert.equal(pointInGeometry([1,1],polygon),true);assert.equal(pointInGeometry([5,5],polygon),false);assert.equal(pointInGeometry([11,5],polygon),false);
 assert.equal(pointInGeometry([0,5],polygon),true);
 assert.equal(pointInGeometry([21,21],{type:'MultiPolygon',coordinates:[[outer],[[[20,20],[22,20],[22,22],[20,22],[20,20]]]]}),true);
});
test('unknown, no match, moderate and special hazard states stay distinct',()=>{
 const index=hazardIndex({features:[{geometry:polygon,properties:{SFHA_TF:'T',FLD_ZONE:'AE'}},{geometry:{type:'Polygon',coordinates:[hole]},properties:{SFHA_TF:'F',FLD_ZONE:'X'}}]});
 assert.equal(screenFlood({lat:1,lng:1},index).level,'high');assert.equal(screenFlood({lat:5,lng:5},index).level,'moderate');assert.equal(screenFlood({lat:11,lng:5},index).level,'unmatched');assert.equal(screenFlood({lat:null,lng:1},index).level,'unknown');assert.equal(screenFlood({lat:1,lng:1},null).level,'unknown');
});
test('price scenario separates observed value, reference, supply response and exposed example',()=>{
 const input={homeValue:1e6,stock:10000,deltaUnits:100,year:2031,trend:2,elasticity:1,floodDiscount:10};
 const p=priceScenario(input);assert.equal(p.observed,1e6);assert.ok(p.reference>p.observed);assert.ok(p.scenario<p.reference);assert.equal(p.exposedExample,p.scenario);
 assert.equal(priceScenario({...input,exposed:true}).exposedExample,p.scenario*.9);
 assert.equal(priceScenario({...input,deltaUnits:0}).scenario,p.reference);
 assert.equal(priceScenario({...input,elasticity:0}).scenario,p.reference);
 assert.ok(priceScenario({...input,deltaUnits:-100}).scenario>p.reference);
 assert.equal(priceScenario({...input,stock:null}),null);assert.equal(priceScenario({...input,homeValue:null}),null);
});
test('grid delay reduces delivery; energy demand follows delivered homes, not local plant MW',()=>{
 const base=estimateProjects(PROJECTS,DEFAULTS),delayed=estimateProjects(PROJECTS,{...DEFAULTS,gridDelay:12});assert.ok(delayed.expected<base.expected);assert.equal(annualElectricityGWh(1000,5000),5);assert.equal(annualElectricityGWh(-1,5000),0);
});
test('public snapshots have complete unique flood features, energy provenance and positive stock',()=>{
 const load=name=>JSON.parse(readFileSync(new URL('../public/futures/data/'+name,import.meta.url)));
 const flood=load('flood.geojson');assert.equal(flood.features.length,flood.metadata.count);assert.equal(new Set(flood.features.map(f=>f.properties.OBJECTID)).size,flood.features.length);assert.ok(flood.features.every(f=>['06081C','06085C','06001C','06013C','06075C','06041C','06055C','06095C','06097C'].includes(f.properties.DFIRM_ID)));
 const energy=load('energy.geojson');assert.ok(energy.features.length>40);assert.ok(energy.metadata.source.includes('FeatureServer'));assert.ok(energy.features.every(f=>Number.isFinite(f.properties.Capacity_Latest)));
 const stock=load('housing-stock.json');assert.equal(Object.keys(stock.cities).length,102);assert.equal(stock.cities.sunnyvale.units,61272);assert.ok(Object.values(stock.cities).every(c=>c.units>0&&c.year===2020));
 const index=hazardIndex(flood),housing=estimateProjects(PROJECTS).rows;const hits=housing.filter(p=>screenFlood(p,index).level==='high');assert.ok(hits.length>0&&hits.length<housing.length);
});
