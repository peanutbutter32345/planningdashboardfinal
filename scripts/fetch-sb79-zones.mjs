// SB 79's transit-oriented development zones, from MTC.
//
//   node scripts/fetch-sb79-zones.mjs
//
// SB 79 is the upzoning law this dashboard's newsletter has led on for months, and MTC publishes
// the map of where it applies: one regional layer covering every city at once, rather than the
// city-by-city hunt that zoning needs. Tier 1 and Tier 2 are the law's own categories, and the
// distances are from the qualifying transit stop.
//
// Worth saying plainly, because its absence reads like missing data: there are no zones in Napa,
// Sonoma or Solano. SB 79 only applies near transit that qualifies under the statute, and those
// counties have none. That is the shape of the law, not a gap in the file.
//
// BASIS, the regional parcel and zoning system that would otherwise be the place to look, is
// offline while MTC rebuilds it. MTC's open data catalogue has no regional zoning layer either -
// 210 datasets, and the only three with "zone" in the title are federal Opportunity Zones, infill
// eligibility, and this. Municipal zoning stays a city-by-city job.
import { writeFileSync } from 'node:fs';

const LAYER = 'https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/mtc_sb79_tod_zones/FeatureServer/1';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

const get = async url => {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

// Same treatment as the city boundaries: a zone arrives with far more vertices than a map at this
// scale can draw, and all of them would be shipped to every reader.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let farthest = 0, maxDist = 0;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const t = lenSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    const dist = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
    if (dist > maxDist) { maxDist = dist; farthest = i; }
  }
  if (Math.sqrt(maxDist) <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, farthest + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(farthest), tolerance),
  ];
}

const meta = await get(`${LAYER}?f=json`);
const total = (await get(`${LAYER}/query?where=1%3D1&returnCountOnly=true&f=json`)).count;
console.log(`${meta.name}: ${total} zones`);

// The service caps a single response, so page through on object id.
const zones = [];
let offset = 0;
while (offset < total) {
  const page = await get(`${LAYER}/query?where=1%3D1&outFields=zone_id,zone_label`
    + `&returnGeometry=true&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=200`);
  const features = page.features || [];
  if (!features.length) break;
  for (const feature of features) {
    const rings = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates
      : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates.flat() : [];
    const biggest = rings.map(r => (Array.isArray(r[0][0]) ? r[0] : r)).sort((a, b) => b.length - a.length)[0];
    if (!biggest || biggest.length < 4) continue;
    zones.push({
      id: feature.properties.zone_id,
      tier: feature.properties.zone_label,
      ring: simplify(biggest, 0.00008).map(([lng, lat]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))]),
    });
  }
  offset += features.length;
  process.stdout.write('.');
}

const byTier = {};
for (const zone of zones) byTier[zone.tier] = (byTier[zone.tier] || 0) + 1;

writeFileSync(new URL('../public/data/sb79-zones.json', import.meta.url), JSON.stringify({
  source: 'Metropolitan Transportation Commission, SB 79 Transit-Oriented Development Zones',
  sourceUrl: LAYER,
  retrieved: new Date().toISOString(),
  note: 'Where SB 79 applies, as MTC maps it. Tier and distance are the statute\'s own categories, '
      + 'measured from the qualifying transit stop. Counties with no qualifying transit have no '
      + 'zones: that is the reach of the law, not an omission here. Simplified for display; check '
      + 'the city for whether a specific parcel qualifies.',
  tiers: byTier,
  zones,
}));

console.log(`\n\n${zones.length} zones written`);
for (const [tier, n] of Object.entries(byTier).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${tier}`);
