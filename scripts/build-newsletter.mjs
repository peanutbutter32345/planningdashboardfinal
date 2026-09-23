/* Build the monthly newsletter from the dashboard's own sourced data.
 *
 *     node scripts/build-newsletter.mjs
 *
 * Output: public/data/newsletter.json
 *
 * The rule that makes these issues honest: an issue dated in, say, November 2025 may only contain
 * things the public could actually read in November 2025. Facts do not enter an issue because they
 * happened by then - they enter because they had been *published* by then. Each source therefore
 * carries an availability date:
 *
 *   news article            its own publication date
 *   curated city record     its lastDate - the date the city posted the decision
 *   HCD APR record          the release of the annual report it came from (below)
 *   HCD city activity       same
 *   Zillow ZHVI/ZORI        each series point is that year's 31 July value, published weeks later
 *   ACS 5-year 2020-2024    December 2025, when that release came out
 *   RHNA progress           August 2026, the vintage of the progress file this site holds
 *   RHNA allocation target  already public - 6th cycle allocations were adopted in 2021-2022
 *
 * Nothing here is written from memory or generalised: every sentence is assembled from a record
 * that carries a date and a source, and every issue ends with what it could not yet know.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { NEWS_ARTICLES } from '../data/news.js';
import { CITY_STATS } from '../data/stats.js';
import { RHNA } from '../data/rhna.js';
import { REGIONAL_CITIES } from '../data/regional.js';

const ROOT = new URL('..', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const municipalities = read('public/data/municipalities.json');
const housing = read('public/data/housing-records.json');
const photos = read('public/data/city-photos.json');
// Researched outside this site's own collection - statewide laws, regional funding, the decisions
// that set the terms every city then works inside. Each one carries the date it was published and
// the source it was checked against, so the same availability rule applies to it as to everything
// else.
const research = read('data/newsletter-research.json');

// ---------------------------------------------------------------- availability
// HCD publishes each reporting year's annual progress reports after the 1 April deadline that
// follows it. June is the conservative point at which the year's Table A2 rows are reliably on
// data.ca.gov, so a record from reporting year N cannot appear in an issue before June of N+1.
const APR_PUBLISHED = { 2023: '2024-06-01', 2024: '2025-06-01', 2025: '2026-06-01', 2026: '2027-06-01' };
const ACS_2020_2024 = '2025-12-11';   // the 2020-2024 ACS 5-year release
const RHNA_PROGRESS = '2026-08-01';   // vintage of the 6th cycle progress file this site carries
const zillowPointAvailable = year => `${year}-08-20`;   // a 31 July value, published weeks later

const COUNTIES = ['Alameda', 'Contra Costa', 'Marin', 'Napa', 'San Francisco', 'San Mateo',
                  'Santa Clara', 'Solano', 'Sonoma'];
const cityMeta = new Map(municipalities.cities.map(c => [c.key, c]));
const countyOf = key => cityMeta.get(key)?.county || REGIONAL_CITIES[key]?.county || '';
const labelOf = key => cityMeta.get(key)?.label || REGIONAL_CITIES[key]?.label || key;
const citiesInCounty = county => municipalities.cities.filter(c => c.county === county);

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthName = id => { const [y, m] = id.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };
const endOfMonth = id => { const [y, m] = id.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
// Issues go out somewhere in the last week, not mechanically on the 31st. The day is drawn from
// the month's own characters, so it is stable: rebuilding never moves a published issue.
function issueDay(id) {
  const [y, m] = id.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 100003;
  const day = 23 + (seed % 8);                       // 23rd to 30th
  return `${id}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
const fmtDate = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const were = n => n === 1 ? 'was' : 'were';
const money = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString('en-US')}`;

// ---------------------------------------------------------------- the record, with dates attached
const newsItems = NEWS_ARTICLES
  .filter(a => a.date && a.url && a.title)
  .map(a => ({
    kind: 'news', city: a.city, county: countyOf(a.city), topic: a.topic || 'developments',
    title: a.title, snippet: a.snippet || '', source: a.source || 'Official source',
    url: a.url, date: a.date, available: a.date, image: a.image || '',
  }))
  .filter(a => a.county);

// Curated city project records: the city published these on the date they carry.
const curated = Object.entries(REGIONAL_CITIES).flatMap(([key, c]) => (c.data || [])
  .filter(p => p.lastDate)
  .map(p => ({
    kind: 'project', city: key, county: c.county, topic: p.type === 'Transportation' ? 'transportation' : 'housing',
    title: p.addr, snippet: p.lastNote || p.desc || '', source: 'City record', url: p.sourceUrl || c.planning,
    date: p.lastDate, available: p.lastDate, units: p.units || 0, stage: p.stage, type: p.type,
  })));

// HCD annual report rows: dated by the event, available only once that year's report was published.
const aprRecords = Object.entries(housing.cities).flatMap(([key, rows]) => rows
  .filter(p => p.lastDate || p.filed)
  .map(p => ({
    kind: 'apr', city: key, county: countyOf(key), topic: 'housing',
    title: p.addr, snippet: p.lastNote || p.desc || '', source: p.sourceLabel || 'HCD APR Table A2',
    url: p.sourceUrl, date: p.lastDate || p.filed, reportYear: p.reportYear,
    available: APR_PUBLISHED[p.reportYear] || null, units: p.units || 0, bmr: p.bmr,
    stage: p.stage, reportedStatus: p.reportedStatus,
  })))
  .filter(p => p.county && p.available);

const aprActivity = Object.entries(housing.activity || {}).map(([key, a]) => ({
  city: key, county: countyOf(key), ...a, available: APR_PUBLISHED[a.year] || null,
})).filter(a => a.county && a.available);

// A seven-character date means the source gives a month and not a day; it becomes available at the
// end of that month and is shown as the month.
const researchItems = research.items.map(item => ({
  kind: 'research', scope: item.scope, city: item.city || '', county: item.county || '',
  topic: item.topic, title: item.title, snippet: item.summary, source: item.outlet,
  url: item.url, date: item.date.length === 7 ? endOfMonth(item.date) : item.date,
  monthOnly: item.date.length === 7, verified: item.verified,
  available: item.date.length === 7 ? endOfMonth(item.date) : item.date,
}));

// ---------------------------------------------------------------- statistics as they stood
function zillowAt(key, asOf, field) {
  const series = CITY_STATS[key]?.[field === 'value' ? 'homeValueSeries' : 'rentSeries'] || [];
  const known = series.filter(p => zillowPointAvailable(p.year) <= asOf);
  return known.length ? { year: known[known.length - 1].year, value: known[known.length - 1].value } : null;
}
function countyMarket(county, asOf, field) {
  const points = citiesInCounty(county).map(c => zillowAt(c.key, asOf, field)).filter(Boolean);
  if (points.length < 3) return null;
  const values = points.map(p => p.value).sort((a, b) => a - b);
  return { median: values[Math.floor(values.length / 2)], cities: points.length, year: points[0].year };
}
function bayMarket(asOf, field) {
  const points = municipalities.cities.map(c => zillowAt(c.key, asOf, field)).filter(Boolean);
  if (!points.length) return null;
  const values = points.map(p => p.value).sort((a, b) => a - b);
  return { median: values[Math.floor(values.length / 2)], cities: points.length, year: points[0].year };
}

// ---------------------------------------------------------------- composing one issue
// A newsletter is not only what landed this month. Anything published before the issue is fair
// game as context - it was on the record and a reader could have gone and read it - so each issue
// also carries the year behind it and the projects still sitting in the pipeline.
function trailingYear(asOf) {
  const from = new Date(asOf + 'T00:00:00Z');
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  return from.toISOString().slice(0, 10);
}

function issueFor(monthId, number, previousIssueDate) {
  const asOf = issueDay(monthId);
  // An issue covers the ground since the last one went out, the way a newsletter actually does -
  // so the last days of a month land in the next issue rather than falling down the gap between
  // a mid-month dateline and the calendar.
  const from = previousIssueDate || `${monthId}-01`;
  const since = trailingYear(asOf);
  const published = r => r.available && r.available <= asOf;
  const inWindow = r => published(r) && r.date > since && r.date <= asOf;
  const inMonth = r => r.date > from && r.date <= asOf && r.available <= asOf;
  // Records whose own month has passed but which only became public this month - the annual
  // reports arrive in one wave, and that wave is itself the month's news.
  const arrivedThisMonth = r => r.available && r.available > from && r.available <= asOf && !(r.date > from && r.date <= asOf);

  const news = newsItems.filter(inMonth).sort((a, b) => a.date.localeCompare(b.date));
  const projects = curated.filter(inMonth);
  const aprNew = aprRecords.filter(arrivedThisMonth);
  const aprInMonth = aprRecords.filter(inMonth);
  const releases = aprActivity.filter(a => a.available > from && a.available <= asOf);

  const regional = researchItems.filter(inMonth).sort((a, b) => a.date.localeCompare(b.date));
  // Threads that have not finished: a law signed in October still governs what happens in March.
  const threads = researchItems
    .filter(r => published(r) && r.date <= from)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const yearNews = newsItems.filter(inWindow);
  const yearProjects = [...curated, ...aprRecords].filter(inWindow);
  // Everything a city had published before this issue and not reported as finished.
  const pipeline = [...curated, ...aprRecords]
    .filter(r => published(r) && r.date <= asOf && r.units && r.stage !== 'completed')
    .sort((a, b) => b.units - a.units);

  const sections = [];
  const sources = new Map();
  const remember = item => { if (item.url && !sources.has(item.url)) sources.set(item.url, { label: item.source, url: item.url, date: item.date }); };
  [...regional, ...threads, ...news, ...projects, ...aprNew.slice(0, 40), ...aprInMonth.slice(0, 40)].forEach(remember);

  // Every picture chosen anywhere in this issue - the lead, each topic section, each county -
  // goes in here the moment it's picked, so a later section's "first story with an image" search
  // never lands on a photo the reader already saw higher up the same issue.
  const usedImages = new Set();
  const pickImage = url => Boolean(url) && !usedImages.has(url);
  const claimImage = url => { if (url) usedImages.add(url); return url; };

  // ---- the lead: the month's biggest regional decision, or failing that its biggest local story
  // What leads: a decision above the cities if there was one, otherwise the local story that most
  // reads like news - something was decided, it is described at length, and it carries a picture.
  const DECISION = /\b(approv|adopt|pass(?:es|ed)?|vote[ds]?|reject|certif|sign(?:s|ed)?|break ground|entitl|rezon|permit|commission|council)/i;
  const leadScore = n => (DECISION.test(n.title) ? 3 : 0) + (n.image ? 2 : 0) + Math.min(3, (n.snippet || '').length / 120)
    + (n.topic === 'housing' || n.topic === 'developments' ? 1 : 0);
  const leadSource = regional[0] || [...news].sort((a, b) => leadScore(b) - leadScore(a))[0] || news[0];
  const leadNews = news.find(n => pickImage(n.image)) || null;
  const leadOwnImage = leadSource.kind === 'news' && pickImage(leadSource.image);
  const lead = leadSource ? {
    title: leadSource.title, source: leadSource.source, url: leadSource.url,
    date: leadSource.date, monthOnly: Boolean(leadSource.monthOnly),
    summary: leadSource.snippet, scope: leadSource.scope || (leadSource.city ? 'city' : 'region'),
    city: leadSource.city ? labelOf(leadSource.city) : '', verified: leadSource.verified || '',
    image: claimImage(leadOwnImage ? leadSource.image : (leadNews ? leadNews.image : '')),
    imageCredit: leadOwnImage ? leadSource.source : (leadNews ? leadNews.source : ''),
  } : null;

  // ---- the photograph at the top: the place the month was mostly about
  const focusCity = [...news, ...projects].reduce((tally, r) => tally.set(r.city, (tally.get(r.city) || 0) + 1), new Map());
  const focusKey = [...focusCity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const photo = photos[focusKey] || photos.sanfrancisco;
  const hero = photo ? { url: photo.url, caption: photo.cap, by: photo.by, licence: photo.lic,
                         source: photo.source, city: labelOf(focusKey || 'sanfrancisco') } : null;

  // ---- writing helpers -------------------------------------------------------------------
  // Paragraphs are spans rather than HTML strings, so a link can sit inside a sentence without the
  // generator ever emitting markup. Spans marked q carry a publisher's own words; everything else
  // is written here, and the tests hold that written text to the house style.
  const t = v => (v ? { t: 'text', v } : null);
  const qt = v => (v ? { t: 'text', v, q: true } : null);
  const link = (v, url) => (url ? { t: 'link', v, url } : t(v));
  const para = (...spans) => { const list = spans.flat(Infinity).filter(x => x && x.t); return list.length ? { kind: 'para', spans: list } : null; };
  const image = (url, caption, credit) => (url ? { kind: 'image', url, caption, credit } : null);
  const blocksOf = (...items) => items.flat().filter(Boolean);
  const when = r => (r.monthOnly ? monthName(r.date.slice(0, 7)) : fmtDate(r.date));
  const cited = r => [t(' ('), link(r.source, r.url), t(`, ${when(r)}.)`)];
  const list = values => values.length <= 1 ? (values[0] || '')
    : values.length === 2 ? `${values[0]} and ${values[1]}`
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
  const pct = (now, before) => `${Math.abs(((now / before) - 1) * 100).toFixed(1)}%`;
  // Publishers' summaries often arrive already clipped, sometimes mid-word. Cut back to the last
  // finished sentence; if there isn't one, end on a whole word.
  const trim = (text, max = 320) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const cut = clean.length > max ? clean.slice(0, max) : clean;
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('." '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (stop > 60) return cut.slice(0, stop + 1);
    if (clean.length > max) return '';
    if (/[.!?"]$/.test(cut)) return cut;
    return cut.replace(/\s+\S*$/, '') + '...';
  };
  // Stories are gathered into one paragraph rather than one paragraph each, so a section reads as
  // a few substantial blocks.
  const storyRun = (items, opener) => para(
    opener ? t(opener + ' ') : null,
    ...items.flatMap((n, i) => [
      t(`${['In', 'Over in', 'Also in', 'And in'][i % 4]} ${labelOf(n.city)}, `),
      link(String(n.title).replace(/\.$/, ''), n.url), t('. '),
      trim(n.snippet, 260) ? qt(`${trim(n.snippet, 260)} `) : null,
      t(`(${n.source}, ${fmtDate(n.date)}.)${i < items.length - 1 ? ' ' : ''}`),
    ]),
  );
  // Fold spans onto the end of the previous paragraph, so a section holds a few thick blocks
  // instead of many thin ones.
  const append = (blocks, spans) => {
    const last = blocks[blocks.length - 1];
    const extra = [spans].flat(Infinity).filter(x => x && x.t);
    if (!extra.length) return;
    if (last && last.kind === 'para') blocks[blocks.length - 1] = { kind: 'para', spans: [...last.spans, ...extra] };
    else blocks.push({ kind: 'para', spans: extra });
  };
  // A sentence should not open on a numeral.
  const WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const opens = (n, singular, plural_) => `${n < 10 ? WORDS[n] : n.toLocaleString('en-US')} ${n === 1 ? singular : plural_}`;

  // ---- the lede
  const topics = k => news.filter(n => n.topic === k).length;
  const marketNow = bayMarket(asOf, 'value');
  const bayRent = bayMarket(asOf, 'rent');
  const totalPublic = news.length + projects.length + aprNew.length + regional.length;
  const housingCount = topics('housing') + topics('developments') + projects.filter(p => p.topic === 'housing').length;
  const silent = COUNTIES.filter(c => ![...news, ...projects, ...aprNew].some(r => r.county === c));

  const lede = blocksOf(
    para(
      // The opening word carries a drop cap on the page, so the sentence starts on the month
      // instead of a two-digit number the browser would split in half.
      t(`${monthName(monthId)} brought ${plural(totalPublic, 'item', 'items')} onto the public record across the nine counties`),
      housingCount ? t(`, ${housingCount} of them about housing or development`) : null,
      aprNew.length ? t(`, along with ${aprNew.length.toLocaleString('en-US')} records released with the state annual reports`) : null,
      t('. '),
      lead ? [t(lead.scope === 'state' ? 'The largest of them came from Sacramento. ' : lead.scope === 'region' ? 'The largest of them was regional. ' : `The largest of them was local, in ${lead.city}. `),
              link(lead.title.replace(/\.$/, ''), lead.url), cited({ source: lead.source, url: lead.url, date: lead.date, monthOnly: lead.monthOnly })] : null,
    ),
  );
  if (marketNow) append(lede, [
    t(` Zillow publishes an index for ${marketNow.cities} of the region's ${municipalities.cities.length} cities and towns. The median typical home among them is ${money(marketNow.median)} in the ${marketNow.year} reading`),
    bayRent ? t(`, and the median asking rent ${money(bayRent.median)}`) : null,
    t('.'),
  ]);

  // =================================================================== 1. what happened
  const briefBlocks = [];
  if (regional.length) {
    const first = regional[0];
    briefBlocks.push(para(
      t(`${opens(regional.length, 'decision', 'decisions')} this period ${were(regional.length)} taken above the level of any single city. `),
      link(first.title.replace(/\.$/, ''), first.url), t('. '), qt(trim(first.snippet)), cited(first),
    ));
    if (regional.length > 1) briefBlocks.push(para(...regional.slice(1).flatMap((r, i) => [
      link(r.title.replace(/\.$/, ''), r.url), t('. '), qt(trim(r.snippet)), cited(r), t(i < regional.length - 2 ? ' ' : ''),
    ])));
  }
  if (releases.length) {
    const totals = releases.reduce((a, r) => ({ permitted: a.permitted + (r.permitted || 0), completed: a.completed + (r.completed || 0), entitled: a.entitled + (r.entitled || 0) }), { permitted: 0, completed: 0, entitled: 0 });
    const top = [...releases].sort((a, b) => (b.permitted || 0) - (a.permitted || 0)).slice(0, 3);
    briefBlocks.push(para(
      t(`California's Department of Housing and Community Development published the ${releases[0].year} annual progress reports this period. Across ${plural(releases.length, 'jurisdiction', 'jurisdictions')} in the nine counties the filings report ${totals.permitted.toLocaleString('en-US')} homes permitted, ${totals.entitled.toLocaleString('en-US')} entitled and ${totals.completed.toLocaleString('en-US')} completed in that reporting year. ${list(top.map(r => `${labelOf(r.city)} reported ${(r.permitted || 0).toLocaleString('en-US')} permits`))}. Cities compile these figures themselves once a year, and a permit records permission to build.`),
    ));
  }
  const busiest = COUNTIES.map(c => ({ c, n: [...news, ...projects, ...aprNew].filter(r => r.county === c).length })).sort((a, b) => b.n - a.n).filter(r => r.n);
  const geography = busiest.length ? [
    t(`${busiest[0].c} County produced ${plural(busiest[0].n, 'item', 'items')} this period, more than anywhere else`),
    busiest[1] ? t(`, with ${busiest[1].c} next at ${busiest[1].n}`) : null,
    t('. '),
    silent.length ? t(`${list(silent)} published nothing in the same window. `) : t('Every county published something. '),
  ] : null;

  const told = new Set();
  if (threads.length) {
    briefBlocks.push(para(t(`${opens(threads.length, 'earlier decision is', 'earlier decisions are')} still setting what cities can do. `), ...threads.flatMap((r, i) => {
      told.add(r.url);
      return [link(r.title.replace(/\.$/, ''), r.url), t(', '), t(when(r)), t('. '), qt(trim(r.snippet)), t(` (${r.source}.)${i < threads.length - 1 ? ' ' : ''}`)];
    })));
  }
  const boardItems = news.filter(n => /commission|council|board|hearing|meeting|agenda|vote|approv/i.test(n.title + ' ' + n.snippet));
  briefBlocks.push(para(
    geography || null,
    t(`Land use in all ${municipalities.cities.length} of these jurisdictions is decided in public, by a planning commission and then a city or town council, on an agenda posted days beforehand at a meeting where anyone may speak.`),
    boardItems.length ? t(`${opens(boardItems.length, 'item', 'items')} this period turned on that kind of meeting, including `) : null,
    ...(boardItems.length ? boardItems.slice(0, 3).flatMap((n, i, arr) => [link(n.title.replace(/\.$/, ''), n.url), t(` in ${labelOf(n.city)}${i === arr.length - 1 ? '.' : ', '}`)]) : []),
  ));
  if (briefBlocks.length) sections.push({ kind: 'overview', title: 'Overview', blocks: briefBlocks });

  // =================================================================== 2. housing and development
  const housingStats = [];
  const housingBlocks = [];
  if (marketNow) {
    const priorValues = municipalities.cities.map(c => (CITY_STATS[c.key]?.homeValueSeries || []).find(pt => Number(pt.year) === Number(marketNow.year) - 1)?.value).filter(Boolean).sort((a, b) => a - b);
    const prior = priorValues.length ? priorValues[Math.floor(priorValues.length / 2)] : null;
    const ranked = municipalities.cities.map(c => ({ label: c.label, v: zillowAt(c.key, asOf, 'value')?.value })).filter(r => r.v).sort((a, b) => b.v - a.v);
    housingBlocks.push(para(
      t(`The median typical home across the tracked cities was ${money(marketNow.median)} in the ${marketNow.year} index`),
      prior ? t(`, ${pct(marketNow.median, prior)} ${marketNow.median >= prior ? 'above' : 'below'} the same reading a year earlier`) : null,
      t(`. The range behind that median is wide: ${ranked[0].label} at ${money(ranked[0].v)} and ${ranked[ranked.length - 1].label} at ${money(ranked[ranked.length - 1].v)}, a difference of ${(ranked[0].v / ranked[ranked.length - 1].v).toFixed(1)} times between two cities about an hour apart.`),
    ));
    housingStats.push({ label: 'Median typical home, tracked cities', value: money(marketNow.median), vintage: `Zillow ZHVI, ${marketNow.year}`, source: 'https://www.zillow.com/research/data/' });
    if (bayRent) housingStats.push({ label: 'Median asking rent', value: money(bayRent.median), vintage: `Zillow ZORI, ${bayRent.year}`, source: 'https://www.zillow.com/research/data/' });
  }
  if (pipeline.length) {
    const units = pipeline.reduce((a, p) => a + p.units, 0);
    const STAGE_WORDS = { proposed: 'proposed', review: 'under review', approved: 'approved', construction: 'under construction' };
    const stages = Object.keys(STAGE_WORDS).map(st => ({ st: STAGE_WORDS[st], n: pipeline.filter(p => p.stage === st).length })).filter(r => r.n);
    const biggestOpen = pipeline[0];
    append(housingBlocks, para(
      t(` Published records that are not yet reported as finished add up to ${plural(pipeline.length, 'development', 'developments')} carrying ${units.toLocaleString('en-US')} reported homes`),
      stages.length ? t(`: ${list(stages.map(r => `${r.n.toLocaleString('en-US')} ${r.st}`))}`) : null,
      t('. The largest is '), link(biggestOpen.title, biggestOpen.url), t(` in ${labelOf(biggestOpen.city)} at ${plural(biggestOpen.units, 'home', 'homes')}, so a single master plan can account for much of a county's total.`),
    ).spans);
    housingStats.push({ label: 'Homes in unfinished published developments', value: units.toLocaleString('en-US'), vintage: `${pipeline.length.toLocaleString('en-US')} records to ${fmtDate(asOf)}`, source: 'https://data.ca.gov/dataset/housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year' });
  }
  if (asOf >= RHNA_PROGRESS) {
    const rows = Object.entries(RHNA).filter(([, r]) => r.target);
    const target = rows.reduce((a, [, r]) => a + r.target, 0), built = rows.reduce((a, [, r]) => a + r.units, 0);
    const sorted = rows.map(([k, r]) => ({ k, pct: r.pct })).sort((a, b) => a.pct - b.pct);
    housingBlocks.push(para(
      t(`The ${rows.length} cities with a published 6th cycle progress row have permitted ${built.toLocaleString('en-US')} of ${target.toLocaleString('en-US')} allocated homes, ${((built / target) * 100).toFixed(1)}% of a cycle that ends in 2031. ${labelOf(sorted[sorted.length - 1].k)} is furthest along at ${sorted[sorted.length - 1].pct}%, and ${labelOf(sorted[0].k)} is lowest at ${sorted[0].pct}%.`),
    ));
    housingStats.push({ label: '6th cycle homes permitted', value: `${built.toLocaleString('en-US')} of ${target.toLocaleString('en-US')}`, vintage: 'HCD RHNA progress, August 2026', source: 'https://data.ca.gov/dataset/rhna-progress-report' });
  }
  const housingNews = news.filter(n => n.topic === 'housing');
  if (housingNews.length) {
    const featured = housingNews.slice(0, 4);
    const withImage = featured.find(n => pickImage(n.image)) || housingNews.find(n => pickImage(n.image));
    featured.forEach(n => told.add(n.url));
    housingBlocks.push(storyRun(featured.slice(0, 2), `${opens(housingNews.length, 'housing story', 'housing stories')} came out of the cities themselves${housingNews.length > featured.length ? `, and ${featured.length} of them are set out here` : ''}.`));
    if (featured.length > 2) housingBlocks.push(storyRun(featured.slice(2)));
    if (withImage) housingBlocks.push(image(claimImage(withImage.image), `${labelOf(withImage.city)}: ${withImage.title}`, withImage.source));
  }
  if (!housingBlocks.length) housingBlocks.push(para(t(`No housing record was published between ${fmtDate(from)} and ${fmtDate(asOf)}.`)));
  sections.push({ kind: 'housing', title: 'Housing', blocks: housingBlocks, stats: housingStats, chart: 'market' });

  // =================================================================== developments
  const devBlocks = [];
  const devRecords = [...aprNew, ...aprInMonth].filter(p => p.units).sort((a, b) => b.units - a.units).slice(0, 5)
    .map(p => ({ city: labelOf(p.city), county: p.county, title: p.title, units: p.units, bmr: p.bmr, status: p.reportedStatus || p.stage, date: p.date, source: p.source, url: p.url }));
  const devNews = news.filter(n => n.topic === 'developments');
  if (devRecords.length) {
    const biggest = devRecords[0];
    devBlocks.push(para(
      t(`The largest development on the record this period is `), link(biggest.title, biggest.url),
      t(` in ${biggest.city}, ${plural(biggest.units, 'home', 'homes')} at the ${String(biggest.status).toLowerCase()} stage`),
      biggest.bmr ? t(`, ${biggest.bmr.toLocaleString('en-US')} of them affordable`) : null,
      t('. The five largest are listed below. A reported milestone is one step in a long process, such as an application, an entitlement, a permit or a completion, and the unit count can describe a single phase of a larger plan.'),
    ));
  }
  if (devNews.length) {
    const featured = devNews.slice(0, 3);
    featured.forEach(n => told.add(n.url));
    devBlocks.push(storyRun(featured, `${opens(devNews.length, 'development story', 'development stories')} came out of the cities this period.`));
    const img = devNews.find(n => pickImage(n.image));
    if (img) devBlocks.push(image(claimImage(img.image), `${labelOf(img.city)}: ${img.title}`, img.source));
  }
  if (!devBlocks.length) devBlocks.push(para(t(`No commercial or mixed-use development record was published between ${fmtDate(from)} and ${fmtDate(asOf)}.`)));
  sections.push({ kind: 'developments', title: 'Developments', blocks: devBlocks, records: devRecords });

  // =================================================================== 3. transportation
  const transitStats = [];
  const transitBlocks = [];
  const transitResearch = [...regional, ...threads].filter(r => r.topic === 'transportation');
  const transitNews = [...news.filter(n => n.topic === 'transportation'), ...projects.filter(p => p.topic === 'transportation')];
  const freshTransit = transitResearch.filter(r => !told.has(r.url));
  if (freshTransit.length) {
    freshTransit.forEach((r, i) => {
      told.add(r.url);
      transitBlocks.push(para(t(i === 0 ? 'The main transport item this period was ' : ''), link(r.title.replace(/\.$/, ''), r.url), t('. '), qt(trim(r.snippet)), cited(r)));
    });
  } else if (transitResearch.length) {
    transitBlocks.push(para(t('The funding decision described above, '), link(transitResearch[0].title.replace(/\.$/, ''), transitResearch[0].url), t(', remains the backdrop to local transport work.')));
  }
  if (asOf >= ACS_2020_2024) {
    const commutes = municipalities.cities.map(c => ({ label: c.label, v: CITY_STATS[c.key]?.meanCommuteMin })).filter(r => r.v).sort((a, b) => a.v - b.v);
    const shares = municipalities.cities.map(c => ({ label: c.label, v: CITY_STATS[c.key]?.transitSharePct })).filter(r => r.v).sort((a, b) => b.v - a.v);
    if (commutes.length) {
      const median = commutes[Math.floor(commutes.length / 2)];
      append(transitBlocks, para(
        t(` Census figures put the median one-way commute across these cities at ${median.v.toFixed(1)} minutes, ranging from ${commutes[0].v.toFixed(1)} in ${commutes[0].label} to ${commutes[commutes.length - 1].v.toFixed(1)} in ${commutes[commutes.length - 1].label}`),
        shares.length ? t(`. The share of workers commuting by public transport peaks at ${shares[0].v.toFixed(1)}% in ${shares[0].label} and falls close to zero in the outer suburbs`) : null,
        t('. These are five-year averages and they lag.'),
      ).spans);
      transitStats.push({ label: 'Median one-way commute', value: `${median.v.toFixed(1)} min`, vintage: '2020–2024 ACS', source: 'https://www.census.gov/programs-surveys/acs' });
      if (shares.length) transitStats.push({ label: 'Highest transit share', value: `${shares[0].v.toFixed(1)}%`, vintage: `${shares[0].label}, 2020–2024 ACS`, source: 'https://www.census.gov/programs-surveys/acs' });
    }
  }
  if (transitNews.length) {
    const featured = transitNews.slice(0, 3);
    featured.forEach(n => told.add(n.url));
    transitBlocks.push(storyRun(featured, `${opens(transitNews.length, 'transport item', 'transport items')} came out of the cities this period.`));
    const img = transitNews.find(n => pickImage(n.image));
    if (img) transitBlocks.push(image(claimImage(img.image), `${labelOf(img.city)}: ${img.title}`, img.source));
  }
  if (!transitBlocks.length) transitBlocks.push(para(t('No transport decision was published this period. The commute figures below come from the census and change slowly.')));
  sections.push({ kind: 'transport', title: 'Transportation', blocks: transitBlocks, stats: transitStats });

  // =================================================================== 4. county by county
  for (const county of COUNTIES) {
    const cNews = news.filter(n => n.county === county);
    const cProjects = projects.filter(p => p.county === county);
    const cApr = aprNew.filter(p => p.county === county).sort((a, b) => b.units - a.units);
    const cReleases = releases.filter(r => r.county === county);
    const market = countyMarket(county, asOf, 'value');
    const rent = countyMarket(county, asOf, 'rent');
    const tracked = citiesInCounty(county).length;
    const yearHere = yearNews.filter(n => n.county === county).length;
    const pipeHere = pipeline.filter(p => p.county === county);
    const rhnaHere = citiesInCounty(county).map(c => RHNA[c.key]).filter(Boolean);
    const items = [...cNews, ...cProjects];
    const blocks = [];

    blocks.push(para(
      t(`${county} County has ${plural(tracked, 'jurisdiction', 'jurisdictions')} in the region's register`),
      market ? t(`, where the median typical home is ${money(market.median)}${rent ? ` and the median asking rent ${money(rent.median)}` : ''}`) : null,
      yearHere ? t(`. ${plural(yearHere, 'published report has', 'published reports have')} come out of it in the last twelve months`) : t('. Nothing has been published out of it in the last twelve months'),
      rhnaHere.length ? t(`, and ${rhnaHere.length === 1 ? 'one of its cities carries' : `${rhnaHere.length} of its cities carry`} a 6th cycle allocation totalling ${rhnaHere.reduce((a, r) => a + r.target, 0).toLocaleString('en-US')} homes${asOf >= RHNA_PROGRESS ? `, ${rhnaHere.reduce((a, r) => a + r.units, 0).toLocaleString('en-US')} of them permitted so far` : ''}`) : null,
      t('.'),
    ));
    if (cReleases.length) {
      const tot = cReleases.reduce((a, r) => ({ p: a.p + (r.permitted || 0), c: a.c + (r.completed || 0) }), { p: 0, c: 0 });
      blocks[0] = para(blocks[0].spans, [
        t(` In their ${cReleases[0].year} filings its cities reported ${tot.p.toLocaleString('en-US')} homes permitted and ${tot.c.toLocaleString('en-US')} completed.`),
        cApr.length ? t(` The largest records to surface with them were ${list(cApr.slice(0, 2).map(p => `${p.title} in ${labelOf(p.city)} at ${plural(p.units, 'home', 'homes')}, ${p.reportedStatus || p.stage}`))}.`) : null,
      ]);
    }
    if (items.length) {
      blocks.push(storyRun(items.slice(0, 4)));
      const img = items.find(r => pickImage(r.image));
      if (img) blocks.push(image(claimImage(img.image), `${labelOf(img.city)}: ${img.title}`, img.source));
    }
    if (pipeHere.length) {
      const pipeSpans = [t(` ${opens(pipeHere.length, 'published development', 'published developments')} in the county ${were(pipeHere.length)} on the books and unfinished, carrying ${pipeHere.reduce((a, p) => a + p.units, 0).toLocaleString('en-US')} reported homes between them. The largest is `), link(pipeHere[0].title, pipeHere[0].url), t(` in ${labelOf(pipeHere[0].city)} at ${plural(pipeHere[0].units, 'home', 'homes')}.`)];
      blocks[0] = para(blocks[0].spans, pipeSpans);
    }
    const quiet = !items.length && !cApr.length && !cReleases.length;
    if (quiet) append(blocks, t(` Nothing was published out of ${county} County between ${fmtDate(from)} and ${fmtDate(asOf)}.`));
    sections.push({ kind: 'county', county, tracked, quiet, count: items.length, blocks });
  }

  // =================================================================== 5. cities in focus
  const cityTally = new Map();
  [...yearNews, ...yearProjects].forEach(r => cityTally.set(r.city, (cityTally.get(r.city) || 0) + 1));
  const spotlights = [...cityTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => {
    const value = zillowAt(key, asOf, 'value'), rentNow = zillowAt(key, asOf, 'rent');
    const rhna = RHNA[key];
    const local = pipeline.filter(p => p.city === key);
    const latest = [...yearNews].filter(x => x.city === key).sort((a, b) => b.date.localeCompare(a.date))[0];
    const sentences = [`${labelOf(key)} has appeared in the record ${plural(n, 'time', 'times')} over the past year.`];
    if (value) sentences.push(`A typical home there is ${money(value.value)}${rentNow ? `, and a typical asking rent ${money(rentNow.value)}` : ''}${CITY_STATS[key]?.population && asOf >= ACS_2020_2024 ? `, among ${CITY_STATS[key].population.toLocaleString('en-US')} residents` : ''}.`);
    if (rhna) sentences.push(`Its 6th cycle allocation is ${rhna.target.toLocaleString('en-US')} homes${asOf >= RHNA_PROGRESS ? `, ${rhna.pct}% of it permitted so far` : ''}.`);
    if (local.length) sentences.push(`${plural(local.length, 'development is', 'developments are')} on its books unfinished, led by ${local[0].title} at ${plural(local[0].units, 'home', 'homes')}.`);
    return { city: labelOf(key), county: countyOf(key), mentions: n, text: sentences.join(' '),
      photo: photos[key] ? { url: photos[key].url, by: photos[key].by, licence: photos[key].lic, caption: photos[key].cap } : null,
      latest: latest ? { title: latest.title, date: latest.date, source: latest.source, url: latest.url } : null };
  });
  if (spotlights.length) sections.push({ kind: 'spotlight', title: 'Three cities this period', spotlights });

  // =================================================================== 7. what to watch
  const watch = [];
  const [yearNum, monthNum] = monthId.split('-').map(Number);
  const nextApril = `${monthNum >= 4 ? yearNum + 1 : yearNum}-04-01`;
  watch.push({ when: fmtDate(nextApril), what: `Cities file their ${monthNum >= 4 ? yearNum : yearNum - 1} housing annual reports with HCD. Table A2 of those filings is the state's public account of what each city approved, and it reaches data.ca.gov in the months after.` });
  if (asOf >= '2025-10-10' && asOf < '2026-07-01') watch.push({ when: 'July 1, 2026', what: 'SB 79 upzoning takes effect near major transit stops in Alameda, Contra Costa, San Francisco, San Mateo and Santa Clara counties. A city can conform its zoning, exclude parcels, or adopt an alternative transit-oriented plan first; a city that does neither gets the state standards by default.' });
  if (asOf >= '2025-10-13' && asOf < '2026-11-03') watch.push({ when: 'November 3, 2026', what: `Voters in the five SB 63 counties decide the regional transit sales tax: a half cent, a full cent in San Francisco, about $980 million a year for 14 years${asOf >= '2026-05-26' ? '. It qualified by citizens\' initiative in May, so it needs a simple majority' : ''}.` });
  if (monthId === '2026-03' && asOf < '2026-03-25') watch.push({ when: 'March 19 and 25, 2026', what: 'ABAG and MTC vote on adopting the final Plan Bay Area 2050+, the long-range plan local housing and transport decisions are measured against.' });
  if (asOf < ACS_2020_2024) watch.push({ when: 'December 2025', what: 'The Census Bureau releases the 2020-2024 American Community Survey five-year estimates, which refresh commute, income and tenure figures for every city here.' });
  const nextZillow = municipalities.cities.flatMap(c => (CITY_STATS[c.key]?.homeValueSeries || []).map(pt => pt.year)).filter(y => zillowPointAvailable(y) > asOf).sort()[0];
  if (nextZillow) watch.push({ when: `August ${nextZillow}`, what: `Zillow publishes its ${nextZillow} index, the next comparable annual reading of values and rents in these cities.` });
  sections.push({ kind: 'watch', title: 'What to look for', blocks: [], watch });

  // ---- charts the issue can honestly draw
  const marketYears = [...new Set(municipalities.cities.flatMap(c => (CITY_STATS[c.key]?.homeValueSeries || []).map(pt => pt.year)))]
    .filter(y => zillowPointAvailable(y) <= asOf).sort();
  const marketSeries = marketYears.map(year => {
    const values = municipalities.cities.map(c => (CITY_STATS[c.key]?.homeValueSeries || []).find(pt => pt.year === year)?.value).filter(Boolean).sort((a, b) => a - b);
    const rents = municipalities.cities.map(c => (CITY_STATS[c.key]?.rentSeries || []).find(pt => pt.year === year)?.value).filter(Boolean).sort((a, b) => a - b);
    return { year, value: values[Math.floor(values.length / 2)] || null, rent: rents.length ? rents[Math.floor(rents.length / 2)] : null };
  }).filter(pt => pt.value);
  const countyBars = COUNTIES.map(county => ({ county,
    items: [...news, ...projects].filter(r => r.county === county).length,
    homes: pipeline.filter(p => p.county === county).reduce((a, p) => a + p.units, 0) }));

  return {
    id: monthId, number, month: monthName(monthId), date: asOf, dateline: fmtDate(asOf),
    hero, lead, lede, sections,
    charts: { market: marketSeries, counties: countyBars },
    counts: { news: news.length, projects: projects.length, aprReleased: aprNew.length, regional: regional.length, sources: sources.size },
    sources: [...sources.values()].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
  };
}

// ---------------------------------------------------------------- run
const START = '2025-04';   // eighteen issues, back to the spring of 2025
const END = '2026-09';
const months = [];
for (let [y, m] = START.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= END;) {
  months.push(`${y}-${String(m).padStart(2, '0')}`);
  if (++m > 12) { m = 1; y++; }
}
const today = new Date().toISOString().slice(0, 10);
let previous = null;
const issues = months.map((id, i) => { const issue = issueFor(id, i + 1, previous); previous = issue.date; return issue; })
  // An issue whose dateline has not arrived has not been sent, so it is not in the archive.
  .filter(issue => issue.date <= today)
  .reverse();   // newest first
writeFileSync(new URL('public/data/newsletter.json', ROOT), JSON.stringify({
  generated: new Date().toISOString(),
  method: 'Each issue contains only material that had been published by the last day of its month. Sources carry their own availability dates: news by publication, city records by the date the city posted them, HCD annual report rows by the release of that reporting year, Zillow by the month it published, ACS by its December release, RHNA progress by its August 2026 vintage.',
  issues,
}, null, 1));
console.log(`${issues.length} issues, ${issues[0].month} back to ${issues[issues.length - 1].month}`);
issues.slice().reverse().forEach(i => console.log(` ${i.id}  news ${String(i.counts.news).padStart(3)}  city records ${String(i.counts.projects).padStart(2)}  APR released ${String(i.counts.aprReleased).padStart(4)}  sources ${i.counts.sources}`));
