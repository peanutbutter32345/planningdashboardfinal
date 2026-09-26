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
test('reader-facing copy never hardcodes a count that the data can change', () => {
  const hardcodedCities = [...indexHtml.matchAll(/\b\d{2,4}\s+(?:Bay Area\s+)?cities(?:\s+and\s+towns)?\b/g)]
    .map(m => m[0])
    // The interpolated forms are what these should look like.
    .filter(hit => !hit.includes('${'));
  assert.deepEqual(hardcodedCities, [],
    'Use ${CITY_COUNT} or a .city-count span instead of typing the number.');

  const noteCounts = [...indexHtml.matchAll(/note:\s*'((?:[^'\\]|\\.)*)'/g)]
    .map(m => m[1])
    .flatMap(note => [...note.matchAll(/\b\d{1,4}\s+(?:records|projects|entries)\b/g)].map(m => `${m[0]} :: ${note.slice(0, 60)}`));
  assert.deepEqual(noteCounts, [],
    'A city note must not claim a record count; the data changes and the sentence does not.');
});
