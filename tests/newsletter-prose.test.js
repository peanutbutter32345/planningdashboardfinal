// Faults found by reading a published issue rather than the generator. Every one of these was
// visible in the September 2026 edition on the site:
//
//   "In Portola Valley, Portola Valley will hold election, even though..."
//   "Over in Atherton, Newly appointed Atherton Council member says she's ready to listen"
//   "...allowing unauthorized agencies to search the database. Photo by Magali Gauthier."
//   "Unless write-in candidates file to run by Oct."
//   "...ready to listen, learn (The Almanac, August 26, 2026.)"   (no full stop, two spaces)
//
// The generator writes the connecting prose and quotes publishers' summaries verbatim, so these
// check the written joins rather than the quoted text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const newsletter = JSON.parse(readFileSync(new URL('../public/data/newsletter.json', import.meta.url), 'utf8'));
const issues = newsletter.issues || newsletter;

const spanText = spans => (spans || []).map(s => s.v || '').join('');
function paragraphs() {
  const out = [];
  for (const issue of issues) {
    const push = (blocks, where) => (blocks || []).forEach(b => {
      if (b.kind === 'para') out.push({ issue: issue.month, where, text: spanText(b.spans) });
    });
    push(issue.lede, 'lede');
    for (const section of issue.sections || []) push(section.blocks, section.title || `${section.county} County`);
  }
  return out;
}

// Spans the generator wrote itself. A span marked q holds a publisher's summary, and a link span
// holds either a headline or a publisher's name, so both are quoted material: "Meet your Richmond
// City Council District 3 candidates - in their own words" is Richmondside's own headline, em dash
// and all, and rewriting it would misquote them. Only the connecting prose is held to these rules.
function writtenText() {
  const out = [];
  for (const issue of issues) {
    const collect = (blocks, where) => (blocks || []).forEach(b => {
      if (b.kind !== 'para') return;
      const written = (b.spans || []).filter(s => !s.q && s.t !== 'link').map(s => s.v || '').join('');
      out.push({ issue: issue.month, where, text: written });
    });
    collect(issue.lede, 'lede');
    for (const section of issue.sections || []) collect(section.blocks, section.title || `${section.county} County`);
  }
  return out;
}

test('every issue has prose to read', () => {
  assert.ok(issues.length > 0, 'the archive should hold issues');
  assert.ok(paragraphs().length > issues.length, 'each issue should carry paragraphs');
});

test('no paragraph names a city twice in a row', () => {
  // "In Portola Valley, Portola Valley will hold election". The opener is dropped when the
  // headline already names the place.
  const offenders = [];
  for (const p of paragraphs()) {
    const m = p.text.match(/\b(?:In|Over in|Also in|And in)\s+([A-Z][A-Za-z.' ]{2,24}?),\s+\1\b/);
    if (m) offenders.push(`${p.issue} / ${p.where}: "${m[0]}"`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('no paragraph runs two spaces together', () => {
  // A missing or doubled separator around a citation. The citation no longer carries a leading
  // space, so whatever precedes it owns the gap.
  const offenders = paragraphs()
    .filter(p => /\S {2,}\S/.test(p.text))
    .map(p => `${p.issue} / ${p.where}: "${p.text.match(/\S {2,}\S.{0,40}/)[0]}"`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('no excerpt stops on an abbreviation', () => {
  // "file to run by Oct." was a cut made at the wrong period. An excerpt with no complete
  // sentence in it is dropped rather than printed as a fragment.
  // A bad cut leaves the abbreviation at the very end of the excerpt, so what follows is the
  // citation or the end of the paragraph. Checking for that shape rather than for the
  // abbreviation itself keeps "St. Helena" and "by Oct. 10" out of it, both of which are
  // ordinary mid-sentence text and appear in these issues.
  const ABBR = /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mr|Mrs|Ms|Dr|Gov|Sen|Rep|Ave|Blvd|Rd|No|Inc|Corp|Jr|Sr|vs|approx|est|sq|ft|Calif)\.(?=\s*(?:\(|$))/;
  const offenders = [];
  for (const p of paragraphs()) {
    const m = p.text.match(ABBR);
    if (m) offenders.push(`${p.issue} / ${p.where}: ends on "${m[0]}"`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('no photo credit is left inside the prose', () => {
  const offenders = paragraphs()
    .filter(p => /\b(?:photo|photos|image|picture) (?:by|courtesy|credit)\b/i.test(p.text)
              || /\b(?:file photo|staff photo|getty images)\b/i.test(p.text))
    .map(p => `${p.issue} / ${p.where}`);
  assert.deepEqual(offenders, [], `A credit belongs to the picture, not the paragraph:\n${offenders.join('\n')}`);
});

test('the lead is only called a decision when it is one', () => {
  // "The month's main decision" used to read "The largest of them", which measured nothing, and
  // the selection counted any headline containing the word "council" as a decision. That is how
  // a council appointment led an issue ahead of every approval in the region.
  const DECISION = /\b(approv|adopt|pass(?:es|ed)?|vote[ds]?|reject|certif|sign(?:s|ed)?|break ground|entitl|rezon|permit)/i;
  const offenders = [];
  for (const issue of issues) {
    const text = spanText((issue.lede || []).flatMap(b => b.spans || []));
    if (!/The month's main decision/.test(text)) continue;
    const title = issue.lead && issue.lead.title;
    if (title && !DECISION.test(title)) {
      offenders.push(`${issue.month}: called a decision but the headline is "${title}"`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('written prose carries no em dash', () => {
  // The house style forbids it. A publisher's own words are left as they were.
  const offenders = writtenText()
    .filter(p => /[—–]/.test(p.text))
    .map(p => `${p.issue} / ${p.where}`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('a pipeline figure counts each address once', () => {
  // Curated city records and the state annual reports describe the same sites. Combined without
  // reconciling them, every issue printed "1,792 developments carrying 76,796 reported homes"
  // where 1,766 distinct addresses carry 74,973. The generator now collapses them on the same
  // address key the dashboard uses, so a figure in an issue and a figure on the site agree.
  const claims = [];
  for (const issue of issues) {
    for (const section of issue.sections || []) {
      for (const block of section.blocks || []) {
        if (block.kind !== 'para') continue;
        const text = spanText(block.spans);
        const m = text.match(/add up to ([\d,]+) developments? carrying ([\d,]+) reported homes/);
        if (m) claims.push({ issue: issue.month, records: Number(m[1].replace(/,/g, '')), homes: Number(m[2].replace(/,/g, '')) });
      }
    }
  }
  assert.ok(claims.length > 0, 'at least one issue should state a pipeline figure');
  // An average tells us nothing here: an early issue with ten published records, one of them a
  // 4,000-home master plan, legitimately averages hundreds of homes each. What matters is that
  // the figure was built from distinct addresses, so the generator is checked for the key it
  // reconciles them with, and tests/address-key.test.js proves that key works.
  const generator = readFileSync(new URL('../scripts/build-newsletter.mjs', import.meta.url), 'utf8');
  assert.match(generator, /const pipelineByAddress = new Map\(\)/,
    'the pipeline must be collapsed by address before it is counted');
  assert.match(generator, /addressKey\(r\.title\)/,
    'and collapsed with the same address key the dashboard uses');
  assert.match(generator, /import '\.\.\/public\/housing-data\.js'/,
    'which means importing the shared helper rather than reimplementing it');
  for (const c of claims) {
    assert.ok(c.records > 0 && c.homes > 0, `${c.issue}: a pipeline figure should be positive`);
    assert.ok(c.homes >= c.records, `${c.issue}: ${c.records} developments cannot carry ${c.homes} homes`);
  }
});
