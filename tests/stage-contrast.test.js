// The stage colours are a light-to-dark ramp, and text sits directly on them in three places:
// the project card badge, the activity feed tag, and the funnel segments on the overview. White
// text on the light end of that ramp is not readable. Measured before this test existed: 2.37:1
// on the Proposed badge, and 1.92:1 over the light stop of the Proposed funnel gradient, against
// the 4.5:1 that text under 18px needs.
//
// Each stage therefore carries an `ink`, and each funnel gradient spans one step of that stage's
// own scale, chosen so the ink clears 4.5:1 at both ends. This checks the arithmetic directly
// rather than through a browser, so it runs with the rest of the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function stages() {
  const start = indexHtml.indexOf('const STAGES = [');
  const end = indexHtml.indexOf('const STAGE_MAP');
  if (start < 0 || end <= start) throw new Error('STAGES block moved; update this test.');
  return vm.runInNewContext(indexHtml.slice(start, end) + ';STAGES', {}, { timeout: 2000 });
}

const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// 4.5:1 is the threshold for text below 18px, and every one of these is 9.5px to 20px.
const MIN = 4.5;

test('every stage names the ink that goes on it', () => {
  for (const s of stages()) {
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(s.ink || ''), `${s.key} needs an ink colour`);
  }
});

test('badge text is readable on every stage colour', () => {
  const failures = [];
  for (const s of stages()) {
    const r = contrast(s.ink, s.color);
    if (r < MIN) failures.push(`${s.key}: ${s.ink} on ${s.color} = ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, [], `Stage badges below ${MIN}:1:\n${failures.join('\n')}`);
});

test('funnel segment text is readable across the whole gradient', () => {
  // Mirrors the ramp the renderer builds: white ink takes the darker half of the scale, dark ink
  // the lighter half. Both ends are checked, because hover slides the gradient across the button.
  const failures = [];
  for (const s of stages()) {
    const ends = s.ink === '#FFFFFF' ? [s.color, s.dark] : [s.light, s.color];
    for (const end of ends) {
      const r = contrast(s.ink, end);
      if (r < MIN) failures.push(`${s.key}: ${s.ink} on ${end} = ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, [], `Funnel gradient ends below ${MIN}:1:\n${failures.join('\n')}`);
});

test('the renderer builds the ramp from the stage ink, not a fixed sweep', () => {
  // If someone restores the old light-to-dark sweep for every stage, the arithmetic above still
  // passes while the page regresses, so the shape of the renderer is pinned too.
  assert.match(indexHtml, /const ramp = s\.ink === '#FFFFFF'/,
    'the funnel gradient must branch on the stage ink');
  assert.match(indexHtml, /--seg-ink:\$\{s\.ink\}/,
    'the segment must pass its ink to CSS so the label and count use it');
  assert.match(indexHtml, /const stampStyle = st =>/,
    'badges must go through one helper so the call sites cannot drift');
});
