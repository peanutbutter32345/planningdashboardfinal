import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const letter = JSON.parse(readFileSync(new URL('../public/data/newsletter.json', import.meta.url), 'utf8'));
const issues = letter.issues;
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

test('the archive is twelve monthly issues, newest first', () => {
  assert.equal(issues.length, 12);
  assert.equal(issues[0].id, '2026-09');
  assert.equal(issues[issues.length - 1].id, '2025-10');
  issues.forEach((issue, i) => {
    assert.equal(issue.number, issues.length - i);                    // numbered oldest-first
    assert.equal(issue.date, issue.date.slice(0, 7) === issue.id ? issue.date : null, issue.id);
    if (i) assert.ok(issues[i - 1].id > issue.id, 'issues descend by month');
  });
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

test('state and federal releases only appear once they had been published', () => {
  for (const issue of issues) {
    const text = JSON.stringify(issue);
    // HCD's 2025 annual reports are filed the following April; nothing before June 2026 may quote them.
    if (issue.date < '2026-06-01') {
      assert.equal(issue.counts.aprReleased, 0, `${issue.id} released annual-report records too early`);
      assert.ok(!/annual progress reports this month/.test(text), `${issue.id} announces an unpublished release`);
    }
    // The 2020-2024 ACS five-year estimates came out in December 2025.
    if (issue.date < '2025-12-11') {
      assert.ok(!issue.stats.some(s => /ACS/.test(s.vintage)), `${issue.id} quotes ACS before its release`);
    }
    // The RHNA progress file this site carries is the August 2026 vintage.
    if (issue.date < '2026-08-01') {
      assert.ok(!issue.stats.some(s => /RHNA Progress/.test(s.vintage)), `${issue.id} quotes RHNA progress too early`);
      assert.ok(!/% permitted/.test(text), `${issue.id} quotes RHNA progress in prose too early`);
    }
    // A Zillow index point is that year's 31 July value, published weeks later.
    for (const stat of issue.stats.filter(s => /Zillow/.test(s.vintage))) {
      const year = Number(stat.vintage.match(/(\d{4})/)[1]);
      assert.ok(`${year}-08-20` <= issue.date, `${issue.id} quotes the ${year} Zillow index too early`);
    }
  }
});

test('every issue says what it could not know, and every source is a link', () => {
  for (const issue of issues) {
    assert.ok(issue.lede.length, `${issue.id} has no lede`);
    assert.ok(issue.sections.some(s => s.kind === 'county'), `${issue.id} has no county coverage`);
    assert.equal(issue.sections.filter(s => s.kind === 'county').length, 9);
    if (issue.id !== '2026-09') assert.ok(issue.blind.length, `${issue.id} claims to know everything`);
    for (const source of issue.sources) {
      assert.ok(/^https?:\/\//.test(source.url), `${issue.id} has a source that is not a link`);
      assert.ok(source.label, `${issue.id} has an unlabelled source`);
    }
  }
});

test('counties with nothing published are said to be quiet rather than left out', () => {
  const quiet = issues.flatMap(i => i.sections.filter(s => s.kind === 'county' && s.quiet));
  assert.ok(quiet.length, 'expected at least one quiet county across the archive');
  quiet.forEach(section => {
    // The standing county profile comes first; the quiet note is the last thing said.
    assert.ok(section.paragraphs.some(p => /No published record/.test(p)), section.county);
    assert.ok(/absence of reporting/.test(section.paragraphs.at(-1)), section.county);
    assert.equal(section.items.length, 0);
  });
});
