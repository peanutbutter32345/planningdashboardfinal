// The dashboard states two different figures and using the wrong one makes a false claim. "101
// cities and towns" means the incorporated places; the 102nd profile is the West San Jose
// neighborhood, which belongs only in a total of areas. The .city-count spans were filled with
// the total, so the page read "102 cities and towns across nine Bay Area counties".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { REGIONAL_DATA } from '../data/regional.js';
import '../public/housing-data.js';

const HOUSING_RECORDS = JSON.parse(readFileSync(new URL('../public/data/housing-records.json', import.meta.url)));
const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function dashboardCounts() {
  const start = indexHtml.indexOf('const STAGES =');
  const end = indexHtml.indexOf("let currentCity = 'sunnyvale';");
  if (start < 0 || end <= start) throw new Error('Dashboard data boundaries changed; update this test.');
  return vm.runInNewContext(
    indexHtml.slice(start, end) +
    ';({total: CITY_COUNT, incorporated: INCORPORATED_CITY_COUNT, nonCity: NON_CITY_AREAS, keys: Object.keys(CITIES)})',
    { window: { REGIONAL_DATA, HOUSING_RECORDS }, DashboardHousing: globalThis.DashboardHousing },
    { timeout: 5000 });
}

test('the incorporated count is every profile minus the areas that are not cities', () => {
  const { total, incorporated, nonCity, keys } = dashboardCounts();
  assert.equal(incorporated, total - nonCity.length,
    'INCORPORATED_CITY_COUNT must exclude exactly the areas listed in NON_CITY_AREAS');
  for (const key of nonCity) {
    assert.ok(keys.includes(key),
      `NON_CITY_AREAS names "${key}", which is not a profile the dashboard holds`);
  }
});

// A real-world figure, not one derived from the file being checked: the nine Bay Area counties
// contain 101 incorporated cities and towns. If a city is added or dropped by accident, this is
// what notices.
test('the dashboard covers all 101 incorporated Bay Area cities and towns', () => {
  const { incorporated } = dashboardCounts();
  assert.equal(incorporated, 101,
    'Either a city was added or removed by mistake, or a tenth county crept into the data.');
});

test('every count a reader sees comes from a span the script fills', () => {
  // Both spans exist and neither sentence types its own number. The placeholder inside the span
  // is overwritten on load, so it may stay as a hint to whoever reads the markup.
  assert.match(indexHtml, /document\.querySelectorAll\('\.city-count'\)[\s\S]{0,120}INCORPORATED_CITY_COUNT/,
    '.city-count spans must be filled with the incorporated count');
  assert.match(indexHtml, /document\.querySelectorAll\('\.area-count'\)[\s\S]{0,120}CITY_COUNT/,
    '.area-count spans must be filled with the total number of areas');
});
