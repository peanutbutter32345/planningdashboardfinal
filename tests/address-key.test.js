// One address, written two ways, is one project. The key that decides this is what stops a
// record from the state annual reports being added on top of a researched record for the same
// site, and what stops a total counting the same homes twice.
//
// The old key read an address with a regex that wanted "<number> <word>", which a numeric ordinal
// defeated: "1248 5th Avenue" fell through to its raw text while "1248 Fifth Ave" produced a key,
// so the pair never matched. It also took the number after the hyphen in a range, keying
// "1855-81 Rollins Road" on 81, and its truncated form collided with unrelated addresses: every
// "480 E <anything>" in San Mateo keyed as "480:east:". That fused 42 distinct addresses and
// silently dropped 32 real records from the dashboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/housing-data.js';
import { PROJECTS } from '../data/projects.js';

const { addressKey, sumUnits } = globalThis.DashboardHousing;

test('the same address written two ways gives one key', () => {
  const same = [
    ['1248 5th Avenue', '1248 Fifth Ave'],          // a numeric ordinal against a spelled one
    ['1030 3rd Street', '1030 3rd St'],             // a suffix spelled out against its short form
    ['480 E 4th', '480 E 4TH Ave'],                 // case, and a missing suffix
    ['1855-81 Rollins Road', '1855-1881 Rollins Rd'], // two ways of writing one range
    ['732-740 El Camino Real', '732 El Camino Real'], // a range against its first parcel
    ['Howard Ave', 'Howard Avenue'],                // no street number at all
    ['100 Main St, Burlingame, CA', '100 Main Street'], // a city and state tail
  ];
  for (const [a, b] of same) {
    assert.equal(addressKey(a), addressKey(b), `"${a}" and "${b}" are the same address`);
  }
});

test('addresses that only look alike keep separate keys', () => {
  const different = [
    ['100 Main St', '200 Main St'],
    ['480 E 4th Ave', '480 W 4th Ave'],
    // HCD files one row per permitted dwelling, so the unit designator is the record's identity:
    // "992 HELEN AV Unit: 1" is an accessory unit, not the house it stands behind.
    ['992 HELEN AV Unit: 1', '992 Helen Avenue'],
    // Three buildings of three homes each, at one address. Folding them together loses six homes.
    ['4188 Alpine Rd Bldg B', '4188 Alpine Rd Bldg C'],
    ['1112 ALTHEA TR Unit: 1', '1106 ALTHEA TR Unit: 1'],
  ];
  for (const [a, b] of different) {
    assert.notEqual(addressKey(a), addressKey(b), `"${a}" and "${b}" are different records`);
  }
});

test('the key never collapses to nothing', () => {
  for (const value of ['', null, undefined, '   ', '---']) {
    assert.equal(typeof addressKey(value), 'string', 'a key is always a string');
  }
  // A real address must produce something that distinguishes it.
  assert.ok(addressKey('1 AMD Place').length > 2);
});

test('records from the state reports no longer duplicate a researched record', () => {
  // Every remaining same-address pair is between two curated records, which this merge cannot
  // reach: it only compares incoming rows against what is already there. Those pairs are listed
  // by `node scripts/check-duplicates.mjs` for a person to resolve against the city's own file.
  const groups = new Map();
  for (const p of PROJECTS) {
    const id = `${p.city}|${addressKey(p.addr)}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(p);
  }
  const fromReports = [...groups.values()]
    .filter(g => g.length > 1 && g.some(p => /^hcd-/.test(p.id)))
    .map(g => `${g[0].city} ${g[0].addr}: ${g.map(p => p.id).join(' + ')}`);
  assert.deepEqual(fromReports, [],
    `A state annual report row was added on top of a record for the same address:\n${fromReports.join('\n')}`);
});

test('a total counts each address once', () => {
  // Two records for one address, the same project filed at two stages, both reporting its homes.
  const sameSite = [
    { city: 'burlingame', addr: '1855-81 Rollins Road', units: 420 },
    { city: 'burlingame', addr: '1855-1881 Rollins Rd', units: 420 },
  ];
  assert.equal(sumUnits(sameSite), 420, 'one project, counted once');
  assert.equal(sameSite.reduce((s, r) => s + r.units, 0), 840, 'adding them plainly doubles it');

  // Where two filings disagree, the larger stands: the conservative reading of a pipeline.
  assert.equal(sumUnits([
    { city: 'x', addr: '1 A St', units: 95 },
    { city: 'x', addr: '1 A Street', units: 136 },
  ]), 136);

  // Different cities, same street name, stay separate.
  assert.equal(sumUnits([
    { city: 'a', addr: '100 Main St', units: 10 },
    { city: 'b', addr: '100 Main St', units: 10 },
  ]), 20);

  // The All Cities aggregate tags its rows with _sourceCity instead of city.
  assert.equal(sumUnits([
    { _sourceCity: 'a', addr: '100 Main St', units: 10 },
    { _sourceCity: 'b', addr: '100 Main St', units: 10 },
  ]), 20);

  assert.equal(sumUnits([]), 0);
  assert.equal(sumUnits(null), 0);
  // A missing or nonsense count contributes nothing rather than NaN.
  assert.equal(sumUnits([{ city: 'x', addr: '1 A St' }, { city: 'x', addr: '2 B St', units: 5 }]), 5);
});

test('the affordable total is deduplicated the same way', () => {
  const rows = [
    { city: 'sanbruno', addr: '732-740 El Camino Real', units: 134, bmr: 40 },
    { city: 'sanbruno', addr: '732 El Camino Real', units: 134, bmr: 133 },
  ];
  assert.equal(sumUnits(rows), 134);
  assert.equal(sumUnits(rows, 'bmr'), 133);
});
