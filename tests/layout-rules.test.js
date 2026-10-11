// Three layout faults, each from one rule quietly overriding another in a single stylesheet of
// about 1,700 lines. All three were visible in a browser and invisible in the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = indexHtml.slice(indexHtml.indexOf('<style>'), indexHtml.indexOf('</style>'));

test('the overview stat grid is scoped so the Statistics screen cannot claim it', () => {
  // Both screens called their grid .stat-grid. The Statistics rule is written later, so its
  // three columns won everywhere, and the overview's four cards laid out three across with the
  // fourth alone on a row.
  // Scoping is what settles it, whatever order the rules are written in: .stats .stat-grid has
  // the higher specificity, so the Statistics screen's plain .stat-grid can no longer reach the
  // overview. Counting the unscoped rules would only describe the stylesheet's current shape.
  const overviewRule = css.match(/\.stats\s+\.stat-grid\s*\{[^}]*\}/);
  assert.ok(overviewRule, 'the overview grid must be scoped under .stats');
  assert.ok(/auto-fit/.test(overviewRule[0]),
    'and should fill its row whatever the number of cards');
});

test('a screen shell never cancels the gutter its wrapper provides', () => {
  // .wrap gives every screen 22px of side padding, 16px on a phone. .nl-shell sits on the same
  // element and used the shorthand "padding:26px 0 40px", whose 0 replaced that gutter, so the
  // newsletter masthead and sidebar touched the window edge while every other screen kept its
  // margin. Writing the axes separately leaves the horizontal padding alone.
  // Only the shells that actually sit on the same element as .wrap can cancel its padding.
  // .planner-shell and .ask-shell are inner divs, so "padding:30px 0" on them is harmless and
  // must not be reported. The markup decides which is which, so the list is read from it.
  const shared = new Set();
  for (const m of indexHtml.matchAll(/class="([^"]*\bwrap\b[^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls !== 'wrap' && cls) shared.add(cls);
  }
  assert.ok(shared.size > 0, 'some element should combine .wrap with a shell class');
  const offenders = [];
  for (const cls of shared) {
    const rule = css.match(new RegExp('\\.' + cls + '\\s*\\{([^}]*)\\}'));
    if (!rule) continue;
    const body = rule[1];
    // Read the horizontal value out of the shorthand rather than looking for a zero anywhere in
    // it: "padding:0 12px" has no vertical padding and a 12px gutter, which is fine, while
    // "padding:26px 0 44px" is the shape that wipes the gutter.
    const shorthand = body.match(/(?:^|;)\s*padding\s*:\s*([^;}]+)/);
    if (!shorthand) continue;
    const parts = shorthand[1].trim().split(/\s+/);
    const horizontal = parts.length === 1 ? parts[0] : parts[1];
    if (/^0[a-z%]*$/.test(horizontal)) {
      offenders.push(`.${cls} { padding: ${shorthand[1].trim()} }`);
    }
  }
  assert.deepEqual(offenders, [],
    `These cancel the gutter from .wrap. Set padding-top and padding-bottom instead:\n${offenders.join('\n')}`);
});

test('the map fallback message cannot be appended twice', () => {
  // overviewMapFallback is reached from Google's auth callback, the script tag's onerror and a
  // twelve second timeout. All three fire for one failure, and each appended the same sentence,
  // so the status line carried it twice behind a separator with nothing in front of it.
  assert.match(indexHtml, /let overviewFallbackDone\s*=\s*false/,
    'the fallback must only run its work once');
  assert.match(indexHtml, /if\(overviewFallbackDone\)return;/,
    'and return early on the second and third trigger');
  assert.doesNotMatch(indexHtml, /overviewMapStatus'\)\.textContent\+=/,
    'appending to the status line is what allowed it to repeat');
});

test('the map gate does not say it is loading once it has failed', () => {
  // The panel kept its "Loading the map..." heading under the failure message, so a reader was
  // told the map was loading and unavailable at the same time.
  assert.match(indexHtml, /heading\)heading\.textContent='Map unavailable'/,
    'the heading must change when the map library is missing');
});
