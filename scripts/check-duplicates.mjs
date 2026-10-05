#!/usr/bin/env node
// Lists addresses that carry more than one project record.
//
//     node scripts/check-duplicates.mjs
//
// Records from the state annual reports are kept out of this by the merge in
// public/housing-data.js, which compares an incoming row against what is already there. What it
// cannot reach is two curated records for one address, because neither is incoming: the same
// project was researched twice and filed under two spellings, usually at two different stages.
//
// Reading the pairs shows that neither record is redundant. They come from different sources and
// carry different facts about one site. At 788 San Antonio Ave in Palo Alto, one record holds the
// city pipeline layer's parcel numbers and the other the planning file number and the entitlement
// date. At 1855 Rollins Road in Burlingame, one is the approval in September 2022 and the other
// the building permit a year later. Deleting either would lose sourced information, so nothing
// here is removed, by this script or by hand on its say-so.
//
// What the duplication did break was arithmetic: a total that added both reported homes that do
// not exist. The site's totals go through DashboardHousing.sumUnits, which counts each address
// once, so the figures are right. What remains is presentation, because a reader browsing the
// register still sees one site as two entries.
//
// Exits 0 always. This is a report, not a gate.

import { readFileSync } from 'node:fs';
import '../public/housing-data.js';
import { PROJECTS } from '../data/projects.js';

const { addressKey } = globalThis.DashboardHousing;

const groups = new Map();
for (const project of PROJECTS) {
  const id = `${project.city}|${addressKey(project.addr)}`;
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(project);
}

const duplicates = [...groups.entries()]
  .filter(([, rows]) => rows.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

if (!duplicates.length) {
  console.log('No address carries more than one record.');
  process.exit(0);
}

const STAGE_ORDER = ['proposed', 'review', 'approved', 'construction', 'completed'];
const later = rows => [...rows].sort((a, b) =>
  STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage))[0];

let homesAtRisk = 0;
console.log(`${duplicates.length} address${duplicates.length === 1 ? '' : 'es'} carry more than one record.\n`);

for (const [id, rows] of duplicates) {
  const [city] = id.split('|');
  const counts = new Set(rows.map(r => r.units || 0));
  const agree = counts.size === 1;
  const largest = Math.max(...rows.map(r => r.units || 0));
  homesAtRisk += rows.reduce((sum, r) => sum + (r.units || 0), 0) - largest;

  console.log(`${city}  ${rows[0].addr}`);
  for (const r of rows) {
    const mark = r === later(rows) ? ' <- latest stage' : '';
    console.log(`   ${r.id}`);
    console.log(`     "${r.addr}"  ${r.units ?? '-'} homes, ${r.bmr ?? '-'} affordable, ${r.stage}${mark}`);
  }
  console.log(agree
    ? '   Both report the same number of homes: two filings for one project.'
    : `   They disagree on the count (${[...counts].join(' vs ')}), which is worth checking against the city's file.`);
  console.log();
}

console.log(`Homes that would be counted twice if a total added every record: ${homesAtRisk.toLocaleString()}.`);
console.log("The site's totals already count each address once, so no figure is wrong today.");
