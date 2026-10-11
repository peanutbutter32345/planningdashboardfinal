// The setup recap used to be sent on every save of the account page, so changing a city or
// unticking a category delivered another email titled "Your profile on The Bay Dashboard is
// ready". It also left last_digest_sent_at null, so the next scheduled run read the reader as
// new and sent the setup briefing again.
//
// Runs the real server.js against an in-memory Postgres. Outgoing mail is intercepted and
// counted rather than sent.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/pg-mem-loader.mjs', import.meta.url);

const SECRET = 'test-cron-secret';
const PORT = 3992;
const BASE = 'http://127.0.0.1:' + PORT;

process.env.DATABASE_URL = 'postgres://mem/mem';
process.env.PORT = String(PORT);
process.env.CRON_SECRET = SECRET;
process.env.RESEND_API_KEY = 'test-resend-key';

// Resend is answered as if it accepted the message, and the message is kept so the test can count
// them. Every other outside host fails at once, so the hearings lookup inside the recap does not
// spend its timeout reaching a network this test has no business touching.
const realFetch = globalThis.fetch;
const mail = [];
globalThis.fetch = (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url || '');
  if (url.startsWith('https://api.resend.com/')) {
    mail.push(JSON.parse(init.body));
    return Promise.resolve(new Response('{"id":"test"}',
      { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  if (url.startsWith(BASE)) return realFetch(input, init);
  return Promise.reject(new Error('outside network blocked in this test'));
};

const { server } = await import('../server.js');
after(() => new Promise(resolve => server.close(resolve)));

for (let i = 0; i < 100; i++) {
  try {
    const res = await realFetch(BASE + '/api/admin/users?limit=1', { headers: { 'x-cron-secret': SECRET } });
    if (res.status === 200 && (await res.json()).ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 100));
}

function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  return realFetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}
const json = async res => ({ status: res.status, body: await res.json().catch(() => null) });
const signUp = async username =>
  (await json(await call('/api/register', { method: 'POST', body: { username, password: 'password123' } }))).body.token;

test('the recap goes out when someone subscribes, and not again when they edit', async () => {
  const token = await signUp('mailer');
  const before = mail.length;

  const first = await json(await call('/api/account/preferences', {
    method: 'PATCH', token,
    body: { email: 'reader@example.com', emailFrequency: 'biweekly', homeCity: 'sunnyvale' } }));
  assert.equal(first.status, 200, 'saving preferences succeeds');
  assert.equal(first.body.welcomeSent, true, 'a new subscriber gets the recap');
  assert.equal(mail.length, before + 1, 'exactly one message went out');
  assert.equal(mail[mail.length - 1].to[0], 'reader@example.com', 'and to the address just saved');

  // Changing a setting is not subscribing again.
  const second = await json(await call('/api/account/preferences', {
    method: 'PATCH', token, body: { homeCity: 'cupertino' } }));
  assert.equal(second.status, 200, 'the edit saves');
  assert.equal(second.body.welcomeSent, false, 'no second recap');
  assert.equal(second.body.welcomeError, null,
    'and no error either: an existing subscriber is not owed a setup email');
  assert.equal(mail.length, before + 1, 'still exactly one message');

  const third = await json(await call('/api/account/preferences', {
    method: 'PATCH', token, body: { categories: ['Housing'] } }));
  assert.equal(third.status, 200);
  assert.equal(mail.length, before + 1, 'unticking a category sends nothing');
});

test('turning updates off, or saving no address, reports no failure', async () => {
  const token = await signUp('quietuser');
  const before = mail.length;

  // Both of these came back as a welcomeError, which the account page printed as
  // "Saved - but no email went out: ...". Choosing not to get email is not a fault.
  const noAddress = await json(await call('/api/account/preferences', {
    method: 'PATCH', token, body: { homeCity: 'milpitas' } }));
  assert.equal(noAddress.status, 200);
  assert.equal(noAddress.body.welcomeError, null, 'no address saved is not an error');

  const off = await json(await call('/api/account/preferences', {
    method: 'PATCH', token, body: { email: 'quiet@example.com', emailFrequency: 'off' } }));
  assert.equal(off.status, 200);
  assert.equal(off.body.welcomeError, null, 'updates set to Off is not an error');
  assert.equal(mail.length, before, 'and neither sent anything');
});

test('someone who turns updates on later still gets one recap', async () => {
  const token = await signUp('laterjoiner');
  const before = mail.length;

  // Address first, updates still off: nothing owed yet.
  await call('/api/account/preferences', {
    method: 'PATCH', token, body: { email: 'later@example.com', emailFrequency: 'off' } });
  assert.equal(mail.length, before, 'saving an address alone sends nothing');

  const on = await json(await call('/api/account/preferences', {
    method: 'PATCH', token, body: { emailFrequency: 'monthly' } }));
  assert.equal(on.body.welcomeSent, true, 'turning updates on is when the recap is owed');
  assert.equal(mail.length, before + 1, 'and it is sent once');

  const again = await json(await call('/api/account/preferences', {
    method: 'PATCH', token, body: { emailFrequency: 'biweekly' } }));
  assert.equal(again.body.welcomeSent, false, 'changing cadence afterwards sends nothing');
  assert.equal(mail.length, before + 1);
});
