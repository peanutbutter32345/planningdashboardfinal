import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

process.env.PORT = '0';
delete process.env.DATABASE_URL;
const { server } = await import('../server.js');
if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));

function visit(host, path = '/', method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { host }
    }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('old domains and www links permanently redirect with path and query intact', async () => {
  for (const host of ['baydashboard.com', 'www.baydashboard.com',
    'southbaydashboard.com', 'www.southbaydashboard.com', 'www.calcivicdashboard.com']) {
    assert.deepEqual(await visit(host, '/?city=San%20Jose&tab=housing'), {
      status: 308, location: 'https://calcivicdashboard.com/?city=San%20Jose&tab=housing'
    }, host);
  }
});

test('redirect also preserves API methods rather than converting writes to GET', async () => {
  assert.deepEqual(await visit('SOUTHBAYDASHBOARD.COM:443', '/api/login', 'POST'), {
    status: 308, location: 'https://calcivicdashboard.com/api/login'
  });
});

test('primary, local, and Render hosts keep serving without a redirect loop', async () => {
  for (const host of ['calcivicdashboard.com', 'localhost', 'planningdashboardfinal.onrender.com']) {
    assert.deepEqual(await visit(host), { status: 200, location: undefined }, host);
  }
});

test('Render health checks remain available on the service hostname', async () => {
  assert.deepEqual(await visit('planningdashboardfinal.onrender.com', '/api/health'), {
    status: 200, location: undefined
  });
});
