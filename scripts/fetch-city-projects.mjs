// Live project records from the cities that publish one, normalised into the shape the dashboard
// already uses for everything else.
//
//   node scripts/fetch-city-projects.mjs
//
// This is the only route to anything that is not housing. HCD's annual return is a housing report
// by statute, so for most of the region it is all there is; a city's own pipeline is where the
// offices, the hotels, the industrial buildings and the street works live.
//
// The mapping below is written out per city on purpose. Six cities publish six different things
// under the word "project" - a planning pipeline, a commercial list, an affordable housing
// programme, a capital improvement programme - with six different status vocabularies, and
// pretending one rule fits them would mean guessing what a city meant. Each entry says what that
// city's layer actually is, and the dashboard shows that label rather than implying they match.
//
// Napa is deliberately absent. Its "CIP Point Assets" layer carries a project name on every row,
// which is why the sweep found it, but ASSETTYP on all of them is wHydrant: it is a hydrant
// inventory tagged with the job that touched it, not a list of projects.
import { readFileSync, writeFileSync } from 'node:fs';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
const get = async url => {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
};

const stage = map => status => map[String(status || '').trim()] || null;

const CITIES = {
  sunnyvale: {
    what: 'planning applications',
    fields: { name: 'Project', desc: 'Description', addr: 'Address', filed: 'FilingDate', decided: 'DecisionDate', status: 'Status', applicant: 'Applicant', apn: 'APN' },
    category: 'Building',
    stage: stage({
      'Under Review': 'review', 'Appeal Pending': 'review',
      'Approved by Planning Commission': 'approved', 'Approved by City Council': 'approved',
      'Approved by Heritage Commission': 'approved', 'Approved by Staff': 'approved',
      'Approved by Administrative Hearing': 'approved',
      'Under Construction': 'construction',
    }),
  },
  dublin: {
    what: 'commercial development',
    fields: { name: 'project_name', desc: 'project_description', addr: 'street_address', status: 'project_status', units: 'residential_units' },
    category: 'Building',
    stage: stage({ 'Under Review': 'review', 'Active': 'review', 'Approved': 'approved', 'Under Construction': 'construction' }),
  },
  hayward: {
    what: 'affordable housing',
    fields: { name: 'Project_Name', desc: 'Affordability_Desc', addr: 'Project_Address', status: 'Status', units: 'Total_Units', applicant: 'Developer', decided: 'Date_Entitlement_Appr' },
    category: 'Housing',
    stage: stage({ 'Predevelopment': 'review', 'Construction': 'construction' }),   // Inactive is dropped
  },
  campbell: {
    what: 'map review permits',
    fields: { name: 'ProjectName', desc: 'ProjectDescription', addr: 'Address', status: 'Status', type: 'ProjectType', fileNo: 'ApplicationNumber' },
    category: 'Building',
    stage: stage({ 'Pending (Under Review)': 'review', 'Recorded': 'approved' }),   // Closed, Withdrawn dropped
  },
  sanramon: {
    what: 'capital improvements',
    fields: { name: 'Project_Name', desc: 'Comments', status: 'Status', fileNo: 'CIP', decided: 'Completion_Date' },
    category: 'Transportation',
    stage: stage({ 'Study': 'proposed', 'Design': 'review', 'Construction': 'construction', 'Closeout': 'construction', 'Complete': 'completed' }),
  },
  cupertino: {
    what: 'capital improvements',
    fields: { name: 'ProjectName', desc: 'ProjectScope', addr: 'Location', status: 'Status', type: 'cipType', url: 'webLink' },
    category: 'Transportation',
    stage: stage({ 'Active': 'construction', 'Complete': 'completed' }),            // Archive, Admin dropped
  },
};

const sources = JSON.parse(readFileSync(new URL('../public/data/project-sources.json', import.meta.url)));
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const text = v => (v === null || v === undefined || v === '' ? null : String(v).trim());
const day = v => (Number.isFinite(v) && v > 0 ? new Date(v).toISOString().slice(0, 10) : null);

// A polygon's centre is close enough to put a pin on; the record is the project, not the parcel.
function centre(geometry) {
  if (!geometry) return [null, null];
  if (Number.isFinite(geometry.x)) return [geometry.y, geometry.x];
  const ring = geometry.rings?.[0];
  if (!ring?.length) return [null, null];
  const n = ring.length;
  return [ring.reduce((a, p) => a + p[1], 0) / n, ring.reduce((a, p) => a + p[0], 0) / n];
}

const out = {};
let kept = 0, dropped = 0;

for (const [key, spec] of Object.entries(CITIES)) {
  const source = sources.cities[key];
  if (!source) { console.log(`  ${key}: no discovered layer, skipped`); continue; }
  const wanted = [...new Set(Object.values(spec.fields))].join(',');
  const data = await get(`${source.url}/query?where=1%3D1&outFields=${encodeURIComponent(wanted)}`
    + '&returnGeometry=true&outSR=4326&f=json&resultRecordCount=1000');
  const features = data?.features || [];
  const records = [];
  for (const feature of features) {
    const a = feature.attributes || {};
    const f = spec.fields;
    const name = text(a[f.name]);
    if (!name) { dropped++; continue; }
    const mapped = spec.stage(a[f.status]);
    // A status this city uses that we have not mapped is dropped rather than guessed at. The
    // ones left out on purpose are the finished and the abandoned: Inactive, Withdrawn, Archive.
    if (!mapped) { dropped++; continue; }
    const [lat, lng] = centre(feature.geometry);
    const units = Number(a[f.units]);
    records.push({
      id: `city-${key}-${slug(a[f.fileNo] || name)}`,
      addr: text(a[f.addr]) || name,
      lat: Number.isFinite(lat) ? Number(lat.toFixed(6)) : null,
      lng: Number.isFinite(lng) ? Number(lng.toFixed(6)) : null,
      cat: spec.category === 'Housing' ? 'dev' : spec.category === 'Transportation' ? 'infra' : 'dev',
      type: spec.category === 'Housing' ? 'Residential' : spec.category === 'Transportation' ? 'Transportation' : (text(a[f.type]) || 'Commercial'),
      stage: mapped,
      units: Number.isFinite(units) && units > 0 ? units : null,
      bmr: null,
      applicant: text(a[f.applicant]) || '',
      fileNo: text(a[f.fileNo]) || text(a[f.name]) || '',
      filed: day(a[f.filed]),
      lastDate: day(a[f.decided]) || day(a[f.filed]),
      desc: text(a[f.desc]) || name,
      lastNote: `${text(a[f.status]) || 'Status not stated'} in ${source.label}'s ${spec.what} layer.`,
      apn: text(a[f.apn]),
      sourceUrl: text(a[f.url]) || source.url,
      sourceType: 'city-gis',
      sourceLabel: `${source.label} ${spec.what}`,
      locationSource: 'City GIS',
      flag: null,
    });
  }
  kept += records.length;
  out[key] = { label: source.label, what: spec.what, layer: source.layerName, url: source.url, records };
  console.log(`  ${source.label.padEnd(11)} ${String(records.length).padStart(4)} kept  (${spec.what})`);
}

writeFileSync(new URL('../public/data/city-projects.json', import.meta.url), JSON.stringify({
  retrieved: new Date().toISOString(),
  note: 'Live records from each city\'s own GIS, normalised into the dashboard\'s record shape. '
      + 'Every city means something different by "project", so each entry names the layer it came '
      + 'from. Rows whose status this city uses but we have not mapped are left out rather than '
      + 'guessed at; so are the finished and the abandoned.',
  cities: out,
}));

// The page loads the .js wrapper, so write both or the browser keeps the old copy.
writeFileSync(new URL('../public/data/city-projects.js', import.meta.url),
  'window.CITY_PROJECTS=' + readFileSync(new URL('../public/data/city-projects.json', import.meta.url), 'utf8') + ';');

console.log(`\n${kept} records from ${Object.keys(out).length} cities; ${dropped} rows left out as unmapped, unnamed or closed.`);
