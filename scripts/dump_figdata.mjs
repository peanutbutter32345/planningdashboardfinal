// Dumps the inputs scripts/make_figures.py draws from, straight out of the site's own data, so the
// charts are always built from exactly what the page shows:
//
//     node scripts/dump_figdata.mjs > /tmp/figdata.json && python3 scripts/make_figures.py
//
// The project records live inline in public/index.html (there is no build step), so they are read
// out of that file by bracket-matching each `const X_DATA = [...]` - string-aware, so a bracket
// inside an address cannot end an array early.
import fs from 'fs';
import { CITY_STATS } from '../data/stats.js';
import { RHNA } from '../data/rhna.js';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function closeOf(s, i) {
  let depth = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if ('[{('.includes(ch)) depth++;
    else if (']})'.includes(ch) && --depth === 0) return j;
  }
  throw new Error('unbalanced literal at ' + i);
}
function constValue(name) {
  const m = html.match(new RegExp('const ' + name + ' = ([\\[{])'));
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  return Function('"use strict"; return (' + html.slice(start, closeOf(html, start) + 1) + ');')();
}

// The same rule the page uses to decide what counts as housing.
const isHousing = d => d.type === 'Residential' || d.type === 'Mixed Use';

const cities = {};
for (const [, key, label, data, join] of html.matchAll(
    /\n  ([a-z]+): \{label:'([^']*)'[^\n]*?data:(\w+),[^\n]*?join:(\w+),/g)) {
  const rows = constValue(data) || [];
  const s = CITY_STATS[key] || {};
  const r = RHNA[key];
  const pipeline = rows.filter(d => isHousing(d) && d.stage !== 'completed')
                       .reduce((a, d) => a + (d.units || 0), 0);
  cities[key] = {
    label,
    homeValueSeries: s.homeValueSeries || null,
    rentSeries: s.rentSeries || null,
    rhna: r ? { vli: r.vli, li: r.li, mod: r.mod, above: r.above } : null,
    commute: s.meanCommuteMin || null,
    pipelineUnits: pipeline || null,
    commissions: (constValue(join) || []).length || null,
  };
}
process.stdout.write(JSON.stringify({ cities }));
