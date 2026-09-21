import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const letter = JSON.parse(readFileSync(new URL('../public/data/newsletter.json', import.meta.url), 'utf8'));
const research = JSON.parse(readFileSync(new URL('../data/newsletter-research.json', import.meta.url), 'utf8'));
const issues = letter.issues;
const statsOf = issue => issue.sections.flatMap(s => s.stats || []);
const prose = section => (section.blocks || []).filter(b => b.kind === 'para')
  .map(b => b.spans.map(sp => sp.v).join('')).join(' ');
const dated = issue => {
  const out = [];
  for (const section of issue.sections) {
    (section.items || []).forEach(i => out.push(i));
    (section.records || []).forEach(r => out.push(r));
    (section.spotlights || []).forEach(s => {
      if (s.latest) out.push(s.latest);
      (s.pipeline || []).forEach(p => out.push(p));
    });
  }
  return out;
};

test('the archive runs monthly from April 2025 to September 2026, newest first', () => {
  assert.equal(issues.length, 18);
  assert.equal(issues[0].id, '2026-09');
  assert.equal(issues[issues.length - 1].id, '2025-04');
  issues.forEach((issue, i) => {
    assert.equal(issue.number, issues.length - i);
    if (i) assert.ok(issues[i - 1].id > issue.id, 'issues descend by month');
  });
});

test('each issue goes out between the 23rd and the 30th of its month', () => {
  for (const issue of issues) {
    assert.equal(issue.date.slice(0, 7), issue.id);
    const day = Number(issue.date.slice(8));
    assert.ok(day >= 23 && day <= 30, `${issue.id} went out on day ${day}`);
  }
});

// The promise the whole feature rests on: an issue may not contain anything that was published
// after it. A back issue has to read the way that month actually read.
test('no issue contains anything published after its own date', () => {
  for (const issue of issues) {
    for (const item of dated(issue)) {
      if (!item.date) continue;
      assert.ok(item.date <= issue.date, `${issue.id} carries an item dated ${item.date}: ${item.title}`);
    }
    for (const source of issue.sources) {
      if (source.date) assert.ok(source.date <= issue.date, `${issue.id} cites a source dated ${source.date}`);
    }
  }
});

test('researched events appear no earlier than the day they were published', () => {
  const byUrl = new Map(research.items.map(i => [i.url, i.date]));
  for (const issue of issues) {
    for (const source of issue.sources) {
      const when = byUrl.get(source.url);
      if (!when) continue;
      const [y, m] = when.split('-').map(Number);
      const available = when.length === 7 ? new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) : when;
      assert.ok(available <= issue.date, `${issue.id} cites ${source.url} dated ${when}`);
    }
  }
});

test('state and federal releases only appear once they had been published', () => {
  for (const issue of issues) {
    const text = JSON.stringify(issue);
    const stats = statsOf(issue);
    // Reporting year 2024's rows were published in June 2025, reporting year 2025's in June 2026.
    if (issue.date < '2025-06-01') assert.equal(issue.counts.aprReleased, 0, `${issue.id} released annual-report records too early`);
    if (issue.date < '2026-06-01') assert.ok(!/published the 2025 annual progress reports/.test(text), `${issue.id} announces an unpublished release`);
    if (issue.counts.aprReleased) assert.ok(['2025-06', '2026-06'].includes(issue.id), `${issue.id} released records outside a filing window`);
    if (issue.date < '2025-12-11') assert.ok(!stats.some(s => /ACS/.test(s.vintage)), `${issue.id} quotes ACS before its release`);
    if (issue.date < '2026-08-01') {
      assert.ok(!stats.some(s => /RHNA Progress/.test(s.vintage)), `${issue.id} quotes RHNA progress too early`);
      assert.ok(!/% permitted/.test(text), `${issue.id} quotes RHNA progress in prose too early`);
    }
    for (const stat of stats.filter(s => /Zillow/.test(s.vintage))) {
      const year = Number(stat.vintage.match(/(\d{4})/)[1]);
      assert.ok(`${year}-08-20` <= issue.date, `${issue.id} quotes the ${year} Zillow index too early`);
    }
    // A chart may only plot years the issue was allowed to know.
    for (const point of issue.charts.market) {
      assert.ok(`${point.year}-08-20` <= issue.date, `${issue.id} charts the ${point.year} index too early`);
    }
    // What to watch is only what was already on the calendar.
    const watch = issue.sections.find(s => s.kind === 'watch');
    if (issue.date < '2025-10-10') assert.ok(!watch.watch.some(w => /SB 79/.test(w.what)), `${issue.id} previews SB 79 before it was signed`);
    if (issue.date < '2025-10-13') assert.ok(!watch.watch.some(w => /transit sales tax/.test(w.what)), `${issue.id} previews the ballot measure before SB 63`);
  }
});

test('every issue is a full article: lead, the four topic sections, nine counties and sources', () => {
  for (const issue of issues) {
    const ledeWords = issue.lede.filter(b => b.kind === 'para').map(b => b.spans.map(sp => sp.v).join('')).join(' ').split(/\s+/).length;
    assert.ok(ledeWords >= 45, `${issue.id} has a thin lede of ${ledeWords} words`);
    assert.ok(issue.hero && issue.hero.url.startsWith('/img/cities/'), `${issue.id} has no hero photograph`);
    assert.ok(issue.lead && issue.lead.title, `${issue.id} has no lead story`);
    const kinds = issue.sections.map(s => s.kind);
    for (const required of ['housing', 'developments', 'transport', 'watch']) {
      assert.ok(kinds.includes(required), `${issue.id} is missing its ${required} section`);
    }
    assert.equal(issue.sections.filter(s => s.kind === 'county').length, 9);
    assert.ok(issue.sections.find(s => s.kind === 'watch').watch.length, `${issue.id} watches nothing`);
    for (const source of issue.sources) {
      assert.ok(/^https?:\/\//.test(source.url), `${issue.id} has a source that is not a link`);
      assert.ok(source.label, `${issue.id} has an unlabelled source`);
    }
  }
});

test('the run of issues leaves no gap between one dateline and the next', () => {
  const ordered = [...issues].reverse();
  ordered.forEach((issue, i) => {
    if (!i) return;
    const previous = ordered[i - 1].date;
    assert.ok(previous < issue.date, `${issue.id} does not follow ${ordered[i - 1].id}`);
    const gap = (new Date(issue.date) - new Date(previous)) / 86400000;
    // Datelines float between the 23rd and the 30th, so consecutive issues sit 21 to 39 days apart.
    assert.ok(gap >= 21 && gap <= 39, `${ordered[i - 1].id} to ${issue.id} is a ${gap}-day gap`);
  });
});

test('issues are written as prose, with links inside sentences rather than a list of them', () => {
  for (const issue of issues) {
    const paragraphs = [...issue.lede, ...issue.sections.flatMap(s => s.blocks || [])].filter(b => b.kind === 'para');
    assert.ok(paragraphs.length >= 12, `${issue.id} has only ${paragraphs.length} paragraphs`);
    const sizes = paragraphs.map(b => b.spans.map(sp => sp.v).join('').split(/\s+/).length).sort((a, b) => a - b);
    assert.ok(sizes[Math.floor(sizes.length / 2)] >= 45, `${issue.id} has a median paragraph of ${sizes[Math.floor(sizes.length / 2)]} words`);
    const words = paragraphs.map(b => b.spans.map(s => s.v).join('')).join(' ').split(/\s+/).length;
    assert.ok(words >= 700, `${issue.id} runs to only ${words} words`);
    for (const block of paragraphs) {
      // A paragraph that is nothing but a link is a list entry wearing a paragraph's clothes.
      const text = block.spans.filter(s => s.t === 'text').map(s => s.v).join('').trim();
      assert.ok(text.length > 20, `${issue.id} has a paragraph that is only a link`);
    }
    // Citations belong inside sentences and in the drawer at the bottom, not as bare lists.
    assert.ok(!issue.sections.some(s => Array.isArray(s.items) && s.items.length), `${issue.id} still renders a bare item list`);
  }
});

// The prose written here has a house style: no em dashes, no staged run-ups, no closers that
// repeat the point, nothing that reads as though it were assembled after the fact. Spans marked q
// are a publisher's own words and are left exactly as they were written.
const written = issue => [...issue.lede, ...issue.sections.flatMap(s => s.blocks || [])]
  .filter(b => b.kind === 'para').flatMap(b => b.spans)
  .filter(sp => sp.t === 'text' && !sp.q).map(sp => sp.v).join(' ');

test('the written prose keeps to the house style', () => {
  const tells = [
    /—/, /–/,                                        // em and en dashes as connectors
    /\bit'?s not just\b/i, /\bisn'?t just\b/i, /\bnot only\b.*\bbut\b/i,
    /\bat its core\b/i, /\blet'?s dive\b/i, /\bthat is the real\b/i,
    /\brather than evidence\b/i, /\bworth saying plainly\b/i,
    /\bdelve\b/i, /\btestament\b/i, /\blandscape\b/i, /\bshowcas/i, /\bboasts\b/i,
    /\bpivotal\b/i, /\bthe future looks\b/i, /\bexperts believe\b/i,
    /\bthis dashboard\b/i, /\bthis issue could not\b/i, /\bnot published yet\b/i,
  ];
  for (const issue of issues) {
    const text = written(issue);
    for (const tell of tells) assert.ok(!tell.test(text), `${issue.id} contains ${tell}: ${(text.match(tell) || [])[0]}`);
  }
});

test('an issue runs overview, housing, developments, transportation, counties, then what to look for', () => {
  for (const issue of issues) {
    const kinds = issue.sections.map(s => s.kind);
    const order = ['overview', 'housing', 'developments', 'transport', 'county', 'watch'];
    const seen = kinds.filter(k => order.includes(k));
    let at = -1;
    for (const kind of seen) {
      const rank = order.indexOf(kind);
      assert.ok(rank >= at, `${issue.id} puts ${kind} out of order`);
      at = rank;
    }
    for (const required of ['overview', 'housing', 'transport', 'watch']) {
      assert.ok(kinds.includes(required), `${issue.id} is missing ${required}`);
    }
    assert.ok(!issue.sections.some(s => (s.notYet || []).length), `${issue.id} still carries a not-published-yet box`);
  }
});

test('counties with nothing published are said to be quiet rather than left out', () => {
  const quiet = issues.flatMap(i => i.sections.filter(s => s.kind === 'county' && s.quiet));
  assert.ok(quiet.length, 'expected at least one quiet county across the archive');
  quiet.forEach(section => {
    // The county still gets its standing profile; the quiet note closes it.
    assert.ok(/Nothing was published/.test(prose(section)), section.county);
    assert.equal(section.count, 0);
  });
});
