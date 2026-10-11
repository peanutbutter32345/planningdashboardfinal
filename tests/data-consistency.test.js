import test from 'node:test';
import assert from 'node:assert/strict';
import {PROJECTS} from '../data/projects.js';
import {dashboardProjects} from '../scripts/sync-projects.js';
test('dashboard and server use identical project facts',()=>{
 assert.deepEqual(PROJECTS,dashboardProjects(),'Run npm run sync:projects after changing embedded project data.');
 assert.equal(new Set(PROJECTS.map(p=>p.city+':'+p.id)).size,PROJECTS.length,'Project IDs must be unique within each city');
});

// Counts written into a sentence by hand go stale the moment a city or a record is added, and
// nothing complains. Three sentences said "101 cities" after the 102nd arrived, and Santa Clara's
// note claimed "all 53 records" when it held 77 - from two different sources, not the one it
// named. Both had been wrong for a while. Counts belong in an interpolation, not in prose.
import {readFileSync} from 'node:fs';
const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
// What a visitor actually reads: the file with its comments removed, and with the placeholder
// inside each count span taken out, since the script overwrites that number on load. A count
// named in a comment is a note to whoever is editing the file, not copy.
const readerFacingHtml = indexHtml
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(<span class="(?:city|area)-count">)\d+(<\/span>)/g, '$1$2');

test('reader-facing copy never hardcodes a count that the data can change', () => {
  // An adjective between the number and the noun used to walk straight past this: "All 101
  // incorporated cities and towns" sat in the About section for as long as the check existed.
  // Any word or two may stand between them now.
  const hardcodedCities = [...readerFacingHtml.matchAll(
    /\b\d{2,4}\s+(?:[a-z]+\s+){0,2}(?:Bay Area\s+)?(?:cities|towns|areas)(?:\s+and\s+towns)?\b/g)]
    .map(m => m[0])
    // The interpolated forms are what these should look like.
    .filter(hit => !hit.includes('${'));
  assert.deepEqual(hardcodedCities, [],
    'Use a .city-count span (incorporated cities) or .area-count (every profile) instead of typing the number.');

  // The spans carry two different figures and the wrong one reads as a false claim. "Cities and
  // towns" means the incorporated places; West San Jose is a neighborhood profile and belongs
  // only in the total. The nine-county Bay Area has 101 incorporated cities and towns, so this
  // is a fact about California, not a number derived from the file it is checking.
  const cityCountSpans = (readerFacingHtml.match(/class="city-count"/g) || []).length;
  assert.ok(cityCountSpans > 0, 'the page should state how many cities it covers');
  assert.match(indexHtml, /const NON_CITY_AREAS=\[/,
    'the non-city areas have to be named somewhere, or the two counts collapse into one');

  const noteCounts = [...indexHtml.matchAll(/note:\s*'((?:[^'\\]|\\.)*)'/g)]
    .map(m => m[1])
    .flatMap(note => [...note.matchAll(/\b\d{1,4}\s+(?:records|projects|entries)\b/g)].map(m => `${m[0]} :: ${note.slice(0, 60)}`));
  assert.deepEqual(noteCounts, [],
    'A city note must not claim a record count; the data changes and the sentence does not.');
});

// SB 79 is the upzoning law this dashboard has led on for months, and MTC maps where it applies.
// Its absence from Napa, Sonoma and Solano is the reach of the statute, not missing data, so the
// file has to say which source it came from and what the tiers mean.
test('the SB 79 zones name their source and carry the statute\'s own tiers', () => {
  const sb79 = JSON.parse(readFileSync(new URL('../public/data/sb79-zones.json', import.meta.url), 'utf8'));
  assert.match(sb79.source, /Metropolitan Transportation Commission/);
  assert.ok(sb79.zones.length > 100, `only ${sb79.zones.length} zones`);
  const tiers = new Set(sb79.zones.map(z => z.tier));
  for (const tier of tiers) assert.match(tier, /^Tier [12] - (200ft|Quarter Mile|Half Mile)$/, `odd tier: ${tier}`);
  assert.ok(tiers.size >= 4, 'both tiers at more than one distance should be present');
  for (const zone of sb79.zones) {
    assert.ok(zone.ring.length >= 3, `${zone.id} has no usable outline`);
    const lats = zone.ring.map(p => p[0]), lngs = zone.ring.map(p => p[1]);
    assert.ok(Math.min(...lats) > 36.5 && Math.max(...lats) < 39, `${zone.id} is outside the Bay Area`);
    assert.ok(Math.min(...lngs) > -124 && Math.max(...lngs) < -121, `${zone.id} is outside the Bay Area`);
  }
});
