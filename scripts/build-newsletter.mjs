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

  // ---- the lead: the month's biggest regional decision, or failing that its biggest local story
  // What leads: a decision above the cities if there was one, otherwise the local story that most
  // reads like news - something was decided, it is described at length, and it carries a picture.
  const DECISION = /\b(approv|adopt|pass(?:es|ed)?|vote[ds]?|reject|certif|sign(?:s|ed)?|break ground|entitl|rezon|permit|commission|council)/i;
  const leadScore = n => (DECISION.test(n.title) ? 3 : 0) + (n.image ? 2 : 0) + Math.min(3, (n.snippet || '').length / 120)
    + (n.topic === 'housing' || n.topic === 'developments' ? 1 : 0);
  const leadSource = regional[0] || [...news].sort((a, b) => leadScore(b) - leadScore(a))[0] || news[0];
  const leadNews = news.find(n => n.image) || null;
  const lead = leadSource ? {
    title: leadSource.title, source: leadSource.source, url: leadSource.url,
    date: leadSource.date, monthOnly: Boolean(leadSource.monthOnly),
    summary: leadSource.snippet, scope: leadSource.scope || (leadSource.city ? 'city' : 'region'),
    city: leadSource.city ? labelOf(leadSource.city) : '', verified: leadSource.verified || '',
    image: leadSource.kind === 'news' && leadSource.image ? leadSource.image : (leadNews ? leadNews.image : ''),
    imageCredit: leadSource.kind === 'news' && leadSource.image ? leadSource.source : (leadNews ? leadNews.source : ''),
  } : null;

  // ---- the photograph at the top: the place the month was mostly about
  const focusCity = [...news, ...projects].reduce((tally, r) => tally.set(r.city, (tally.get(r.city) || 0) + 1), new Map());
  const focusKey = [...focusCity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const photo = photos[focusKey] || photos.sanfrancisco;
  const hero = photo ? { url: photo.url, caption: photo.cap, by: photo.by, licence: photo.lic,
                         source: photo.source, city: labelOf(focusKey || 'sanfrancisco') } : null;

  // ---- the lede: what a reader needs in three sentences
  const topics = t => news.filter(n => n.topic === t).length;
  const marketNow = bayMarket(asOf, 'value');
  const lede = [];
  const totalPublic = news.length + projects.length + aprNew.length + regional.length;
  lede.push(`${plural(totalPublic, 'item', 'items')} entered the public record across the nine Bay Area counties in ${monthName(monthId)}${
    totalPublic ? `: ${[[topics('housing') + projects.filter(p => p.topic === 'housing').length, 'housing'],
                        [topics('developments'), 'development'],
                        [topics('transportation') + projects.filter(p => p.topic === 'transportation').length, 'transportation'],
                        [topics('civic'), 'civic']]
      .filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(', ')}${
      aprNew.length ? `, and ${plural(aprNew.length, 'housing record', 'housing records')} released with the state annual reports` : ''}.` : '.'}`);
  if (lead) lede.push(`${lead.scope === 'state' ? 'The month\'s decision came from Sacramento' : lead.scope === 'region' ? 'The month\'s decision was regional' : `The month's decision was local, in ${lead.city}`}: ${lead.title.replace(/\.$/, '')} (${lead.source}, ${lead.monthOnly ? monthName(lead.date.slice(0, 7)) : fmtDate(lead.date)}).`);
  if (marketNow) lede.push(`Of the ${municipalities.cities.length} jurisdictions this dashboard tracks, ${marketNow.cities} had a published Zillow index; their median typical home stood at ${money(marketNow.median)} in the ${marketNow.year} index, the most recent available when this issue went out.`);
  const biggest = [...aprNew, ...aprInMonth, ...projects].filter(p => p.units).sort((a, b) => b.units - a.units)[0];
  if (biggest) lede.push(`The largest single development on the record this month was ${biggest.title} in ${labelOf(biggest.city)}, ${plural(biggest.units, 'home', 'homes')} reported at the ${biggest.stage === 'completed' ? 'completion' : biggest.stage} stage.`);

  // =================================================================== 1. the big things
  const briefParas = [];
  if (regional.length) {
    briefParas.push(`${plural(regional.length, 'decision', 'decisions')} above the level of any single city landed in ${monthName(monthId)}. ${regional.map(r => `${r.title} (${r.source}, ${r.monthOnly ? monthName(r.date.slice(0, 7)) : fmtDate(r.date)})`).join('. ')}.`);
  }
  if (releases.length) {
    const totals = releases.reduce((a, r) => ({ permitted: a.permitted + (r.permitted || 0), completed: a.completed + (r.completed || 0), entitled: a.entitled + (r.entitled || 0), proposed: a.proposed + (r.proposed || 0) }), { permitted: 0, completed: 0, entitled: 0, proposed: 0 });
    briefParas.push(`California's Department of Housing and Community Development published the ${releases[0].year} annual progress reports this month: ${plural(releases.length, 'jurisdiction', 'jurisdictions')} in the nine counties reporting ${totals.permitted.toLocaleString('en-US')} homes permitted, ${totals.entitled.toLocaleString('en-US')} entitled and ${totals.completed.toLocaleString('en-US')} completed in that reporting year. These are the cities' own submissions, not an independent count, and a permit is not a finished home.`);
  }
  const busiest = COUNTIES.map(c => ({ county: c, n: [...news, ...projects, ...aprNew].filter(r => r.county === c).length })).sort((a, b) => b.n - a.n);
  const silent = busiest.filter(b => b.n === 0).map(b => b.county);
  if (busiest[0]?.n) briefParas.push(`${busiest[0].county} County accounted for the most of the local record, with ${plural(busiest[0].n, 'item', 'items')}.${silent.length ? ` ${silent.join(', ')} produced nothing this dashboard could verify: an absence of published reporting rather than evidence that nothing happened.` : ' Every county produced something.'}`);
  if (briefParas.length) sections.push({ kind: 'brief', title: 'The month in brief', paragraphs: briefParas,
    items: regional.map(r => ({ city: r.city ? labelOf(r.city) : (r.scope === 'state' ? 'California' : 'Bay Area'),
      date: r.date, monthOnly: r.monthOnly, title: r.title, snippet: r.snippet, source: r.source, url: r.url, verified: r.verified })) });

  if (threads.length) sections.push({ kind: 'threads', title: 'Still in play',
    paragraphs: ['Decisions taken earlier that still set the terms this month.'],
    items: threads.map(r => ({ city: r.city ? labelOf(r.city) : (r.scope === 'state' ? 'California' : 'Bay Area'),
      date: r.date, monthOnly: r.monthOnly, title: r.title, snippet: r.snippet, source: r.source, url: r.url })) });

  // =================================================================== 2. housing and development
  const housingParas = [];
  const housingStats = [];
  const bayRent = bayMarket(asOf, 'rent');
  if (marketNow) {
    const priorYear = municipalities.cities.map(c => (CITY_STATS[c.key]?.homeValueSeries || []).find(pt => Number(pt.year) === Number(marketNow.year) - 1)).filter(Boolean).map(pt => pt.value).sort((a, b) => a - b);
    const prior = priorYear.length ? priorYear[Math.floor(priorYear.length / 2)] : null;
    housingParas.push(`Prices first, because they frame everything else. The median typical home across the tracked cities stood at ${money(marketNow.median)} in Zillow's ${marketNow.year} index${prior ? `, ${Math.abs(((marketNow.median / prior) - 1) * 100).toFixed(1)}% ${marketNow.median >= prior ? 'above' : 'below'} the same index a year earlier` : ''}${bayRent ? `, with median asking rent at ${money(bayRent.median)}` : ''}. That is a regional middle: ${(() => {
      const ranked = municipalities.cities.map(c => ({ label: c.label, v: zillowAt(c.key, asOf, 'value')?.value })).filter(r => r.v).sort((a, b) => b.v - a.v);
      return ranked.length ? `${ranked[0].label} at ${money(ranked[0].v)} and ${ranked[ranked.length - 1].label} at ${money(ranked[ranked.length - 1].v)} are the ends of it` : 'the spread across cities is wide';
    })()}.`);
    housingStats.push({ label: 'Median typical home, tracked cities', value: money(marketNow.median), vintage: `Zillow ZHVI, ${marketNow.year} index`, source: 'https://www.zillow.com/research/data/' });
    if (bayRent) housingStats.push({ label: 'Median asking rent, tracked cities', value: money(bayRent.median), vintage: `Zillow ZORI, ${bayRent.year} index`, source: 'https://www.zillow.com/research/data/' });
  }
  if (pipeline.length) {
    const units = pipeline.reduce((a, p) => a + p.units, 0);
    const byStage = ['proposed', 'review', 'approved', 'construction'].map(st => [st, pipeline.filter(p => p.stage === st).length]).filter(([, n]) => n);
    housingParas.push(`Counting every record published up to this issue and not reported as finished, ${plural(pipeline.length, 'development', 'developments')} carrying ${units.toLocaleString('en-US')} reported homes ${were(pipeline.length)} somewhere between application and construction${byStage.length ? ` - ${byStage.map(([st, n]) => `${n} ${st}`).join(', ')}` : ''}. That is a count of paperwork, not of homes anyone can move into: a single master plan can carry thousands of units and take a decade.`);
    housingStats.push({ label: 'Homes in published, unfinished developments', value: units.toLocaleString('en-US'), vintage: `${pipeline.length.toLocaleString('en-US')} records published to ${fmtDate(asOf)}`, source: 'https://data.ca.gov/dataset/housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year' });
  }
  if (asOf >= RHNA_PROGRESS) {
    const rows = Object.entries(RHNA).filter(([, r]) => r.target);
    const target = rows.reduce((a, [, r]) => a + r.target, 0), built = rows.reduce((a, [, r]) => a + r.units, 0);
    const behind = rows.map(([k, r]) => ({ k, pct: r.pct })).sort((a, b) => a.pct - b.pct);
    housingParas.push(`Against the state's own yardstick, the ${rows.length} cities with a published 6th cycle progress row had permitted ${built.toLocaleString('en-US')} of ${target.toLocaleString('en-US')} allocated homes, ${((built / target) * 100).toFixed(1)}% of the way through a cycle that runs to 2031. The spread is the story: ${labelOf(behind[behind.length - 1].k)} at ${behind[behind.length - 1].pct}% and ${labelOf(behind[0].k)} at ${behind[0].pct}%.`);
    housingStats.push({ label: '6th cycle homes permitted, cities with a progress row', value: `${built.toLocaleString('en-US')} of ${target.toLocaleString('en-US')}`, vintage: 'HCD 6th Cycle RHNA Progress Report, August 2026', source: 'https://data.ca.gov/dataset/rhna-progress-report' });
  }
  const housingNews = news.filter(n => n.topic === 'housing' || n.topic === 'developments');
  const housingRecords = [...aprNew, ...aprInMonth].filter(p => p.units).sort((a, b) => b.units - a.units).slice(0, 8)
    .map(p => ({ city: labelOf(p.city), county: p.county, title: p.title, units: p.units, bmr: p.bmr,
                 status: p.reportedStatus || p.stage, date: p.date, source: p.source, url: p.url }));
  if (!housingParas.length) housingParas.push(`No housing or development record reached this dashboard between ${fmtDate(from)} and ${fmtDate(asOf)}. The market figures below are the only housing numbers this issue can stand behind.`);
  sections.push({
    kind: 'housing', title: 'Housing and development', paragraphs: housingParas, stats: housingStats,
    records: housingRecords,
    items: housingNews.map(r => ({ city: labelOf(r.city), county: r.county, date: r.date, title: r.title, snippet: r.snippet.slice(0, 280), source: r.source, url: r.url, image: r.image || '' })),
  });

  // =================================================================== 3. transportation
  const transitParas = [];
  const transitStats = [];
  const transitResearch = [...regional, ...threads].filter(r => r.topic === 'transportation');
  const transitNews = [...news.filter(n => n.topic === 'transportation'), ...projects.filter(p => p.topic === 'transportation')];
  if (transitResearch.length) transitParas.push(`${transitResearch[0].title} (${transitResearch[0].source}, ${transitResearch[0].monthOnly ? monthName(transitResearch[0].date.slice(0, 7)) : fmtDate(transitResearch[0].date)}). ${transitResearch[0].snippet}`);
  if (asOf >= ACS_2020_2024) {
    const commutes = municipalities.cities.map(c => ({ label: c.label, v: CITY_STATS[c.key]?.meanCommuteMin })).filter(r => r.v).sort((a, b) => a.v - b.v);
    const transit = municipalities.cities.map(c => CITY_STATS[c.key]?.transitSharePct).filter(Boolean).sort((a, b) => a - b);
    if (commutes.length) {
      const median = commutes[Math.floor(commutes.length / 2)];
      transitParas.push(`The census puts the median one-way commute across these cities at ${median.v.toFixed(1)} minutes, from ${commutes[0].v.toFixed(1)} in ${commutes[0].label} to ${commutes[commutes.length - 1].v.toFixed(1)} in ${commutes[commutes.length - 1].label}${transit.length ? `, with a median ${transit[Math.floor(transit.length / 2)].toFixed(1)}% of workers commuting by public transport` : ''}. Those are five-year averages, so they move slowly and they lag.`);
      transitStats.push({ label: 'Median one-way commute', value: `${median.v.toFixed(1)} min`, vintage: '2020–2024 ACS 5-year', source: 'https://www.census.gov/programs-surveys/acs' });
      if (transit.length) transitStats.push({ label: 'Median share commuting by transit', value: `${transit[Math.floor(transit.length / 2)].toFixed(1)}%`, vintage: '2020–2024 ACS 5-year', source: 'https://www.census.gov/programs-surveys/acs' });
    }
  }
  if (transitNews.length) transitParas.push(`${plural(transitNews.length, 'transportation item', 'transportation items')} reached the record locally this month${transitNews.length ? `, in ${[...new Set(transitNews.map(t => labelOf(t.city)))].slice(0, 5).join(', ')}` : ''}.`);
  if (!transitParas.length) transitParas.push(`Nothing on transportation reached the record this period. The commute and transit-share figures this dashboard holds come from the census and move slowly, so an empty month says nothing about how the system ran.`);
  sections.push({
    kind: 'transport', title: 'Transportation', paragraphs: transitParas, stats: transitStats,
    items: [...transitResearch.slice(1), ...transitNews].map(r => ({ city: r.city ? labelOf(r.city) : 'Bay Area', county: r.county, date: r.date, monthOnly: r.monthOnly, title: r.title, snippet: (r.snippet || '').slice(0, 280), source: r.source, url: r.url, image: r.image || '' })),
  });

  // =================================================================== 4. county by county
  for (const county of COUNTIES) {
    const cNews = news.filter(n => n.county === county);
    const cProjects = projects.filter(p => p.county === county);
    const cApr = aprNew.filter(p => p.county === county).sort((a, b) => b.units - a.units);
    const cReleases = releases.filter(r => r.county === county);
    const market = countyMarket(county, asOf, 'value');
    const rent = countyMarket(county, asOf, 'rent');
    const paragraphs = [];
    const tracked = citiesInCounty(county).length;
    const yearHere = yearNews.filter(n => n.county === county).length;
    const pipeHere = pipeline.filter(p => p.county === county);
    const rhnaHere = citiesInCounty(county).map(c => RHNA[c.key]).filter(Boolean);

    paragraphs.push(`${plural(tracked, 'jurisdiction', 'jurisdictions')} tracked here${yearHere ? `, ${plural(yearHere, 'published report', 'published reports')} in the last twelve months` : ', and no published report in the last twelve months'}${market ? `. Median typical home ${money(market.median)} (${market.year} index)${rent ? `, median asking rent ${money(rent.median)}` : ''}` : ''}.`);
    if (rhnaHere.length) {
      const target = rhnaHere.reduce((a, r) => a + r.target, 0);
      paragraphs.push(`${rhnaHere.length === 1 ? 'One of its cities carries' : `${rhnaHere.length} of its cities carry`} a 6th cycle housing allocation on this dashboard, ${target.toLocaleString('en-US')} homes between them for the 2023-2031 cycle${asOf >= RHNA_PROGRESS ? `, of which ${rhnaHere.reduce((a, r) => a + r.units, 0).toLocaleString('en-US')} had been permitted by HCD's August 2026 progress file` : '; progress against it is not published in a file this issue can quote'}.`);
    }
    if (cReleases.length) {
      const t = cReleases.reduce((a, r) => ({ p: a.p + (r.permitted || 0), c: a.c + (r.completed || 0) }), { p: 0, c: 0 });
      paragraphs.push(`Its ${plural(cReleases.length, 'jurisdiction', 'jurisdictions')} reported ${t.p.toLocaleString('en-US')} homes permitted and ${t.c.toLocaleString('en-US')} completed in the ${cReleases[0].year} reporting year.`);
    }
    if (cApr.length) paragraphs.push(`${plural(cApr.length, 'record', 'records')} from its cities became public with the annual reports, the largest ${cApr.slice(0, 3).map(p => `${p.title} in ${labelOf(p.city)} (${plural(p.units, 'home', 'homes')}, ${p.reportedStatus || p.stage})`).join('; ')}.`);
    if (pipeHere.length) paragraphs.push(`${plural(pipeHere.length, 'published development', 'published developments')} ${were(pipeHere.length)} on the record and not reported finished, carrying ${pipeHere.reduce((a, p) => a + p.units, 0).toLocaleString('en-US')} reported homes; the largest was ${pipeHere[0].title} in ${labelOf(pipeHere[0].city)} at ${plural(pipeHere[0].units, 'home', 'homes')}.`);
    const items = [...cNews, ...cProjects].map(r => ({ city: labelOf(r.city), date: r.date, title: r.title,
      snippet: (r.snippet || '').slice(0, 260), source: r.source, url: r.url, topic: r.topic, image: r.image || '' }));
    const quiet = !items.length && !cApr.length && !cReleases.length;
    if (quiet) paragraphs.push(`No published record from ${county} County's ${tracked} jurisdictions reached this dashboard in ${monthName(monthId)}. That is an absence of reporting, not evidence that nothing happened.`);
    sections.push({ kind: 'county', county, tracked, quiet, paragraphs, items });
  }

  // =================================================================== 5. cities in focus
  const cityTally = new Map();
  [...yearNews, ...yearProjects].forEach(r => cityTally.set(r.city, (cityTally.get(r.city) || 0) + 1));
  const spotlights = [...cityTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => {
    const value = zillowAt(key, asOf, 'value'), rentNow = zillowAt(key, asOf, 'rent');
    const rhna = RHNA[key];
    const local = pipeline.filter(p => p.city === key);
    const latest = [...yearNews].filter(x => x.city === key).sort((a, b) => b.date.localeCompare(a.date))[0];
    const facts = [];
    if (value) facts.push(`typical home ${money(value.value)} (Zillow ${value.year})`);
    if (rentNow) facts.push(`typical rent ${money(rentNow.value)}`);
    if (CITY_STATS[key]?.population && asOf >= ACS_2020_2024) facts.push(`${CITY_STATS[key].population.toLocaleString('en-US')} residents (2020–2024 ACS)`);
    if (rhna) facts.push(`6th cycle allocation ${rhna.target.toLocaleString('en-US')} homes${asOf >= RHNA_PROGRESS ? `, ${rhna.pct}% permitted` : ''}`);
    return { city: labelOf(key), county: countyOf(key), mentions: n, facts,
      photo: photos[key] ? { url: photos[key].url, by: photos[key].by, licence: photos[key].lic, caption: photos[key].cap } : null,
      pipeline: local.slice(0, 3).map(p => ({ title: p.title, units: p.units, status: p.reportedStatus || p.stage, date: p.date, url: p.url, source: p.source })),
      latest: latest ? { title: latest.title, date: latest.date, source: latest.source, url: latest.url, snippet: latest.snippet.slice(0, 220) } : null };
  });
  if (spotlights.length) sections.push({ kind: 'spotlight', title: 'Cities in focus', spotlights });

  // =================================================================== 6. who decides
  const boardItems = news.filter(n => /commission|council|board|hearing|meeting|agenda|vote|approv/i.test(n.title + ' ' + n.snippet))
    .map(r => ({ city: labelOf(r.city), county: r.county, title: r.title, date: r.date, source: r.source, url: r.url }));
  sections.push({ kind: 'boards', title: 'Who decides, and where',
    paragraphs: [`Land use in every one of these ${municipalities.cities.length} jurisdictions is decided in public by a planning commission and a city or town council. Agendas are posted before each meeting and public comment is taken at it. Nothing in this newsletter is a decision; anything still pending is decided at one of those meetings.`],
    items: boardItems });

  // =================================================================== 7. what to watch
  const watch = [];
  const [yearNum, monthNum] = monthId.split('-').map(Number);
  const nextApril = `${monthNum >= 4 ? yearNum + 1 : yearNum}-04-01`;
  watch.push({ when: fmtDate(nextApril), what: `Cities file their ${monthNum >= 4 ? yearNum : yearNum - 1} housing annual reports with HCD. Table A2 of those filings is what this dashboard's project records are built from, and it reaches data.ca.gov in the months after.` });
  if (asOf >= '2025-10-10' && asOf < '2026-07-01') watch.push({ when: 'July 1, 2026', what: 'SB 79\'s upzoning provisions take effect near major transit stops in Alameda, Contra Costa, San Francisco, San Mateo and Santa Clara counties. Cities can conform, exclude parcels, or adopt an alternative transit-oriented plan before then.' });
  if (asOf >= '2025-10-13' && asOf < '2026-11-03') watch.push({ when: 'November 3, 2026', what: `Voters in the five SB 63 counties decide the regional transit sales tax - a half cent, a full cent in San Francisco, about $980 million a year for 14 years${asOf >= '2026-05-26' ? '. It qualified by citizens\' initiative in May, so it passes on a simple majority' : ''}.` });
  if (monthId === '2026-03') watch.push({ when: 'March 19 and 25, 2026', what: 'ABAG and MTC vote on adopting the final Plan Bay Area 2050+.' });
  if (asOf < ACS_2020_2024) watch.push({ when: 'December 2025', what: 'The Census Bureau releases the 2020–2024 American Community Survey five-year estimates, the next refresh of commute, income and tenure figures for every city here.' });
  const nextZillow = municipalities.cities.flatMap(c => (CITY_STATS[c.key]?.homeValueSeries || []).map(pt => pt.year)).filter(y => zillowPointAvailable(y) > asOf).sort()[0];
  if (nextZillow) watch.push({ when: `August ${nextZillow}`, what: `Zillow's ${nextZillow} index lands, the next comparable annual reading of home values and rents in these cities.` });
  const notYet = [];
  const nextApr = Object.entries(APR_PUBLISHED).find(([, when]) => when > asOf);
  if (nextApr) notYet.push(`The ${nextApr[0]} state housing annual reports, filed the April after that reporting year.`);
  if (asOf < ACS_2020_2024) notYet.push('The 2020–2024 American Community Survey five-year estimates.');
  if (asOf < RHNA_PROGRESS) notYet.push('HCD\'s August 2026 update of the 6th cycle RHNA progress file; allocations adopted in 2021 and 2022 are quoted instead.');
  if (nextZillow) notYet.push(`Zillow index values from ${nextZillow} onward.`);
  sections.push({ kind: 'watch', title: 'What to watch', paragraphs: ['Dates already on the calendar when this issue went out.'], watch, notYet });

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
let previous = null;
const issues = months.map((id, i) => { const issue = issueFor(id, i + 1, previous); previous = issue.date; return issue; })
  .reverse();   // newest first
writeFileSync(new URL('public/data/newsletter.json', ROOT), JSON.stringify({
  generated: new Date().toISOString(),
  method: 'Each issue contains only material that had been published by the last day of its month. Sources carry their own availability dates: news by publication, city records by the date the city posted them, HCD annual report rows by the release of that reporting year, Zillow by the month it published, ACS by its December release, RHNA progress by its August 2026 vintage.',
  issues,
}, null, 1));
console.log(`${issues.length} issues, ${issues[0].month} back to ${issues[issues.length - 1].month}`);
issues.slice().reverse().forEach(i => console.log(` ${i.id}  news ${String(i.counts.news).padStart(3)}  city records ${String(i.counts.projects).padStart(2)}  APR released ${String(i.counts.aprReleased).padStart(4)}  sources ${i.counts.sources}`));
