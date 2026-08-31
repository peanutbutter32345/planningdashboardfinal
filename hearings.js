// Upcoming public hearings, pulled from Legistar and matched against the projects this dashboard
// already tracks.
//
// Five South Bay cities publish their agendas through Legistar's free public API. Their agenda
// items carry the project address and permit number in the item text, which is what makes the
// match possible:
//
//   Location: 1215 Bordeaux Dr. (APN: 110-25-017)
//   File #: PLNG-2025-0582
//
// Everything here is read-only, unauthenticated, and cached, because a free Render instance
// should not hit five external APIs on every page load.

import { PROJECTS } from './data/projects.js';

// Dashboard city key -> Legistar client. Only these five respond; the rest of the South Bay
// runs other agenda systems and is not covered.
export const LEGISTAR_CITIES = {
  sunnyvale: 'sunnyvaleca',
  cupertino: 'cupertino',
  mountainview: 'mountainview',
  santaclara: 'santaclara',
  westsanjose: 'sanjose',
};

// Only bodies that actually decide land use. Pulling agenda items is one request per meeting,
// so this keeps a refresh to a few dozen calls rather than several hundred.
const RELEVANT_BODY = /planning|city council|town council|design review|architectural|zoning|housing|transportation|development/i;

// What a land-use agenda item looks like when the city doesn't use a "Location:" line.
const LAND_USE_ITEM = /\b(rezon\w*|use permit|development permit|subdivision|tentative map|architectural review|design review|general plan amendment|specific plan|housing element|density bonus|variance|dwelling units?|apartments?|townhomes?|mixed[- ]use|builder'?s remedy|entitlement)\b/i;

const DAYS_AHEAD = 45;
const CACHE_MS = 6 * 60 * 60 * 1000;   // Legistar is slow and agendas move at most daily
let cache = { at: 0, data: null };

const STREET_WORDS = /\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|court|ct|way|lane|ln|place|pl|circle|cir|terrace|ter|parkway|pkwy|real)\b\.?/gi;

// "1215 Bordeaux Dr." and "1215 BORDEAUX DRIVE" have to compare equal, and a project stored as
// "510 & 920 De Guigne Dr" has to match an agenda naming either number.
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[.,()#]/g, ' ')
    .replace(STREET_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The distinctive part of an address is the number plus the first word of the street name.
// Matching on that avoids both false positives ("Main Street" alone) and misses from suffix
// differences. Returns every number/name pair in an address that lists several.
function addressKeys(addr) {
  const norm = normalize(addr);
  const keys = [];
  const numbers = norm.match(/\b\d{2,6}\b/g) || [];
  const words = norm.replace(/\b\d{2,6}\b/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const name = words[0];
  if (!name) return keys;
  for (const n of numbers) keys.push(`${n} ${name}`);
  return keys;
}

function matchProjects(text, city) {
  const hay = normalize(text);
  const rawHay = String(text || '').toLowerCase();
  const hits = [];
  for (const p of PROJECTS) {
    if (p.city !== city) continue;
    // A permit number is unambiguous, so try it first.
    if (p.fileNo && p.fileNo.length > 5 && rawHay.includes(String(p.fileNo).toLowerCase())) {
      hits.push({ id: p.id, addr: p.addr, on: 'file number' });
      continue;
    }
    const keys = addressKeys(p.addr);
    if (keys.some(k => hay.includes(k))) hits.push({ id: p.id, addr: p.addr, on: 'address' });
  }
  return hits;
}

// Pull the address and permit number the agenda text states, so an unmatched item is still
// useful to a reader.
function extractDetails(text) {
  const t = String(text || '');
  const loc = t.match(/Location:\s*([^\n(]+)/i);
  const file = t.match(/File\s*#:\s*([^\s\n]+)/i);
  return {
    location: loc ? loc[1].trim().replace(/\s+/g, ' ') : null,
    fileNo: file ? file[1].trim() : null,
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Legistar ${res.status} for ${url}`);
  return res.json();
}

async function fetchCity(cityKey, client, fromIso, toIso) {
  const base = `https://webapi.legistar.com/v1/${client}`;
  const filter = encodeURIComponent(`EventDate ge datetime'${fromIso}' and EventDate le datetime'${toIso}'`);
  const events = await getJson(`${base}/events?$filter=${filter}&$orderby=EventDate&$top=60`);

  const out = [];
  for (const ev of events) {
    const body = ev.EventBodyName || '';
    if (!RELEVANT_BODY.test(body)) continue;

    let items = [];
    try {
      items = await getJson(`${base}/events/${ev.EventId}/eventitems?AgendaNote=1&MinutesNote=0&Attachments=0`);
    } catch {
      // One unavailable agenda must not sink the whole refresh - the meeting itself is still
      // worth showing, just without its items.
    }

    const matters = [];
    for (const it of items) {
      const title = (it.EventItemTitle || '').trim();
      if (title.length < 40) continue;             // headers and procedural boilerplate
      const projects = matchProjects(title, cityKey);
      const det = extractDetails(title);
      // Keep an item if it matched a tracked project, or if it reads like a land-use action.
      // Requiring a "Location:" line only worked for Sunnyvale's agenda format.
      if (!projects.length && !LAND_USE_ITEM.test(title)) continue;
      matters.push({
        title: title.split('\n')[0].slice(0, 200),
        location: det.location,
        fileNo: det.fileNo,
        projects,
      });
    }

    // Meetings are listed even with nothing on the agenda yet: cities publish agendas about a
    // week out, so an empty upcoming Planning Commission is still the thing a reader needs to
    // know about. agendaPublished says which case this is.
    out.push({
      city: cityKey,
      body,
      date: (ev.EventDate || '').slice(0, 10),
      time: ev.EventTime || null,
      location: ev.EventLocation || null,
      agendaUrl: ev.EventInSiteURL || null,
      agendaFile: ev.EventAgendaFile || null,
      agendaPublished: items.length > 0,
      matters,
    });
  }
  return out;
}

/**
 * Every upcoming hearing across the covered cities that has at least one project item on it.
 * Cached for six hours. Returns { generatedAt, days, cities, hearings, errors }.
 */
export async function getHearings({ force = false } = {}) {
  if (!force && cache.data && (Date.now() - cache.at) < CACHE_MS) return cache.data;

  const now = new Date();
  const to = new Date(now.getTime() + DAYS_AHEAD * 864e5);
  const fromIso = now.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    Object.entries(LEGISTAR_CITIES).map(([k, c]) => fetchCity(k, c, fromIso, toIso))
  );

  const hearings = [];
  const errors = [];
  Object.keys(LEGISTAR_CITIES).forEach((k, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') hearings.push(...r.value);
    else errors.push({ city: k, error: String(r.reason && r.reason.message || r.reason) });
  });

  hearings.sort((a, b) => a.date.localeCompare(b.date));
  const data = {
    generatedAt: new Date().toISOString(),
    days: DAYS_AHEAD,
    cities: Object.keys(LEGISTAR_CITIES),
    hearings,
    errors,
  };
  cache = { at: Date.now(), data };
  return data;
}

// Hearings for one city, used by the email briefings.
export function hearingsForCity(all, cityKey) {
  return (all && all.hearings ? all.hearings : []).filter(h => h.city === cityKey);
}
