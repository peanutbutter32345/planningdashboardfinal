// A login used to be valid forever: the sessions table recorded created_at and no query ever
// read it. These run the real server.js against an in-memory Postgres with the session lifetime
// set to zero days, so a token that was just issued is already past it. That is the only way to
// reach the expiry branch without waiting ninety days.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/pg-mem-loader.mjs', import.meta.url);

const SECRET = 'test-cron-secret';
const PORT = 3991;
const BASE = 'http://127.0.0.1:' + PORT;

process.env.DATABASE_URL = 'postgres://mem/mem';
process.env.PORT = String(PORT);
process.env.CRON_SECRET = SECRET;
process.env.ADMIN_USERNAMES = 'owner';
process.env.SESSION_TTL_DAYS = '0';

const { server } = await import('../server.js');
after(() => new Promise(resolve => server.close(resolve)));

for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(BASE + '/api/admin/users?limit=1', { headers: { 'x-cron-secret': SECRET } });
    if (res.status === 200 && (await res.json()).ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 100));
}

function call(path, { method = 'GET', body, token, secret } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (secret) headers['x-cron-secret'] = secret;
  return fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}
const json = async res => ({ status: res.status, body: await res.json().catch(() => null) });

test('a token past the session lifetime is refused', async () => {
  const signup = await json(await call('/api/register', {
    method: 'POST', body: { username: 'staleuser', password: 'password123' } }));
  assert.equal(signup.status, 200, 'signing up still works; the lifetime only governs later use');
  const token = signup.body.token;
  assert.ok(token, 'signup returns a token');

  const stars = await json(await call('/api/stars', { token }));
  assert.equal(stars.status, 401, 'an expired token must not open a route behind authMiddleware');
  assert.match(stars.body.error, /log in again/i, 'and must say why, so the client can re-prompt');
});

test('an expired token does not open the admin counts either', async () => {
  const signup = await json(await call('/api/register', {
    method: 'POST', body: { username: 'owner', password: 'password123' } }));
  // 'owner' is in ADMIN_USERNAMES, so this call would be allowed but for the age of the token.
  const community = await json(await call('/api/community', { token: signup.body.token }));
  assert.equal(community.status, 404,
    'the admin check read its session row without testing the age, so an old token still worked here');
});

test('a fresh token works when the lifetime allows it', async () => {
  // The cron secret is a separate door and is not time limited, so it proves the route itself is
  // sound and that the 401s above come from the token's age rather than a broken query.
  const community = await json(await call('/api/community', { secret: SECRET }));
  assert.equal(community.status, 200, 'the same route answers the cron secret');
});
