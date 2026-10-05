import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_ARTICLES } from '../data/news.js';
import { scan } from '../scripts/check-copy.mjs';

// The copy on this site is held to the AI writing tells in scripts/lib/copy-patterns.mjs, which
// follow the "humanizer" skill (https://github.com/blader/humanizer) and Wikipedia's "Signs of AI
// writing". A strong tell is one a careful writer almost never produces on purpose, so one
// sighting fails. Run `node scripts/check-copy.mjs` to see the hits, or `--all` to include the
// weak tells that only count with company.
test('no reader-facing copy carries a strong AI writing tell', () => {
  const findings = scan().filter(f => f.strength === 'strong');
  const report = findings.map(f => `${f.file}:${f.line}  §${f.id} ${f.name} [${f.match}]\n    "${f.text.slice(0, 140)}"`);
  assert.deepEqual(report, [],
    `Rewrite these, then rerun. ${findings.length} tell(s):\n${report.join('\n')}`);
});

// Headlines come from publisher feeds and the article text is not ours to copy, so most news rows
// carry no summary. They used to carry a stand-in sentence that named the publisher and said
// nothing else, which the source line under the headline already said. A row with no summary now
// renders as a headline alone.
test('no news row carries a stand-in summary instead of a real one', () => {
  const filler = [
    /Open the original story through Google News/i,
    /Read the city.s original update for details/i,
    /^Reporting from [^.]+\.\s*$/i,
  ];
  const offenders = NEWS_ARTICLES
    .filter(a => a.snippet && filler.some(re => re.test(a.snippet)))
    .map(a => `${a.city}: ${a.title.slice(0, 60)}`);
  assert.deepEqual(offenders, [],
    'A summary that only names the publisher adds nothing. Leave snippet empty instead.');
});

// A feed excerpt that stops mid-sentence reads as broken text under the headline. Excerpts are
// quotations, so they are shortened to their last complete sentence rather than rewritten.
test('no news summary stops mid-sentence', () => {
  const offenders = NEWS_ARTICLES
    .filter(a => /(?:\.\.\.|…)\s*$/.test(a.snippet || ''))
    .map(a => `${a.city}: …${(a.snippet || '').slice(-70)}`);
  assert.deepEqual(offenders, [],
    'Trim the excerpt to its last complete sentence; do not write a new ending for it.');
});

// Every renderer that prints a summary has to cope with the ones that have none. An empty
// paragraph still takes its margin, which left a gap under the headline that read as a dropped
// sentence.
test('summaries that exist are real sentences', () => {
  const tooShort = NEWS_ARTICLES
    .filter(a => {
      const s = (a.snippet || '').trim();
      return s && s.length < 25;
    })
    .map(a => `${a.city}: ${JSON.stringify(a.snippet)}`);
  assert.deepEqual(tooShort, [],
    'A summary shorter than this is a fragment. Leave it empty or give it a full sentence.');
});
