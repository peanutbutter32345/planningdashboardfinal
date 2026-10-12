import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/pg-mem-loader.mjs', import.meta.url);
const BASE = 'http://127.0.0.1:3996';
const SECRET = 'test-pause-secret';
process.env.PORT = '3996';
process.env.DATABASE_URL = 'postgres://mem/mem';
process.env.CRON_SECRET = SECRET;
process.env.RESEND_API_KEY = 'test-only-key';
delete process.env.EMAILS_PAUSED; // The production default must be paused.

const realFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.fetch = (input, init) => {
  if (String(input).startsWith(BASE)) return realFetch(input, init);
  externalRequests++;
  return Promise.reject(new Error('Outside network blocked in this test'));
};
const { server } = await import('../server.js');
after(() => new Promise(resolve => server.close(resolve)));
for (let i = 0; i < 100; i++) {
  try {
    const res = await realFetch(BASE + '/api/admin/users?limit=1', { headers: { 'x-cron-secret': SECRET } });
    if (res.ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 100));
}

test('every website email route is paused while subscriber preferences still save', async () => {
  assert.equal((await (await realFetch(BASE + '/api/health')).json()).emailsPaused, true);
  const registered = await realFetch(BASE + '/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'pausedreader', password: 'password123' })
  });
  assert.equal(registered.status, 200);
  const { token } = await registered.json();
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
  const saved = await realFetch(BASE + '/api/account/preferences', {
    method: 'PATCH', headers,
    body: JSON.stringify({ email: 'reader@example.com', emailFrequency: 'monthly', homeCity: 'cupertino' })
  });
  assert.equal(saved.status, 200);
  const result = await saved.json();
  assert.equal(result.welcomeSent, false);
  assert.equal(result.welcomeError, 'Email delivery is temporarily paused.');
  const preferences = await (await realFetch(BASE + '/api/account/preferences', { headers })).json();
  assert.equal(preferences.emailFrequency, 'monthly');
  assert.equal(preferences.email, 'reader@example.com');
  for (const path of ['/api/reminders/email', '/api/newsletter/email', '/api/meetings/summary/email']) {
    const response = await realFetch(BASE + path, { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'Email delivery is temporarily paused.');
  }
  for (const method of ['GET', 'POST']) {
    const response = await realFetch(BASE + '/api/cron/send-digests?force=1', {
      method, headers: { 'x-cron-secret': SECRET }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, paused: true, sent: 0 });
  }
  assert.equal(externalRequests, 0, 'paused requests never contact mail, meetings, or model providers');
});
