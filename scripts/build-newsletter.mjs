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
    url: a.url, date: a.date, available: a.date,
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

function issueFor(monthId, number) {
  const asOf = endOfMonth(monthId);
  const since = trailingYear(asOf);
  const published = r => r.available && r.available <= asOf;
  const inWindow = r => published(r) && r.date > since && r.date <= asOf;
  const inMonth = r => r.date.slice(0, 7) === monthId && r.available <= asOf;
  // Records whose own month has passed but which only became public this month - the annual
  // reports arrive in one wave, and that wave is itself the month's news.
  const arrivedThisMonth = r => r.available && r.available.slice(0, 7) === monthId && r.date.slice(0, 7) !== monthId;

  const news = newsItems.filter(inMonth).sort((a, b) => a.date.localeCompare(b.date));
  const projects = curated.filter(inMonth);
  const aprNew = aprRecords.filter(arrivedThisMonth);
  const aprInMonth = aprRecords.filter(inMonth);
  const releases = aprActivity.filter(a => a.available.slice(0, 7) === monthId);

  const yearNews = newsItems.filter(inWindow);
  const yearProjects = [...curated, ...aprRecords].filter(inWindow);
  // Everything a city had published before this issue and not reported as finished.
  const pipeline = [...curated, ...aprRecords]
    .filter(r => published(r) && r.date <= asOf && r.units && r.stage !== 'completed')
    .sort((a, b) => b.units - a.units);

  const sections = [];
  const sources = new Map();
  const remember = item => { if (item.url && !sources.has(item.url)) sources.set(item.url, { label: item.source, url: item.url, date: item.date }); };
  [...news, ...projects, ...aprNew.slice(0, 40), ...aprInMonth.slice(0, 40)].forEach(remember);

  // ---- the lede
  const topics = t => news.filter(n => n.topic === t).length;
  const marketNow = bayMarket(asOf, 'value');
  const lede = [];
  const totalPublic = news.length + projects.length + aprNew.length;
  lede.push(`${plural(totalPublic, 'item', 'items')} entered the public record across the nine Bay Area counties in ${monthName(monthId)}${
    totalPublic ? `: ${[[topics('housing') + projects.filter(p => p.topic === 'housing').length, 'housing'],
                        [topics('developments'), 'development'],
                        [topics('transportation') + projects.filter(p => p.topic === 'transportation').length, 'transportation'],
                        [topics('civic'), 'civic']]
      .filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(', ')}${
      aprNew.length ? `, and ${plural(aprNew.length, 'housing record', 'housing records')} released with the state annual reports` : ''}.` : '.'}`);
  if (marketNow) lede.push(`Of the ${municipalities.cities.length} jurisdictions this dashboard tracks, ${marketNow.cities} had a published Zillow index; their median typical home stood at ${money(marketNow.median)} in the ${marketNow.year} index, the most recent available when this issue went out.`);
  const biggest = [...aprNew, ...aprInMonth, ...projects].filter(p => p.units).sort((a, b) => b.units - a.units)[0];
  if (biggest) lede.push(`The largest single development on the record this month was ${biggest.title} in ${labelOf(biggest.city)}, ${plural(biggest.units, 'home', 'homes')} reported at the ${biggest.stage === 'completed' ? 'completion' : biggest.stage} stage.`);

  // ---- the region
  const regionParas = [];
  if (releases.length) {
    const totals = releases.reduce((a, r) => ({ permitted: a.permitted + (r.permitted || 0), completed: a.completed + (r.completed || 0), entitled: a.entitled + (r.entitled || 0) }), { permitted: 0, completed: 0, entitled: 0 });
    regionParas.push(`California's Department of Housing and Community Development published the ${releases[0].year} annual progress reports this month. Across ${plural(releases.length, 'jurisdiction', 'jurisdictions')} in the nine counties they report ${totals.permitted.toLocaleString('en-US')} homes permitted, ${totals.entitled.toLocaleString('en-US')} entitled and ${totals.completed.toLocaleString('en-US')} completed in that reporting year. These are the cities' own submissions to the state, not an independent count, and a permit is not a finished home.`);
  }
  const busiest = COUNTIES.map(c => ({ county: c, n: [...news, ...projects, ...aprNew].filter(r => r.county === c).length })).sort((a, b) => b.n - a.n);
  if (busiest[0]?.n) regionParas.push(`${busiest[0].county} County accounted for the most of it, with ${plural(busiest[0].n, 'item', 'items')}; ${busiest.filter(b => b.n === 0).length ? `${busiest.filter(b => b.n === 0).map(b => b.county).join(', ')} produced nothing this dashboard could verify in ${monthName(monthId)}, which means no published record reached it rather than that nothing happened.` : `every county produced something.`}`);
  if (regionParas.length) sections.push({ kind: 'region', title: 'Across the nine counties', paragraphs: regionParas });

  // ---- the twelve months behind it
  const yearParas = [];
  if (yearNews.length || yearProjects.length) {
    const byTopic = ['housing', 'developments', 'transportation', 'civic']
      .map(t => [t, yearNews.filter(n => n.topic === t).length]).filter(([, n]) => n);
    yearParas.push(`In the twelve months to ${fmtDate(asOf)}, ${plural(yearNews.length, 'published report', 'published reports')} about these nine counties reached this dashboard${byTopic.length ? ` - ${byTopic.map(([t, n]) => `${n} on ${t === 'developments' ? 'development' : t}`).join(', ')}` : ''}, alongside ${plural(yearProjects.length, 'dated city or state record', 'dated city and state records')}.`);
    const leaders = COUNTIES.map(county => ({ county, n: yearNews.filter(n => n.county === county).length }))
      .filter(r => r.n).sort((a, b) => b.n - a.n).slice(0, 4);
    if (leaders.length) yearParas.push(`Most of that coverage came from ${leaders.map(l => `${l.county} (${l.n})`).join(', ')}. Coverage is not the same as activity: a county with fewer reports may simply have fewer newsrooms filing to the sources this dashboard reads.`);
    if (pipeline.length) {
      const units = pipeline.reduce((a, p) => a + p.units, 0);
      yearParas.push(`Counting every record published up to this issue and not reported as finished, ${plural(pipeline.length, 'development', 'developments')} carrying ${units.toLocaleString('en-US')} reported homes ${were(pipeline.length)} somewhere between application and construction. That is a count of paperwork, not of homes anyone can move into.`);
    }
    sections.push({ kind: 'year', title: 'The twelve months behind this issue', paragraphs: yearParas });
  }

  // ---- counties
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
    paragraphs.push(`${county} County: ${plural(tracked, 'jurisdiction', 'jurisdictions')} tracked here${yearHere ? `, ${plural(yearHere, 'published report', 'published reports')} in the last twelve months` : ', and no published report in the last twelve months'}.`);
    if (market) paragraphs.push(`Across the ${market.cities} of ${tracked} ${county} County jurisdictions with a published Zillow index, the median typical home value was ${money(market.median)} (${market.year} index)${rent ? `, and the median asking rent ${money(rent.median)}` : ''}.`);
    if (rhnaHere.length) {
      const target = rhnaHere.reduce((a, r) => a + r.target, 0);
      paragraphs.push(`${rhnaHere.length === 1 ? 'One of its cities carries' : `${rhnaHere.length} of its cities carry`} a 6th cycle housing allocation on this dashboard, ${target.toLocaleString('en-US')} homes between them for the 2023-2031 cycle${asOf >= RHNA_PROGRESS ? `, of which ${rhnaHere.reduce((a, r) => a + r.units, 0).toLocaleString('en-US')} had been permitted by HCD's August 2026 progress file` : '. Progress against it is not published in a file this issue can quote'}.`);
    }
    if (pipeHere.length) {
      const top = pipeHere[0];
      paragraphs.push(`${plural(pipeHere.length, 'published development', 'published developments')} in the county ${were(pipeHere.length)} on the record and not reported finished, carrying ${pipeHere.reduce((a, p) => a + p.units, 0).toLocaleString('en-US')} reported homes; the largest was ${top.title} in ${labelOf(top.city)} at ${plural(top.units, 'home', 'homes')}.`);
    }
    if (cReleases.length) {
      const t = cReleases.reduce((a, r) => ({ p: a.p + (r.permitted || 0), c: a.c + (r.completed || 0) }), { p: 0, c: 0 });
      paragraphs.push(`Its ${plural(cReleases.length, 'jurisdiction', 'jurisdictions')} reported ${t.p.toLocaleString('en-US')} homes permitted and ${t.c.toLocaleString('en-US')} completed in the ${cReleases[0].year} reporting year.`);
    }
    if (cApr.length) {
      const top = cApr.slice(0, 3).map(p => `${p.title} in ${labelOf(p.city)} (${plural(p.units, 'home', 'homes')}, ${p.reportedStatus || p.stage})`).join('; ');
      paragraphs.push(`${plural(cApr.length, 'record', 'records')} from the county's cities became public with the annual reports, the largest being ${top}.`);
    }
    const items = [...cNews, ...cProjects].map(r => ({
      city: labelOf(r.city), date: r.date, title: r.title, snippet: r.snippet.slice(0, 260),
      source: r.source, url: r.url, topic: r.topic,
    }));
    // A county always gets its standing profile, so "quiet" means nothing new was published this
    // month rather than that the county is missing from the issue. Saying so is the point: silence
    // in the record is not the same as silence on the ground.
    const quiet = !items.length && !cApr.length && !cReleases.length;
    if (quiet) paragraphs.push(`No published record from ${county} County's ${tracked} jurisdictions reached this dashboard in ${monthName(monthId)}. That is an absence of reporting, not evidence that nothing happened.`);
    sections.push({ kind: 'county', county, tracked, quiet, paragraphs, items });
  }

  // ---- city spotlights: wherever the year's record is thickest
  const cityTally = new Map();
  [...yearNews, ...yearProjects].forEach(r => cityTally.set(r.city, (cityTally.get(r.city) || 0) + 1));
  const spotlights = [...cityTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => {
    const value = zillowAt(key, asOf, 'value'), rentNow = zillowAt(key, asOf, 'rent');
    const rhna = RHNA[key];
    const local = pipeline.filter(p => p.city === key);
    const latest = [...yearNews].filter(n => n.city === key).sort((a, b) => b.date.localeCompare(a.date))[0];
    const facts = [];
    if (value) facts.push(`typical home ${money(value.value)} (Zillow ${value.year})`);
    if (rentNow) facts.push(`typical rent ${money(rentNow.value)}`);
    if (CITY_STATS[key]?.population && asOf >= ACS_2020_2024) facts.push(`${CITY_STATS[key].population.toLocaleString('en-US')} residents (2020–2024 ACS)`);
    if (rhna) facts.push(`6th cycle allocation ${rhna.target.toLocaleString('en-US')} homes${asOf >= RHNA_PROGRESS ? `, ${rhna.pct}% permitted` : ''}`);
    return {
      city: labelOf(key), county: countyOf(key), mentions: n, facts,
      pipeline: local.slice(0, 3).map(p => ({ title: p.title, units: p.units, status: p.reportedStatus || p.stage, date: p.date, url: p.url, source: p.source })),
      latest: latest ? { title: latest.title, date: latest.date, source: latest.source, url: latest.url, snippet: latest.snippet.slice(0, 220) } : null,
    };
  });
  if (spotlights.length) sections.push({ kind: 'spotlight', title: 'Cities to watch this month', spotlights });

  // ---- housing, transportation, boards
  const housingRecords = [...aprNew, ...aprInMonth].filter(p => p.units).sort((a, b) => b.units - a.units).slice(0, 8)
    .map(p => ({ city: labelOf(p.city), county: p.county, title: p.title, units: p.units, bmr: p.bmr,
                 status: p.reportedStatus || p.stage, date: p.date, source: p.source, url: p.url }));
  if (housingRecords.length) sections.push({ kind: 'housing', title: 'Housing on the record',
    paragraphs: [`The largest reported developments available this month, by the number of homes each city reported to the state. A reported milestone is one step - an application, an entitlement, a permit or a completion - and units may describe a single phase.`],
    records: housingRecords });

  const transit = [...news.filter(n => n.topic === 'transportation'), ...projects.filter(p => p.topic === 'transportation')]
    .map(r => ({ city: labelOf(r.city), county: r.county, title: r.title, snippet: r.snippet.slice(0, 260), date: r.date, source: r.source, url: r.url }));
  if (transit.length) sections.push({ kind: 'transport', title: 'Getting around', items: transit });

  const boardItems = news.filter(n => /commission|council|board|hearing|meeting|agenda|vote|approv/i.test(n.title + ' ' + n.snippet))
    .map(r => ({ city: labelOf(r.city), county: r.county, title: r.title, date: r.date, source: r.source, url: r.url }));
  sections.push({ kind: 'boards', title: 'Who decides, and where',
    paragraphs: [`Land use in every one of these ${municipalities.cities.length} jurisdictions is decided in public by a planning commission and a city or town council. Agendas are posted before each meeting and public comment is taken at it; nothing in this newsletter is a decision, and anything still pending is decided at one of those meetings rather than here.`],
    items: boardItems });

  // ---- numbers, with their vintages
  const stats = [];
  const bayRent = bayMarket(asOf, 'rent');
  if (marketNow) stats.push({ label: 'Typical home value, median of tracked cities', value: money(marketNow.median), vintage: `Zillow ZHVI, ${marketNow.year} index`, source: 'https://www.zillow.com/research/data/' });
  if (bayRent) stats.push({ label: 'Typical asking rent, median of tracked cities', value: money(bayRent.median), vintage: `Zillow ZORI, ${bayRent.year} index`, source: 'https://www.zillow.com/research/data/' });
  if (asOf >= ACS_2020_2024) {
    const commutes = municipalities.cities.map(c => CITY_STATS[c.key]?.meanCommuteMin).filter(Boolean).sort((a, b) => a - b);
    const pop = municipalities.cities.map(c => CITY_STATS[c.key]?.population).filter(Boolean).reduce((a, b) => a + b, 0);
    if (commutes.length) stats.push({ label: 'Median one-way commute, tracked cities', value: `${commutes[Math.floor(commutes.length / 2)].toFixed(1)} minutes`, vintage: '2020–2024 ACS 5-year', source: 'https://www.census.gov/programs-surveys/acs' });
    if (pop) stats.push({ label: 'People living in the tracked jurisdictions', value: pop.toLocaleString('en-US'), vintage: '2020–2024 ACS 5-year', source: 'https://www.census.gov/programs-surveys/acs' });
  }
  if (asOf >= RHNA_PROGRESS) {
    const rows = Object.entries(RHNA).filter(([, r]) => r.target);
    const target = rows.reduce((a, [, r]) => a + r.target, 0);
    const built = rows.reduce((a, [, r]) => a + r.units, 0);
    stats.push({ label: `6th cycle housing target, ${rows.length} cities with a published progress row`, value: `${built.toLocaleString('en-US')} of ${target.toLocaleString('en-US')} homes permitted`, vintage: 'HCD 6th Cycle RHNA Progress Report, August 2026', source: 'https://data.ca.gov/dataset/rhna-progress-report' });
  }

  // ---- what this issue could not know
  const blind = [];
  const nextApr = Object.entries(APR_PUBLISHED).find(([, when]) => when > asOf);
  if (nextApr) blind.push(`The ${nextApr[0]} state housing annual reports, which cities file the following April and which this issue therefore cannot draw on.`);
  if (asOf < ACS_2020_2024) blind.push('The 2020–2024 American Community Survey five-year estimates, released in December 2025.');
  if (asOf < RHNA_PROGRESS) blind.push("HCD's August 2026 update of the 6th cycle RHNA progress file; housing targets are quoted here only as the allocations adopted in 2021 and 2022.");
  const laterZillow = municipalities.cities.some(c => (CITY_STATS[c.key]?.homeValueSeries || []).some(p => zillowPointAvailable(p.year) > asOf));
  if (laterZillow) blind.push('Zillow index values for months after this issue, which were not published yet.');

  return {
    id: monthId, number, month: monthName(monthId), date: asOf, dateline: fmtDate(asOf),
    lede, sections,
    stats,
    blind,
    counts: { news: news.length, projects: projects.length, aprReleased: aprNew.length, sources: sources.size },
    sources: [...sources.values()].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
  };
}

// ---------------------------------------------------------------- run
const START = '2025-10';   // eleven months before the September 2026 issue
const END = '2026-09';
const months = [];
for (let [y, m] = START.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= END;) {
  months.push(`${y}-${String(m).padStart(2, '0')}`);
  if (++m > 12) { m = 1; y++; }
}
const issues = months.map((id, i) => issueFor(id, i + 1)).reverse();   // newest first
writeFileSync(new URL('public/data/newsletter.json', ROOT), JSON.stringify({
  generated: new Date().toISOString(),
  method: 'Each issue contains only material that had been published by the last day of its month. Sources carry their own availability dates: news by publication, city records by the date the city posted them, HCD annual report rows by the release of that reporting year, Zillow by the month it published, ACS by its December release, RHNA progress by its August 2026 vintage.',
  issues,
}, null, 1));
console.log(`${issues.length} issues, ${issues[0].month} back to ${issues[issues.length - 1].month}`);
issues.slice().reverse().forEach(i => console.log(` ${i.id}  news ${String(i.counts.news).padStart(3)}  city records ${String(i.counts.projects).padStart(2)}  APR released ${String(i.counts.aprReleased).padStart(4)}  sources ${i.counts.sources}`));
