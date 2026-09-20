import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRecord} from '../scripts/lib/hcd-housing.js';
import {dashboardProjects} from '../scripts/sync-projects.js';
import '../public/housing-data.js';
const snapshot=JSON.parse(readFileSync(new URL('../public/data/housing-records.json',import.meta.url)));
const catalog=JSON.parse(readFileSync(new URL('../public/data/municipalities.json',import.meta.url)));
const city={key:'petaluma',center:{lat:38.24,lng:-122.63}};
const base={_id:1,JURIS_NAME:'PETALUMA',YEAR:'2025',APN:'123',STREET_ADDRESS:'12 Main St',NO_BUILDING_PERMITS:'10',BP_ISSUE_DT1:'2025-03-12',LATITUDE:'38.24',LONGITUDE:'-122.63',SCORE:'100'};
test('annual permits are approvals, not inferred construction; completions stay out of future delivery',()=>{
 const p=normalizeRecord(base,'A2',city);assert.equal(p.stage,'approved');assert.equal(p.reportedStatus,'Building permit issued');assert.equal(p.units,10);assert.equal(p.lastDate,'2025-03-12');
 const done=normalizeRecord({...base,NO_OTHER_FORMS_OF_READINESS:'7',CO_ISSUE_DT1:'2025-08-01'},'A2',city);assert.equal(done.stage,'completed');assert.equal(done.units,7);
 assert.equal(normalizeRecord({...base,NO_BUILDING_PERMITS:'0'},'A2',city),null);
 assert.equal(normalizeRecord({...base,APPLICATION_STATUS:'Withdrawn',TOT_PROPOSED_UNITS:'10'},'A',city),null);
});
test('low confidence and wrong-city geocodes stay unlocated instead of creating false map points',()=>{
 assert.equal(normalizeRecord({...base,LATITUDE:'36.219404',LONGITUDE:'-119.365743'},'A2',city).lat,null);
 assert.equal(normalizeRecord({...base,SCORE:'55'},'A2',city).lng,null);
 assert.equal(normalizeRecord({...base,LATITUDE:null,LONGITUDE:null},'A2',city).lat,null);
 assert.equal(normalizeRecord(base,'A2',city).lat,38.24);
});
test('all 101 municipalities have sourced project samples, mapped records, annual totals and news updates',()=>{
 assert.equal(catalog.cities.length,101);assert.equal(new Set(catalog.cities.map(c=>c.county)).size,9);
 const projects=dashboardProjects();
 for(const c of catalog.cities){
  const rows=snapshot.cities[c.key];assert.ok(rows.length>0&&rows.length<=25,c.key);assert.ok(rows.some(p=>p.lat!==null),c.key);
  assert.ok(rows.every(p=>p.sourceUrl.startsWith('https://data.ca.gov/api/3/action/datastore_search?')&&p.units>0&&p.bmr<=p.units));
  assert.ok(snapshot.activity[c.key].records>0);assert.ok(snapshot.news.some(n=>n.city===c.key&&n.kind==='data-update'));
  assert.ok(projects.some(p=>p.city===c.key));
 }
 assert.equal(new Set(projects.map(p=>p.id)).size,projects.length);
});
test('annual sample merge preserves curated records and remains idempotent',()=>{
 const old={id:'curated',addr:'12 Main Street',units:100};const cities={test:{data:[old],feed:[]}};
 const sample={cities:{test:[{id:'reported',addr:'12 MAIN ST',units:4},{id:'new',addr:'18 Oak Way',lastDate:'2025-01-01'}]},activity:{test:{year:2025}}};
 DashboardHousing.merge(cities,sample);DashboardHousing.merge(cities,sample);
 assert.deepEqual(cities.test.data.map(p=>p.id),['curated','new']);assert.equal(cities.test.data[0].units,100);assert.equal(cities.test.feed.length,1);
});
