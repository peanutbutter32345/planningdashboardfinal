// What the write routes accept. Reminders and saved answers were already capped and bounded;
// stars were not, and four routes handed a URL fragment straight to an integer column.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/pg-mem-loader.mjs', import.meta.url);

const SECRET = 'test-cron-secret';
const PORT = 3993;
const BASE = 'http://127.0.0.1:' + PORT;

process.env.DATABASE_URL = 'postgres://mem/mem';
process.env.PORT = String(PORT);
process.env.CRON_SECRET = SECRET;

const { server } = await import('../server.js');
after(() => new Promise(resolve => server.close(resolve)));

for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(BASE + '/api/admin/users?limit=1', { headers: { 'x-cron-secret': SECRET } });
    if (res.status === 200 && (await res.json()).ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 100));
}

function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  return fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}
const json = async res => ({ status: res.status, body: await res.json().catch(() => null) });
const signUp = async username =>
  (await json(await call('/api/register', { method: 'POST', body: { username, password: 'password123' } }))).body.token;

test('a star has to be a kind the dashboard can display', async () => {
  const token = await signUp('starrer');
  for (const itemType of ['project', 'board', 'news', 'resource', 'statistic']) {
    const ok = await json(await call('/api/stars', {
      method: 'POST', token, body: { itemType, itemId: itemType + '-1', itemData: { title: 'x' } } }));
    assert.equal(ok.status, 200, `${itemType} is a real star type`);
  }
  const bad = await json(await call('/api/stars', {
    method: 'POST', token, body: { itemType: 'invented', itemId: 'x' } }));
  assert.equal(bad.status, 400, 'an unknown type would store a row nothing can show');
});

test('a news star keeps working at the length a real news URL reaches', async () => {
  const token = await signUp('longurl');
  // Google News links in this dataset run past 950 characters and are used verbatim as the id.
  const realistic = 'https://news.google.com/rss/articles/' + 'A'.repeat(930);
  assert.ok(realistic.length > 950, 'the fixture is as long as the real thing');
  const ok = await json(await call('/api/stars', {
    method: 'POST', token, body: { itemType: 'news', itemId: realistic } }));
  assert.equal(ok.status, 200, 'starring a real article must not be refused for its URL length');

  const absurd = 'https://example.com/' + 'B'.repeat(4000);
  const no = await json(await call('/api/stars', { method: 'POST', token, body: { itemType: 'news', itemId: absurd } }));
  assert.equal(no.status, 400, 'but there is still an upper bound');
});

test('re-starring something already saved is an update, not a new row', async () => {
  const token = await signUp('restarrer');
  const body = { itemType: 'project', itemId: 'sv-amd-place', itemData: { title: 'first' } };
  assert.equal((await json(await call('/api/stars', { method: 'POST', token, body }))).status, 200);
  assert.equal((await json(await call('/api/stars', {
    method: 'POST', token, body: { ...body, itemData: { title: 'second' } } }))).status, 200);
  const stars = await json(await call('/api/stars', { token }));
  const mine = stars.body.stars.filter(s => s.item_id === 'sv-amd-place');
  assert.equal(mine.length, 1, 'one row');
  assert.equal(mine[0].item_data.title, 'second', 'carrying the newer detail');
});

test('a malformed row reference is a bad request, not a server error', async () => {
  const token = await signUp('badids');
  const cases = [
    ['PATCH', '/api/reminders/abc', { inDigest: true }],
    ['DELETE', '/api/reminders/abc', null],
    ['DELETE', '/api/chat/history/not-a-number', null],
  ];
  for (const [method, path, body] of cases) {
    const res = await json(await call(path, { method, token, body }));
    assert.equal(res.status, 400, `${method} ${path} should report a bad reference`);
    assert.ok(res.body.error, 'and say so');
  }
});

test('a well-formed reference that is not yours changes nothing', async () => {
  const mine = await signUp('owner1');
  const theirs = await signUp('owner2');
  const made = await json(await call('/api/reminders', {
    method: 'POST', token: theirs,
    body: { kind: 'board', refId: 'b-1', label: 'Their reminder' } }));
  assert.equal(made.status, 200);
  const id = made.body.id;

  const attempt = await json(await call(`/api/reminders/${id}`, { method: 'DELETE', token: mine }));
  assert.equal(attempt.status, 200, 'no information about whose row it is');
  const stillThere = await json(await call('/api/reminders', { token: theirs }));
  assert.equal(stillThere.body.reminders.length, 1, 'and the row is untouched');
});
