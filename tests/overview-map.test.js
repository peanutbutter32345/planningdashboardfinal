import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PROJECTS} from '../data/projects.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const context={};vm.runInNewContext(readFileSync(new URL('../public/overview-map-utils.js',import.meta.url),'utf8'),context);
const {validPoint,groupLocations,coverage}=context.OverviewMapUtils;
test('every located project remains accessible, including coincident points',()=>{
  const groups=groupLocations(PROJECTS);
  assert.equal(groups.flat().length,PROJECTS.filter(validPoint).length);
  assert.equal(new Set(groups.flat().map(p=>p.id)).size,PROJECTS.filter(validPoint).length);
  assert.ok(groups.some(g=>g.length>1));
  const sample=[{id:'a',lat:37,lng:-122},{id:'b',lat:37,lng:-122},{id:'c',lat:null,lng:null},{id:'d',lat:NaN,lng:-122},{id:'e',lat:100,lng:0}];
  assert.deepEqual(JSON.parse(JSON.stringify(coverage(sample))),{total:5,mapped:2,unlocated:3,locations:1});
  assert.equal(groupLocations(sample).flat().filter(p=>p.id==='b').length,1);
});
test('locating a record without coordinates preserves the multi-project Google map',()=>{
  const elements={overviewLocationNotice:{hidden:true,innerHTML:''},explore:{scrollIntoView(){}}};
  const project={id:'missing',addr:'Planning area',lat:null,lng:null};
  const sandbox={OverviewMapUtils:context.OverviewMapUtils,DATA:()=>[project],CITIES:{test:{label:'Test city'}},currentCity:'test',cityOfProject:()=> 'test',mapProvider:'google',document:{getElementById:id=>elements[id]},escapeHtml:s=>s};
  const start=html.indexOf('function flyTo(id){'),end=html.indexOf('// ---------------- FEED / REGISTER',start);
  vm.runInNewContext(html.slice(start,end)+';flyTo("missing");',sandbox);
  assert.equal(sandbox.mapProvider,'google');
  assert.equal(elements.overviewLocationNotice.hidden,false);
  assert.match(elements.overviewLocationNotice.innerHTML,/maps\/search/);
});
