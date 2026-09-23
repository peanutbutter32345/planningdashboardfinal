// Upcoming public meetings from verified public Legistar feeds. Each city also has an official meeting directory.
import { PROJECTS } from './data/projects.js';

import {readFileSync} from 'node:fs';
export const MEETING_DIRECTORY=JSON.parse(readFileSync(new URL('./public/data/meetings.json',import.meta.url),'utf8'));
export const LEGISTAR_CITIES=Object.fromEntries(Object.entries(MEETING_DIRECTORY).filter(([k,c])=>c.client&&!c.alias).map(([k,c])=>[k,c.client]));

// Only bodies that actually decide land use. Pulling agenda items is one request per meeting,
// so this keeps a refresh to a few dozen calls rather than several hundred.
const RELEVANT_BODY = /planning|city council|town council|design review|architectural|zoning|housing|transportation|development|board of supervisors|land use|public works/i;

// What a land-use agenda item looks like when the city doesn't use a "Location:" line.
const LAND_USE_ITEM = /\b(rezon\w*|use permit|development permit|subdivision|tentative map|architectural review|design review|general plan amendment|specific plan|housing element|density bonus|variance|dwelling units?|apartments?|townhomes?|mixed[- ]use|builder'?s remedy|entitlement)\b/i;

const DAYS_AHEAD = 45;
const CACHE_MS = 6 * 60 * 60 * 1000;   // Legistar is slow and agendas move at most daily
let cache = { at: 0, data: null };
let inFlight = null;

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
    if (p.city !== city && !(city==='sanjose' && p.city==='westsanjose')) continue;
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

async function getJson(url, signal) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
  if (!res.ok) throw new Error(`Legistar ${res.status} for ${url}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Invalid Legistar response");
  return data;
}

async function fetchCity(cityKey, client, fromIso, toIso) {
  const signal = AbortSignal.timeout(12000);
  const base = `https://webapi.legistar.com/v1/${client}`;
  const filter = encodeURIComponent(`EventDate ge datetime'${fromIso}' and EventDate le datetime'${toIso}'`);
  const events = await getJson(`${base}/events?$filter=${filter}&$orderby=EventDate&$top=60`, signal);

  const out = [];
  for (const ev of events) {
    const body = ev.EventBodyName || '';
    if (!RELEVANT_BODY.test(body)) continue;

    let items = [];
    try {
      items = await getJson(`${base}/events/${ev.EventId}/eventitems?AgendaNote=1&MinutesNote=0&Attachments=0`, signal);
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
  const ttl = cache.data?.errors?.length ? 60000 : CACHE_MS;
  if (!force && cache.data && (Date.now() - cache.at) < ttl) return cache.data;
  if (inFlight) return inFlight;
  inFlight = refreshHearings();
  try { return await inFlight; } finally { inFlight = null; }
}

async function refreshHearings() {

  const now = new Date();
  const to = new Date(now.getTime() + DAYS_AHEAD * 864e5);
  // Legistar dates are local meeting dates, not UTC dates.
  const localDate = date => date.toLocaleDateString('en-CA', {timeZone:'America/Los_Angeles'});
  const fromIso = localDate(now);
  const toIso = localDate(to);

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
    directory: MEETING_DIRECTORY,
    errors,
  };
  cache = { at: Date.now(), data };
  return data;
}

// Hearings for one city, used by the email briefings.
export function hearingsForCity(all, cityKey) {
  const canonical=MEETING_DIRECTORY[cityKey]?.alias||cityKey;
  return (all && all.hearings ? all.hearings : []).filter(h => h.city === canonical);
}

// ---------------- RECENT (PAST) MEETINGS ----------------
// For the "Summarize Recent Meetings" feature: what already happened, not what's upcoming.
// Kept separate from getHearings() above because it reads MinutesNote (vote outcomes), which
// only exists once a meeting has actually occurred, and is cached per city rather than in bulk
// since a reader only ever asks about one city at a time.
const RECENT_DAYS_BACK = 30;
const RECENT_CACHE_MS = 3 * 60 * 60 * 1000;
const recentCache = new Map(); // canonical city key -> {at, data}

async function fetchRecentCity(client, fromIso, toIso) {
  const signal = AbortSignal.timeout(12000);
  const base = `https://webapi.legistar.com/v1/${client}`;
  const filter = encodeURIComponent(`EventDate ge datetime'${fromIso}' and EventDate le datetime'${toIso}'`);
  const events = await getJson(`${base}/events?$filter=${filter}&$orderby=EventDate desc&$top=30`, signal);

  const out = [];
  // Legistar can list the same meeting twice - a reschedule keeps the old row alongside the new
  // one, or the same event surfaces under more than one committee alias - so a reader never sees
  // one meeting reported as though it were two.
  const seenEvents = new Set();
  for (const ev of events) {
    if (seenEvents.has(ev.EventId)) continue;
    seenEvents.add(ev.EventId);

    const body = ev.EventBodyName || '';
    if (!RELEVANT_BODY.test(body)) continue;
    // Legistar lists cancelled meetings alongside real ones - nothing to summarize there.
    if (/cancel/i.test(ev.EventAgendaStatusName || '')) continue;

    let items = [];
    try {
      items = await getJson(`${base}/events/${ev.EventId}/eventitems?AgendaNote=1&MinutesNote=1&Attachments=0`, signal);
    } catch {
      // One unavailable set of minutes must not sink the whole meeting - it's still worth
      // listing by date and body, just without its items.
    }

    const seenMatters = new Set();
    const matters = items
      .map(it => ({
        title: (it.EventItemTitle || '').trim().split('\n')[0].slice(0, 220),
        action: (it.EventItemActionName || '').trim(),
      }))
      .filter(m => {
        // Legistar repeats an item under more than one agenda section (e.g. both a summary
        // block and the full text) often enough that a raw list reads like the meeting covered
        // the same thing twice.
        if (m.title.length <= 30 || seenMatters.has(m.title)) return false;
        seenMatters.add(m.title);
        return true;
      });

    out.push({
      body,
      date: (ev.EventDate || '').slice(0, 10),
      time: ev.EventTime || null,
      location: ev.EventLocation || null,
      agendaUrl: ev.EventInSiteURL || null,
      minutesUrl: ev.EventMinutesFile || null,
      matters,
    });
  }
  return out;
}

/**
 * Meetings a single city actually held in the last RECENT_DAYS_BACK days, with whatever vote
 * outcomes Legistar has published. Returns {supported:false} for a city with no Legistar feed
 * configured at all, rather than throwing.
 */
export async function getRecentMeetings(cityKey, { force = false } = {}) {
  const canonical = MEETING_DIRECTORY[cityKey]?.alias || cityKey;
  const client = LEGISTAR_CITIES[canonical];
  if (!client) return { supported: false, cityKey: canonical, days: RECENT_DAYS_BACK, meetings: [] };

  const cached = recentCache.get(canonical);
  if (!force && cached && (Date.now() - cached.at) < RECENT_CACHE_MS) return cached.data;

  const now = new Date();
  const from = new Date(now.getTime() - RECENT_DAYS_BACK * 864e5);
  const localDate = date => date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  const meetings = await fetchRecentCity(client, localDate(from), localDate(now));
  meetings.sort((a, b) => b.date.localeCompare(a.date));

  const data = { supported: true, cityKey: canonical, generatedAt: new Date().toISOString(), days: RECENT_DAYS_BACK, meetings };
  recentCache.set(canonical, { at: Date.now(), data });
  return data;
}
