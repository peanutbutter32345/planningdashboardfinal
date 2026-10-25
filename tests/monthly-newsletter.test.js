import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/pglite-loader.mjs', import.meta.url);
process.env.DATABASE_URL = 'postgres://mem/mem';
process.env.PORT = '3997';
process.env.CRON_SECRET = 'monthly-test-secret';
process.env.RESEND_API_KEY = 'test-only-key';
process.env.EMAILS_PAUSED = 'false';
const { Pool, closeDatabase } = await import('./helpers/pglite-pg.mjs');
const pool = new Pool();
await pool.query(`CREATE TABLE users (
  id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(), email TEXT, email_frequency TEXT NOT NULL DEFAULT 'off',
  last_digest_sent_at TIMESTAMPTZ
)`);
await pool.query(`INSERT INTO users (username,password_hash,email,email_frequency,last_digest_sent_at)
  VALUES ('legacyreader','unused','legacy@example.com','biweekly',now() - interval '2 months'),
  ('legacyoff','unused','off@example.com','off',NULL)`);

const BASE = 'http://127.0.0.1:3997';
const realFetch = globalThis.fetch;
const mail = [];
let failNextSend = false;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith(BASE)) return realFetch(input, options);
  if (url === 'https://api.resend.com/emails') {
    mail.push({ ...JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
    if (failNextSend) { failNextSend = false; throw new Error('Simulated unknown delivery outcome'); }
    return new Response('{"id":"test-message"}', {status:200});
  }
  throw new Error('External network blocked');
};
const { server } = await import('../server.js');
const { initEmailPolicy } = await import('../email-policy.js');
after(async () => { await new Promise(resolve => server.close(resolve)); await closeDatabase(); });
for (let i = 0; i < 100; i++) {
  try { if ((await realFetch(BASE + '/api/health')).ok) break; } catch {}
  await new Promise(r => setTimeout(r,100));
}
const call = (path, {method='GET', token, body, cron=false}={}) => realFetch(BASE + path, {
  method, headers: {'content-type':'application/json', ...(token ? {authorization:'Bearer '+token} : {}),
    ...(cron ? {'x-cron-secret':process.env.CRON_SECRET} : {})},
  body:body === undefined ? undefined : JSON.stringify(body)
});
async function account(username, email) {
  const registered = await call('/api/register', {method:'POST', body:{username,password:'password123'}});
  assert.equal(registered.status,200);
  const { token } = await registered.json();
  const saved = await call('/api/account/preferences', {method:'PATCH', token,
    body:{email,emailFrequency:'monthly'}});
  assert.equal(saved.status,200);
  return token;
}
async function due(username) {
  await pool.query(`UPDATE users SET next_newsletter_at = now() - interval '1 day' WHERE username=$1`,[username]);
}
const run = username => call('/api/cron/send-digests?only='+username,{cron:true});

test('reset converts subscribers to monthly once and preserves opt-outs, addresses and history', async () => {
  const legacy = (await pool.query('SELECT * FROM users WHERE username=$1',['legacyreader'])).rows[0];
  assert.equal(legacy.email_frequency,'monthly');
  assert.equal(legacy.email,'legacy@example.com');
  assert.ok(new Date(legacy.next_newsletter_at).getTime() > Date.now()+27*86400000);
  assert.ok(new Date(legacy.last_digest_sent_at).getTime() < Date.now()-50*86400000);
  assert.equal((await pool.query('SELECT email_frequency FROM users WHERE username=$1',['legacyoff'])).rows[0].email_frequency,'off');
  await due('legacyreader');
  const before = (await pool.query('SELECT next_newsletter_at FROM users WHERE username=$1',['legacyreader'])).rows[0].next_newsletter_at;
  await initEmailPolicy(pool);
  assert.equal(String((await pool.query('SELECT next_newsletter_at FROM users WHERE username=$1',['legacyreader'])).rows[0].next_newsletter_at),String(before));
  assert.equal(mail.length,0,'reset itself sends nothing');
});

test('new subscriptions wait a month; saves and dry runs send nothing', async () => {
  const token = await account('waitreader','wait@example.com');
  await call('/api/account/preferences',{method:'PATCH',token,body:{homeCity:'cupertino'}});
  assert.equal((await (await run('waitreader')).json()).sent,0);
  await due('waitreader');
  const preview = await call('/api/cron/send-digests?dryRun=1&only=waitreader',{cron:true});
  assert.equal((await preview.json()).due,1);
  assert.equal(mail.length,0);
});

test('overlapping scheduler calls and forced calls cannot send multiple automatic copies', async () => {
  await account('monthlyreader','monthly@example.com');
  await due('monthlyreader');
  const before=mail.length;
  const results=await Promise.all([run('monthlyreader'),run('monthlyreader'),run('monthlyreader')]);
  const reports=await Promise.all(results.map(r=>r.json()));
  assert.equal(reports.reduce((n,r)=>n+r.sent,0),1);
  assert.equal(mail.length,before+1);
  assert.ok(mail.at(-1).key.startsWith('monthly/'));
  assert.ok(mail.at(-1).subject.startsWith('The California Civic Dashboard:'));
  assert.equal((await (await run('monthlyreader')).json()).sent,0);
  const forced=await call('/api/cron/send-digests?force=1&only=monthlyreader',{cron:true});
  assert.equal(forced.status,400);
  await due('monthlyreader');
  assert.equal((await (await run('monthlyreader')).json()).sent,0,'same issue cannot send again');
  assert.equal(mail.length,before+1);
});

test('one shared inbox cannot receive automatic copies from several accounts', async () => {
  await account('sharedone','Shared@example.com');
  await account('sharedtwo','shared@example.com');
  await due('sharedone'); await due('sharedtwo');
  const before=mail.length;
  await Promise.all([run('sharedone'),run('sharedtwo')]);
  assert.equal(mail.length,before+1);
});

test('explicit self-email remains available but repeated archive requests send one copy', async () => {
  const token=await account('selfreader','self@example.com');
  const before=mail.length;
  const requests=await Promise.all(Array.from({length:6},()=>call('/api/newsletter/email',{
    method:'POST',token,body:{emailIntent:'self',issue:'2026-07',to:'someone-else@example.com'}
  })));
  assert.ok(requests.every(r=>r.status===200));
  assert.equal(mail.length,before+1);
  assert.deepEqual(mail.at(-1).to,['self@example.com']);
  const results=await Promise.all(requests.map(r=>r.json()));
  assert.equal(results.filter(r=>r.alreadyRequested).length,5);
  const another=await call('/api/newsletter/email',{method:'POST',token,body:{emailIntent:'self',issue:'2026-08'}});
  assert.equal(another.status,200);
  assert.equal(mail.length,before+2,'a different explicitly requested issue is allowed');
  assert.equal((await (await run('selfreader')).json()).sent,0,'manual mail never starts automatic mail');
});

test('unknown automatic outcomes retain their slot instead of retrying', async () => {
  await account('unknownreader','unknown@example.com'); await due('unknownreader');
  const before=mail.length; failNextSend=true;
  assert.equal((await (await run('unknownreader')).json()).failed,1);
  await due('unknownreader');
  assert.equal((await (await run('unknownreader')).json()).sent,0);
  assert.equal(mail.length,before+1);
});

test('unknown manual outcomes are not resent on retry', async () => {
  const token=await account('manualunknown','manualunknown@example.com');
  const before=mail.length; failNextSend=true;
  assert.equal((await call('/api/newsletter/email',{method:'POST',token,body:{emailIntent:'self',issue:'2026-06'}})).status,502);
  const retry=await call('/api/newsletter/email',{method:'POST',token,body:{emailIntent:'self',issue:'2026-06'}});
  assert.equal(retry.status,200);
  assert.equal((await retry.json()).alreadyRequested,true);
  assert.equal(mail.length,before+1);
});

test('Off remains Off and is excluded from automatic delivery', async () => {
  const token=await account('offreader','unsubscribe@example.com'); await due('offreader');
  await call('/api/account/preferences',{method:'PATCH',token,body:{emailFrequency:'off'}});
  const before=mail.length;
  assert.equal((await (await run('offreader')).json()).sent,0);
  assert.equal(mail.length,before);
});


test('old or background requests cannot send without explicit self-email intent', async () => {
  const token=await account('intentreader','intent@example.com');
  const before=mail.length;
  for (const path of ['/api/newsletter/email','/api/reminders/email','/api/meetings/summary/email']) {
    for (const emailIntent of [undefined, false, 'automatic']) {
      const response=await call(path,{method:'POST',token,body:{issue:'2026-07',cityKey:'cupertino',emailIntent}});
      assert.equal(response.status,400);
      assert.match((await response.json()).error,/press Email me/);
    }
  }
  assert.equal(mail.length,before);
  const explicit=await call('/api/newsletter/email',{method:'POST',token,body:{emailIntent:'self',issue:'2026-07'}});
  assert.equal(explicit.status,200);
  assert.equal(mail.length,before+1);
});
