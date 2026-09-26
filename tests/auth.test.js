// The real server.js, run against an in-memory Postgres, exercised over HTTP the way a browser
// does it. These cover the parts that face the public internet: who can create what, what is
// recorded about them, and what stops someone guessing at passwords.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/pg-mem-loader.mjs', import.meta.url);

const SECRET = 'test-cron-secret';
const PORT = 3988;
const BASE = 'http://127.0.0.1:' + PORT;

process.env.DATABASE_URL = 'postgres://mem/mem';
process.env.PORT = String(PORT);
process.env.CRON_SECRET = SECRET;
process.env.ADMIN_USERNAMES = 'owner';

const { server } = await import('../server.js');
// Without this the listener holds the event loop open and the run never finishes.
after(() => new Promise(resolve => server.close(resolve)));
// initDb runs on import and the listener needs a moment; the first request otherwise races it.
// The listener answers before initDb has finished creating the tables, so waiting on the port
// alone let the first tests run against a database that had no users table yet.
for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(BASE + '/api/admin/users?limit=1', { headers: { 'x-cron-secret': SECRET } });
    if (res.status === 200 && (await res.json()).ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 100));
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
function call(path, { method = 'GET', body, ip, agent, token, secret } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (ip) headers['x-forwarded-for'] = ip;
  if (agent) headers['user-agent'] = agent;
  if (token) headers.authorization = 'Bearer ' + token;
  if (secret) headers['x-cron-secret'] = secret;
  return fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}
const json = async res => ({ status: res.status, body: await res.json().catch(() => null) });
const adminUsers = async () => (await json(await call('/api/admin/users?limit=500', { secret: SECRET }))).body.users;
const findUser = async name => (await adminUsers()).find(u => u.username.toLowerCase() === name.toLowerCase());
const uuid = n => '0000000' + String(n).padStart(4, '0') + '-aaaa-bbbb-cccc-0123456789ab';

test('signing up records the address and browser it came from', async () => {
  const res = await json(await call('/api/register', {
    method: 'POST', body: { username: 'ipuser', password: 'password123' },
    ip: '203.0.113.9', agent: IPHONE }));
  assert.equal(res.status, 200);
  const row = await findUser('ipuser');
  assert.equal(row.signup_ip, '203.0.113.9');
  assert.equal(row.last_ip, '203.0.113.9');
  assert.match(row.last_user_agent, /iPhone/);
});

test('one proxy hop is trusted, so a forged chain cannot pick its own address', async () => {
  await call('/api/register', { method: 'POST', body: { username: 'spoofer', password: 'password123' },
    ip: '9.9.9.9, 203.0.113.55', agent: IPHONE });
  // Render adds the real client as the last entry. Anything a caller wrote before it is theirs to
  // invent, so the address kept must be the one the proxy appended, not the head of the list.
  assert.equal((await findUser('spoofer')).signup_ip, '203.0.113.55');
});

test('a guest becomes an account on the same row, keeping the address it first arrived at', async () => {
  const guestId = uuid(1);
  const created = await json(await call('/api/guest', { method: 'POST',
    body: { guestId, username: 'Otter 4821', homeCity: 'sunnyvale' }, ip: '198.51.100.7', agent: IPHONE }));
  assert.equal(created.body.created, true);
  const before = (await adminUsers()).length;

  const signed = await json(await call('/api/register', { method: 'POST',
    body: { username: 'otterperson', password: 'password123', guestId }, ip: '198.51.100.90', agent: IPHONE }));
  assert.equal(signed.status, 200);

  assert.equal((await adminUsers()).length, before, 'signing up must rename the row, not add a second person');
  const row = await findUser('otterperson');
  assert.equal(row.kind, 'account');
  assert.equal(row.signup_ip, '198.51.100.7', 'the address they first arrived at is kept');
  assert.equal(row.last_ip, '198.51.100.90', 'and the one they signed up from is current');
  assert.equal(await findUser('Otter 4821'), undefined, 'the guest row is gone, not duplicated');
});

test('returning to the site updates the address without creating anyone new', async () => {
  const guestId = uuid(2);
  await call('/api/guest', { method: 'POST', body: { guestId, username: 'Heron 1100' }, ip: '198.51.100.1', agent: IPHONE });
  const before = (await adminUsers()).length;
  const again = await json(await call('/api/guest', { method: 'POST', body: { guestId, username: 'Heron 1100' },
    ip: '198.51.100.2', agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36' }));
  assert.equal(again.body.created, false);
  assert.equal((await adminUsers()).length, before);
  const row = await findUser('Heron 1100');
  assert.equal(row.last_ip, '198.51.100.2');
  assert.match(row.last_user_agent, /Macintosh/);
});

test('logging in is case-insensitive and moves the recorded address', async () => {
  await call('/api/register', { method: 'POST', body: { username: 'CaseUser', password: 'password123' }, ip: '203.0.113.1', agent: IPHONE });
  const res = await json(await call('/api/login', { method: 'POST',
    body: { username: 'caseuser', password: 'password123' }, ip: '203.0.113.2', agent: IPHONE }));
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'CaseUser', 'the stored spelling is returned, not what was typed');
  const row = await findUser('caseuser');
  assert.equal(row.signup_ip, '203.0.113.1');
  assert.equal(row.last_ip, '203.0.113.2');
});

test('a username differing only in case cannot be taken twice', async () => {
  await call('/api/register', { method: 'POST', body: { username: 'Unique1', password: 'password123' } });
  const dup = await json(await call('/api/register', { method: 'POST', body: { username: 'uNiQuE1', password: 'password123' } }));
  assert.equal(dup.status, 409);
});

test('a run of wrong passwords is cut off, and the real owner still gets in', async () => {
  await call('/api/register', { method: 'POST', body: { username: 'targetuser', password: 'password123' }, ip: '203.0.113.30' });
  let blocked = 0;
  for (let i = 0; i < 14; i++) {
    const res = await call('/api/login', { method: 'POST',
      body: { username: 'targetuser', password: 'wrong-guess-' + i }, ip: '203.0.113.' + (100 + i) });
    if (res.status === 429) blocked++;
  }
  assert.ok(blocked > 0, 'guessing from many addresses at one account must still be stopped');

  // A different account from a clean address is unaffected by the attack above.
  await call('/api/register', { method: 'POST', body: { username: 'bystander', password: 'password123' }, ip: '203.0.113.200' });
  const ok = await json(await call('/api/login', { method: 'POST',
    body: { username: 'bystander', password: 'password123' }, ip: '203.0.113.200' }));
  assert.equal(ok.status, 200, 'an unrelated person must not be locked out by someone else being attacked');
});

test('a wrong password a few times then the right one still signs you in', async () => {
  await call('/api/register', { method: 'POST', body: { username: 'typist', password: 'password123' }, ip: '203.0.113.60' });
  for (let i = 0; i < 3; i++)
    await call('/api/login', { method: 'POST', body: { username: 'typist', password: 'nope' + i }, ip: '203.0.113.60' });
  const ok = await json(await call('/api/login', { method: 'POST',
    body: { username: 'typist', password: 'password123' }, ip: '203.0.113.60' }));
  assert.equal(ok.status, 200);
});

test('the session token from signing up works, and stops working after logging out', async () => {
  const reg = (await json(await call('/api/register', { method: 'POST', body: { username: 'sessionuser', password: 'password123' } }))).body;
  const before = await call('/api/timeline', { token: reg.token });
  assert.equal(before.status, 200);
  assert.equal((await call('/api/logout', { method: 'POST', token: reg.token })).status, 200);
  assert.equal((await call('/api/timeline', { token: reg.token })).status, 401);
});

test('who may read the user list: the secret, an admin account, and nobody else', async () => {
  assert.equal((await call('/api/admin/users')).status, 404, 'an anonymous caller is not told the route exists');
  assert.equal((await call('/api/admin/users', { secret: 'wrong' })).status, 404);
  assert.equal((await call('/api/admin/users', { secret: SECRET })).status, 200);

  const ordinary = (await json(await call('/api/register', { method: 'POST', body: { username: 'nosy', password: 'password123' } }))).body;
  assert.equal((await call('/api/admin/users', { token: ordinary.token })).status, 404, 'an ordinary account sees nothing');

  const owner = (await json(await call('/api/register', { method: 'POST', body: { username: 'owner', password: 'password123' } }))).body;
  assert.equal((await call('/api/admin/users', { token: owner.token })).status, 200, 'the name in ADMIN_USERNAMES does');
});

test('the user list carries what the owner needs and never a password', async () => {
  const rows = await adminUsers();
  assert.ok(rows.length > 0);
  for (const key of ['username', 'kind', 'created_at', 'last_seen_at', 'signup_ip', 'last_ip', 'last_user_agent'])
    assert.ok(key in rows[0], 'missing ' + key);
  for (const row of rows) {
    assert.equal(row.password_hash, undefined);
    assert.equal(row.password, undefined);
  }
});

test('a password is never stored in a form anyone could read back', async () => {
  await call('/api/register', { method: 'POST', body: { username: 'secretkeeper', password: 'hunter2hunter2' } });
  const listed = JSON.stringify(await adminUsers());
  assert.ok(!listed.includes('hunter2hunter2'));
});

test('signup refuses a short password and a name with punctuation in it', async () => {
  assert.equal((await call('/api/register', { method: 'POST', body: { username: 'shortpw', password: 'abc' } })).status, 400);
  assert.equal((await call('/api/register', { method: 'POST', body: { username: 'has spaces', password: 'password123' } })).status, 400);
  assert.equal((await call('/api/register', { method: 'POST', body: { username: 'drop;table', password: 'password123' } })).status, 400);
});

test('a guest id that is not a guest id is refused', async () => {
  for (const guestId of ['', 'short', "' OR 1=1--", 'x'.repeat(200)])
    assert.equal((await call('/api/guest', { method: 'POST', body: { guestId, username: 'Otter 1234' } })).status, 400);
});
