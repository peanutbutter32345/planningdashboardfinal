import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../public/browse.js';
import '../public/housing-data.js';
import {REGIONAL_DATA} from '../data/regional.js';
const {page,citiesIn,setupValid,swipeDirection}=globalThis.DashboardBrowse;

test('horizontal swipes advance or return a page without hijacking vertical scroll or taps',()=>{
 const start={x:200,y:200};
 assert.equal(swipeDirection(start,{x:50,y:210}),1);
 assert.equal(swipeDirection(start,{x:350,y:190}),-1);
 assert.equal(swipeDirection(start,{x:190,y:400}),0);
 assert.equal(swipeDirection(start,{x:180,y:205}),0);
 assert.equal(swipeDirection(start,{x:100,y:300}),0);
});

test('paged collections reach every record exactly once and clamp invalid pages',()=>{
 const records=Array.from({length:2833},(_,id)=>({id}));
 for(const size of [1,3,6]){
  const pages=page(records,0,size).pages;
  const seen=Array.from({length:pages},(_,i)=>page(records,i,size)).flatMap(p=>p.items);
  assert.deepEqual(seen,records);
  assert.equal(page(records,-20,size).index,0);
  assert.equal(page(records,Infinity,size).index,pages-1);
  assert.ok(page(records,pages,size).items.length<=size);
 }
 assert.deepEqual(page([],8,3),{items:[],index:0,pages:1,total:0,start:0,end:0});
 assert.equal(page(records,NaN,0).items.length,1);
});
test('county directories never include the aggregate and city searches stay in the chosen county',()=>{
 const cities={all:{label:'All Cities'},berkeley:{label:'Berkeley',county:'Alameda'},fremont:{label:'Fremont',county:'Alameda'},sanfrancisco:{label:'San Francisco',county:'San Francisco'}};
 assert.deepEqual(citiesIn(cities,'Alameda').map(([k])=>k),['berkeley','fremont']);
 assert.deepEqual(citiesIn(cities,'Alameda','  BERK  ').map(([k])=>k),['berkeley']);
 assert.equal(citiesIn(cities,'Alameda','Francisco').length,0);
 assert.equal(citiesIn(cities,'','Francisco')[0][0],'sanfrancisco');
});
test('first-visit setup requires a known county but no city or interests',()=>{
 const counties=['Alameda','San Francisco'];
 for(const invalid of [null,{}, {city:'berkeley'}, {county:'Not a county'}])assert.equal(setupValid(invalid,counties),false);
 assert.equal(setupValid({county:'Alameda',city:null,interests:[]},counties),true);
});
test('dashboard inline JavaScript parses after navigation changes',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const [,attrs,body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|type="module"/.test(attrs))assert.doesNotThrow(()=>new vm.Script(body));
});
test('county views retain every matching map record and restore the full Bay dataset',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const housing=JSON.parse(fs.readFileSync(new URL('../public/data/housing-records.json',import.meta.url)));
 const context=vm.createContext({window:{REGIONAL_DATA,HOUSING_RECORDS:housing},DashboardHousing:globalThis.DashboardHousing,DashboardBrowse:globalThis.DashboardBrowse});
 vm.runInContext(html.slice(html.indexOf('const STAGES ='),html.indexOf('// ---------------- HELPERS ----------------')),context);
 const result=vm.runInContext(`(()=>{const total=CITIES.all.data.length;setCountyScope('Alameda');const rows=CITIES.all.data;const county={label:CITIES.all.label,count:rows.length,expected:Object.values(CITIES).filter(c=>c!==CITIES.all&&c.county==='Alameda').reduce((n,c)=>n+c.data.length,0),onlyLocal:rows.every(p=>CITIES[p._sourceCity].county==='Alameda')};setCountyScope('San Francisco');const sf=CITIES.all.data.length===CITIES.sanfrancisco.data.length;setCountyScope('');return {total,county,sf,restored:CITIES.all.data.length};})()`,context);
 assert.equal(result.county.label,'Alameda County');
 assert.equal(result.county.count,result.county.expected);
 assert.ok(result.county.onlyLocal&&result.sf);
 assert.equal(result.total,2833);
 assert.equal(result.restored,result.total);
});
