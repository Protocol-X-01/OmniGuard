import test from 'node:test';
import assert from 'node:assert/strict';
import { labServer } from '../server.mjs';
test('fixture broker rejects cross-origin sessions, arbitrary users and unknown files', async () => {
  const server = labServer({ baseUrl: 'http://127.0.0.1:8998', roomId: '!fixture:omniguard.local' }, 4192);
  await new Promise(r => server.listen(4192, '127.0.0.1', r));
  const base = 'http://127.0.0.1:4192';
  try {
    const valid = { Origin: base, 'Content-Type': 'application/json', 'X-OmniGuard-Lab': '1' };
    const call = (headers, body) => fetch(`${base}/lab/session`, { method: 'POST', headers, body });
    assert.equal((await call({ ...valid, Origin: 'https://foreign.example' }, '{"participant":"alice"}')).status, 403);
    assert.equal((await call({ 'Content-Type': 'application/json' }, '{"participant":"alice"}')).status, 403);
    for (const body of ['{"participant":"outsider"}', '{"participant":"alice","admin":true}', 'x'.repeat(257), 'not json']) assert.equal((await call(valid, body)).status, 400);
    assert.equal((await fetch(base + '/credentials.json')).status, 404);
    const config = await fetch(base + '/lab/config'); assert.equal(config.status, 200); assert.equal(config.headers.get('cache-control'), 'no-store');
    assert.equal(JSON.stringify(await config.json()).includes('password'), false);
  } finally { await new Promise(r => server.close(r)); }
});
