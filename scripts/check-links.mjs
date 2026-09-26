// Checks every official link the dashboard publishes. Not part of `npm test` - it makes several
// hundred network requests and depends on other people's servers being up - so run it by hand:
//
//   node scripts/check-links.mjs            all links
//   node scripts/check-links.mjs gilroy     only hosts matching a string
//
// Two things it looks for, because only one of them is obvious:
//
//   DEAD      the link 404s.
//   MOVED     the link 200s, but after following redirects it lands somewhere whose path bears
//             no relation to what was asked for. This is the dangerous one. Gilroy renumbered
//             its CivicPlus pages and /193/Planning-Division began serving a HIPAA PDF, with a
//             perfectly healthy 200 the whole time.
//
// Sites behind Akamai or Cloudflare return 403, and sometimes a plain 404, to anything that does
// not look like a browser, so the request below carries a full set of browser headers. Without
// them this reports about eighty false failures across Mountain View, Sunnyvale and San Jose.
import { readFileSync } from 'node:fs';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const filter = process.argv[2];
const links = [...new Set([...html.matchAll(/(?:url|link|planning|meetings|source|sourceUrl):\s*'(https?:\/\/[^']+)'/g)].map(m => m[1]))]
  .filter(u => !filter || u.includes(filter));

const words = s => new Set(decodeURIComponent(s).toLowerCase().match(/[a-z]{4,}/g) || []);
// A redirect within a site's own section structure is normal. Landing on a path that shares no
// meaningful word with the one requested is how a renumbered page shows itself.
function landedElsewhere(from, to) {
  if (!to || to === from) return false;
  const a = new URL(from), b = new URL(to);
  if (a.host !== b.host) return false;             // a move to another domain is usually deliberate
  if (b.pathname === '/' || b.pathname === a.pathname) return false;
  const asked = words(a.pathname), got = words(b.pathname);
  if (!asked.size) return false;
  return ![...asked].some(w => got.has(w));
}

async function check(url, tries = 2) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 20000);
      const res = await fetch(url, { redirect: 'follow', headers: HEADERS, signal: abort.signal });
      clearTimeout(timer);
      return { url, status: res.status, final: res.url };
    } catch (err) {
      if (attempt === tries) return { url, status: 'ERR', error: String(err.message).slice(0, 60) };
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

console.log(`Checking ${links.length} links\n`);
const results = [];
const queue = [...links];
let done = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    results.push(await check(queue.shift()));
    if (++done % 100 === 0) process.stderr.write(`  ${done}/${links.length}\n`);
  }
}));

const dead = results.filter(r => r.status !== 'ERR' && r.status >= 400);
const moved = results.filter(r => r.status === 200 && landedElsewhere(r.url, r.final));
const unreachable = results.filter(r => r.status === 'ERR');

for (const r of dead) console.log(`DEAD   ${r.status}  ${r.url}`);
for (const r of moved) console.log(`MOVED       ${r.url}\n            -> ${r.final}`);
for (const r of unreachable) console.log(`UNREACHABLE ${r.error}  ${r.url}`);

console.log(`\n${results.length} checked - ${dead.length} dead, ${moved.length} landing elsewhere, ${unreachable.length} unreachable.`);
if (unreachable.length) console.log('Unreachable usually means the host was slow or refused this machine, not that the link is broken. Re-run those before changing them.');
process.exit(dead.length || moved.length ? 1 : 0);
