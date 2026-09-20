import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {REGIONAL_DATA,REGIONAL_CITIES} from '../data/regional.js';
import {CITY_LABELS} from '../digest.js';
import {MEETING_DIRECTORY,LEGISTAR_CITIES} from '../hearings.js';
import {NEWS_ARTICLES} from '../data/news.js';
import {CITY_STATS} from '../data/stats.js';
const photos=JSON.parse(readFileSync(new URL('../public/data/city-photos.json',import.meta.url)));
test('new cities are available to dashboard, server, meetings and guest city preferences',()=>{
 const context={window:{}};vm.runInNewContext(readFileSync(new URL('../public/data/regions.js',import.meta.url),'utf8'),context);
 assert.equal(JSON.stringify(context.window.REGIONAL_DATA),JSON.stringify(REGIONAL_DATA));
 assert.equal(Object.keys(REGIONAL_CITIES).length,17);
 assert.equal(Object.keys(MEETING_DIRECTORY).length,50);
 assert.equal(Object.keys(LEGISTAR_CITIES).length,10);
 for(const [key,c]of Object.entries(REGIONAL_CITIES)){
  assert.equal(CITY_LABELS[key],c.label);assert.ok(c.county);assert.ok(c.data.length);
  assert.ok(c.resources.length>=4);assert.ok(c.deciders.length>=2);
  assert.ok(MEETING_DIRECTORY[key].links.length);
  assert.ok(c.stats.population>0);assert.equal(CITY_STATS[key].population,c.stats.population);
  assert.ok(c.stats.source.startsWith('https://censusreporter.org/profiles/'));
  assert.ok(NEWS_ARTICLES.some(a=>a.city===key&&a.snippet&&a.topic));
  assert.ok(photos[key]?.source?.startsWith('https://commons.wikimedia.org/'));
  assert.ok(existsSync(new URL('../public'+photos[key].url,import.meta.url)));
  for(const p of c.data){assert.ok(p.sourceUrl.startsWith('https://'));assert.equal(p.lat==null,p.lng==null);assert.ok(p.units==null||p.units>0);assert.ok(p.bmr==null||(p.bmr>=0&&p.bmr<=p.units));}
 }
});
test('every city has a locally served photo with attribution',()=>{
 assert.equal(Object.keys(photos).length,50);
 for(const p of Object.values(photos)){assert.ok(p.cap&&p.lic&&p.by);assert.ok(p.url.startsWith('/img/cities/'));assert.ok(existsSync(new URL('../public'+p.url,import.meta.url)));}
});
