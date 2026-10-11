// Finds each city's own zoning layer on its own GIS server.
//
//   node scripts/discover-zoning.mjs            every city
//   node scripts/discover-zoning.mjs sunnyvale  one city
//
// Writes public/data/zoning-sources.json: for each city that publishes one, the ArcGIS layer URL,
// the field holding the district code, and the districts found in it. Nothing is written for a
// city that does not publish one, and nothing is ever guessed from a neighbour.
//
// There is no regional zoning layer - ABAG's catalogue has none - so this goes city by city.
// The host is taken from the city's own official links, which the dashboard already holds, rather
// than from a guess at what a city might call its GIS box.
import { readFileSync, writeFileSync } from 'node:fs';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
const get = async (url, ms = 12000) => {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
};

// A zoning layer names its district field something like this, and nothing else does.
const ZONE_FIELD = /^(zoning|zone|zone_?code|zoning_?code|zone_?class|zoning_?district|zonedist|zn_?code|landuse|land_?use)$/i;
const ZONE_SERVICE = /zon|land.?use/i;
// Fire, flood, climate and seismic layers all call themselves zones. They are not land use.
const NOT_LAND_USE = /fire|flood|fema|seismic|liquefact|climate|noise|tsunami|evacuat|parking.?zone|school/i;

function cityHosts() {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const hosts = {};
  // Each city's own official links tell us its domain; no need to guess at hostnames.
  const re = /(\w+): \{label:'([^']+)',[\s\S]{0,4000}?ctaLinks:\s*\[([\s\S]{0,1200}?)\]/g;
  let m;
  while ((m = re.exec(html))) {
    const urls = [...m[3].matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(u => u[1]);
    const domain = urls.map(h => h.replace(/^www\./, '')).find(h => /\.(gov|org|us|net)$/.test(h));
    if (domain) hosts[m[1]] = { label: m[2], domain };
  }
  return hosts;
}

const roots = d => [
  `https://gis.${d}/arcgis/rest/services`,
  `https://maps.${d}/arcgis/rest/services`,
  `https://gis.${d}/server/rest/services`,
  `https://${d}/arcgis/rest/services`,
];

async function servicesUnder(root) {
  const top = await get(`${root}?f=json`);
  if (!top || (!top.services && !top.folders)) return null;
  const all = [...(top.services || [])];
  // One level of folders is where a city usually files Planning or CDD.
  for (const folder of (top.folders || []).slice(0, 12)) {
    const sub = await get(`${root}/${folder}?f=json`);
    (sub?.services || []).forEach(s => all.push(s));
  }
  return all;
}

async function zoningLayerIn(root, service) {
  const info = await get(`${root}/${service.name}/${service.type}?f=json`);
  for (const layer of (info?.layers || [])) {
    if (NOT_LAND_USE.test(layer.name)) continue;
    if (!ZONE_SERVICE.test(layer.name) && !ZONE_SERVICE.test(service.name)) continue;
    const meta = await get(`${root}/${service.name}/${service.type}/${layer.id}?f=json`);
    if (meta?.geometryType !== 'esriGeometryPolygon') continue;
    const field = (meta.fields || []).find(f => ZONE_FIELD.test(f.name));
    if (!field) continue;
    const url = `${root}/${service.name}/${service.type}/${layer.id}`;
    // Prove it answers before recording it, and keep the districts it actually contains.
    const rows = await get(`${url}/query?where=1%3D1&outFields=${field.name}&returnGeometry=false&f=json&resultRecordCount=400`);
    const districts = [...new Set((rows?.features || []).map(f => f.attributes[field.name]).filter(Boolean))].sort();
    if (districts.length < 2) continue;      // a single value is a mask, not a zoning map
    const count = await get(`${url}/query?where=1%3D1&returnCountOnly=true&f=json`);
    return { url, field: field.name, layerName: layer.name, districts, polygons: count?.count ?? null };
  }
  return null;
}

const only = process.argv[2];
const hosts = cityHosts();
const keys = Object.keys(hosts).filter(k => !only || k === only);
console.log(`${keys.length} cities with a known domain\n`);

const found = {};
const none = [];
for (const key of keys) {
  const { label, domain } = hosts[key];
  let hit = null;
  for (const root of roots(domain)) {
    const services = await servicesUnder(root);
    if (!services) continue;
    for (const service of services.filter(s => ZONE_SERVICE.test(s.name) && !NOT_LAND_USE.test(s.name))) {
      hit = await zoningLayerIn(root, service);
      if (hit) break;
    }
    if (hit) break;
  }
  if (hit) {
    found[key] = { label, ...hit };
    console.log(`  FOUND ${label}: ${hit.polygons} polygons, ${hit.districts.length} districts (${hit.districts.slice(0, 6).join(', ')}…)`);
  } else { none.push(label); process.stdout.write('.'); }
}

writeFileSync(new URL('../public/data/zoning-sources.json', import.meta.url), JSON.stringify({
  retrieved: new Date().toISOString(),
  note: 'Each entry is a city\'s own published ArcGIS zoning layer, queried live. Cities absent from '
      + 'this file do not publish one in a machine-readable form; their zoning is not shown rather '
      + 'than being inferred from anywhere else.',
  cities: found,
}, null, 1));

console.log(`\n\n${Object.keys(found).length} cities publish a zoning layer; ${none.length} do not.`);
