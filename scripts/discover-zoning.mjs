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

// Every city's own links tell us its domain. The 33 written into index.html carry ctaLinks; the
// 69 in regional.js carry planning, meetings and website. Earlier this read only the first set,
// so two thirds of the cities were never asked.
async function cityHosts() {
  const { REGIONAL_CITIES } = await import('../data/regional.js');
  const { CITY_LABELS } = await import('../digest.js');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const hosts = {};
  const pick = urls => urls
    .map(u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } })
    .find(h => h && /\.(gov|org|us|net|com)$/.test(h));

  for (const [key, city] of Object.entries(REGIONAL_CITIES)) {
    const domain = pick([city.website, city.planning, city.meetings, ...(city.resources || []).map(r => r.url)]);
    const links = [city.website, city.planning, city.meetings, ...(city.resources || []).map(r => r.url)].filter(Boolean);
    if (domain) hosts[key] = { label: city.label, domain, links };
  }
  const re = /(\w+): \{label:'([^']+)',[\s\S]{0,4000}?ctaLinks:\s*\[([\s\S]{0,1500}?)\]/g;
  let m;
  while ((m = re.exec(html))) {
    if (hosts[m[1]]) continue;
    const domain = pick([...m[3].matchAll(/https?:\/\/[^'"\s]+/g)].map(u => u[0]));
    const links = [...m[3].matchAll(/https?:\/\/[^'"\s]+/g)].map(u => u[0]);
    if (domain) hosts[m[1]] = { label: m[2], domain, links };
  }
  const without = Object.keys(CITY_LABELS).filter(k => k !== 'all' && !hosts[k]);
  if (without.length) console.log(`no domain found for: ${without.join(', ')}\n`);
  return hosts;
}

// Where a city's ArcGIS Server might answer. The instance is usually "arcgis", but orgs rename
// it - Cupertino's is "cupgis", which no amount of guessing finds reliably - so any REST root
// already present in the dashboard is tried first.
function knownRoots() {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const found = {};
  for (const m of html.matchAll(/https?:\/\/([a-z0-9.-]+)\/([a-z0-9_]+)\/rest\/services/gi)) {
    const host = m[1].replace(/^www\./, '');
    (found[host] ||= new Set()).add(`https://${m[1]}/${m[2]}/rest/services`);
  }
  return found;
}
const KNOWN = knownRoots();

const roots = (domain, slug) => {
  const seeded = Object.entries(KNOWN)
    .filter(([host]) => host.endsWith(domain) || domain.endsWith(host.replace(/^gis\.|^maps\./, '')))
    .flatMap(([, urls]) => [...urls]);
  const instances = ['arcgis', 'gis', 'server', 'public', `${slug}gis`, `${slug.slice(0, 3)}gis`];
  const hosts = [`gis.${domain}`, `maps.${domain}`, `gisweb.${domain}`, domain];
  const guesses = hosts.flatMap(h => instances.map(i => `https://${h}/${i}/rest/services`));
  return [...new Set([...seeded, ...guesses])];
};

// Cities that publish through ArcGIS Online rather than their own server. Their links point at a
// viewer app; that app's item record names the account that owns it, and that account's public
// items are where the zoning layer will be if there is one.
async function agolOwners(city) {
  const ids = new Set();
  for (const url of city.links || []) {
    for (const m of url.matchAll(/\b(?:id|appid|webmap)=([0-9a-f]{32})\b/gi)) ids.add(m[1]);
    for (const m of url.matchAll(/\/items\/([0-9a-f]{32})/gi)) ids.add(m[1]);
  }
  const owners = new Set();
  for (const id of [...ids].slice(0, 4)) {
    const item = await get(`https://www.arcgis.com/sharing/rest/content/items/${id}?f=json`);
    if (item?.owner) owners.add(item.owner);
  }
  return [...owners];
}

async function agolZoning(owner) {
  const res = await get(`https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent('owner:' + owner)}&num=100&f=json`);
  for (const item of (res?.results || [])) {
    if (!/FeatureServer|MapServer/.test(item.url || '')) continue;
    if (!ZONE_SERVICE.test(item.title) || NOT_LAND_USE.test(item.title)) continue;
    // Walk into the service the same way a self-hosted one is walked.
    const info = await get(`${item.url}?f=json`);
    const layers = info?.layers || [{ id: 0, name: item.title }];
    for (const layer of layers) {
      if (NOT_LAND_USE.test(layer.name)) continue;
      const meta = await get(`${item.url}/${layer.id}?f=json`);
      if (meta?.geometryType !== 'esriGeometryPolygon') continue;
      const field = (meta.fields || []).find(f => ZONE_FIELD.test(f.name));
      if (!field) continue;
      const url = `${item.url}/${layer.id}`;
      const rows = await get(`${url}/query?where=1%3D1&outFields=${field.name}&returnGeometry=false&f=json&resultRecordCount=400`);
      const districts = [...new Set((rows?.features || []).map(f => f.attributes[field.name]).filter(Boolean))].sort();
      if (districts.length < 2) continue;
      const count = await get(`${url}/query?where=1%3D1&returnCountOnly=true&f=json`);
      return { url, field: field.name, layerName: layer.name, districts, polygons: count?.count ?? null, via: `ArcGIS Online, ${owner}` };
    }
  }
  return null;
}

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
const hosts = await cityHosts();
const keys = Object.keys(hosts).filter(k => !only || k === only);
console.log(`${keys.length} cities with a known domain\n`);

const found = {};
const none = [];
for (const key of keys) {
  const { label, domain } = hosts[key];
  let hit = null;
  // Two dozen candidate roots per city, each tried in turn on a twelve second timeout, is hours
  // of waiting on servers that are mostly not there. But firing all two dozen at once is worse:
  // most of them are the same few hosts with a different instance name, and a city's GIS box
  // throttles that and drops the one request that would have worked. So: the roots already known
  // to work first, since one of those settles it outright, then the guesses six at a time.
  const candidates = roots(domain, key);
  const seeded = candidates.filter(r => Object.keys(KNOWN).some(h => r.includes(h)));
  const live = [];
  const probe = async root => {
    const answer = await get(`${root}?f=json`, 8000);
    if (answer && (answer.services || answer.folders)) live.push(root);
  };
  for (const root of seeded) await probe(root);
  if (!live.length) {
    const rest = candidates.filter(r => !seeded.includes(r));
    for (let i = 0; i < rest.length && !live.length; i += 6)
      await Promise.all(rest.slice(i, i + 6).map(probe));
  }
  for (const root of live) {
    const services = await servicesUnder(root);
    if (!services) continue;
    for (const service of services.filter(s => ZONE_SERVICE.test(s.name) && !NOT_LAND_USE.test(s.name))) {
      hit = await zoningLayerIn(root, service);
      if (hit) break;
    }
    if (hit) break;
  }
  if (!hit) {
    for (const owner of await agolOwners(hosts[key])) {
      hit = await agolZoning(owner);
      if (hit) break;
    }
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
