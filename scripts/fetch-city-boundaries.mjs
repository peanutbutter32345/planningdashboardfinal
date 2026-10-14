// Real city limits for every city the dashboard covers, from the US Census Bureau's TIGERweb
// Incorporated Places layer - the same boundaries the Census itself publishes against.
//
//   node scripts/fetch-city-boundaries.mjs
//
// Writes public/data/city-boundaries.json: one simplified polygon per city, plus the bounding box
// derived from it. Until now each city carried a bbox someone had typed by hand, rounded to two
// decimal places, and they are wrong: Sunnyvale's said 37.34-37.43 when the city actually runs
// 37.3302-37.4641, so the northern mile and a half of it sat outside its own box.
//
// A place that is not an incorporated city has no boundary to fetch and is reported, not guessed.
// West San Jose, for one, is a district of San Jose rather than a city of its own.
import { readFileSync, writeFileSync } from 'node:fs';

const LAYER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

// Census spells these differently from the dashboard, or they are towns rather than cities.
// Anything not listed here is tried as "<label> city" and then "<label> town".
const CENSUS_NAME = {
  sthelena: 'St. Helena city',
  sanfrancisco: 'San Francisco city',
  montesereno: 'Monte Sereno city',
  losaltoshills: 'Los Altos Hills town',
};
// Not incorporated cities, so the Census has no place boundary for them.
const NOT_A_PLACE = new Set(['all', 'westsanjose']);

// The 102 cities come from two places: 33 written out in index.html and 69 merged in from
// data/regional.js. CITY_LABELS carries all of them, so take the list from there and the county
// from whichever source has it. Reading the modules beats scraping the HTML for nested braces.
async function allCities() {
  const { CITY_LABELS } = await import('../digest.js');
  const { REGIONAL_CITIES } = await import('../data/regional.js');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const counties = {};
  const re = /(\w+): \{label:'([^']+)',[\s\S]{0,400}?county:'([^']+)'/g;
  let m;
  while ((m = re.exec(html))) counties[m[1]] = m[3];
  return Object.entries(CITY_LABELS)
    .filter(([key]) => !NOT_A_PLACE.has(key))
    .map(([key, label]) => ({ key, label, county: REGIONAL_CITIES[key]?.county || counties[key] || '' }));
}

async function queryPlace(name) {
  const url = `${LAYER}/query?where=${encodeURIComponent(`STATE='06' AND NAME='${name.replace(/'/g, "''")}'`)}`
    + '&outFields=NAME,GEOID&returnGeometry=true&outSR=4326&f=geojson';
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: abort.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data.features?.[0] || null;
  } finally { clearTimeout(timer); }
}

// Ramer-Douglas-Peucker. A city arrives with a thousand vertices or more, which is far more
// shape than a map at city zoom can show and would put several megabytes on every page load.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let farthest = 0, maxDist = 0;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const t = lenSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const dist = (px - qx) ** 2 + (py - qy) ** 2;
    if (dist > maxDist) { maxDist = dist; farthest = i; }
  }
  if (Math.sqrt(maxDist) <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, farthest + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(farthest), tolerance),
  ];
}

// Roughly 25 m at this latitude: the shape still reads as the city, at a fraction of the points.
const TOLERANCE = 0.00025;

function ringsOf(geometry) {
  return geometry.type === 'Polygon' ? geometry.coordinates
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat()
    : [];
}

const cities = await allCities();
console.log(`${cities.length} cities to look up\n`);
const boundaries = {};
const missing = [];
let rawPoints = 0, keptPoints = 0;

for (const city of cities) {
  const candidates = CENSUS_NAME[city.key] ? [CENSUS_NAME[city.key]] : [`${city.label} city`, `${city.label} town`];
  let feature = null, usedName = null;
  for (const name of candidates) {
    feature = await queryPlace(name);
    if (feature) { usedName = name; break; }
  }
  if (!feature) { missing.push(city); console.log(`  MISSING  ${city.label}`); continue; }

  // Outer rings only. Every city here is one contiguous shape plus, at most, slivers.
  const rings = ringsOf(feature.geometry).map(r => (Array.isArray(r[0][0]) ? r[0] : r));
  const biggest = rings.sort((a, b) => b.length - a.length)[0];
  rawPoints += biggest.length;
  const ring = simplify(biggest, TOLERANCE);
  keptPoints += ring.length;

  const lngs = ring.map(p => p[0]), lats = ring.map(p => p[1]);
  boundaries[city.key] = {
    label: city.label,
    county: city.county,
    censusName: usedName,
    geoid: feature.properties.GEOID,
    // [lat, lng] throughout, because that is the order Leaflet takes.
    ring: ring.map(([lng, lat]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))]),
    bbox: {
      minLat: Number(Math.min(...lats).toFixed(5)), maxLat: Number(Math.max(...lats).toFixed(5)),
      minLng: Number(Math.min(...lngs).toFixed(5)), maxLng: Number(Math.max(...lngs).toFixed(5)),
    },
  };
  process.stdout.write('.');
}

const out = {
  source: 'US Census Bureau TIGERweb, Incorporated Places',
  sourceUrl: LAYER,
  retrieved: new Date().toISOString(),
  note: 'Simplified to roughly 25 m. City limits as the Census publishes them, which is what the '
    + 'Census statistics on this site are themselves reported against. Not a parcel-accurate survey.',
  cities: boundaries,
};
writeFileSync(new URL('../public/data/city-boundaries.json', import.meta.url), JSON.stringify(out));

console.log(`\n\n${Object.keys(boundaries).length} boundaries written`);
console.log(`${rawPoints.toLocaleString()} vertices simplified to ${keptPoints.toLocaleString()}`);
if (missing.length) {
  console.log(`\n${missing.length} with no Census place, left alone rather than guessed:`);
  for (const c of missing) console.log(`  ${c.label} (${c.county})`);
}
