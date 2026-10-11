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

// Every city's bounding box used to be typed by hand and rounded to two decimals, and 22 of the
// 32 written into index.html cut off part of their own city - Palo Alto by twelve kilometres,
// because the rectangle stopped where the flatlands do and the city runs up into the foothills.
// These now come from the city's own Census boundary, so the box cannot disagree with the shape.
test('city boundaries cover their own city and come from one named source', () => {
  const bounds = JSON.parse(readFileSync(new URL('../public/data/city-boundaries.json', import.meta.url), 'utf8'));
  assert.match(bounds.source, /Census/, 'the source must be named in the file');
  const cities = Object.entries(bounds.cities);
  assert.ok(cities.length >= 100, `only ${cities.length} boundaries`);
  for (const [key, city] of cities) {
    assert.ok(city.ring.length >= 4, `${key} has no usable outline`);
    assert.ok(city.geoid, `${key} has no Census id to trace back to`);
    const lats = city.ring.map(p => p[0]), lngs = city.ring.map(p => p[1]);
    // Every point of the outline must sit inside the box derived from it.
    assert.ok(Math.min(...lats) >= city.bbox.minLat - 1e-4 && Math.max(...lats) <= city.bbox.maxLat + 1e-4,
      `${key}: the outline escapes its own box in latitude`);
    assert.ok(Math.min(...lngs) >= city.bbox.minLng - 1e-4 && Math.max(...lngs) <= city.bbox.maxLng + 1e-4,
      `${key}: the outline escapes its own box in longitude`);
    // Somewhere in the Bay Area, not the Texas Sunnyvale the first query found.
    assert.ok(city.bbox.minLat > 36.5 && city.bbox.maxLat < 39 && city.bbox.minLng > -124 && city.bbox.maxLng < -121,
      `${key} is not in the Bay Area: ${JSON.stringify(city.bbox)}`);
  }
});
