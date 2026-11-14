import test from 'node:test';
import assert from 'node:assert/strict';
import { previewServer } from '../../../dashboard/frontline-server.mjs';
test('the loopback preview rejects foreign origins, missing headers, large and malformed input', async () => {
  const port = 4182, { server } = previewServer(port);
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/api/frontline`, { headers: { Origin: 'https://foreign.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/frontline/import`, { method: 'POST', body: '{}' })).status, 403);
    const headers = { 'Content-Type': 'application/json', 'X-OmniGuard-Local': '1' };
    assert.equal((await fetch(`${base}/api/frontline/import`, { method: 'POST', headers, body: 'invalid' })).status, 400);
    assert.equal((await fetch(`${base}/api/frontline/import`, { method: 'POST', headers, body: 'x'.repeat(65537) })).status, 413);
    assert.equal((await fetch(`${base}/api/frontline/unknown`, { method: 'POST', headers, body: '{}' })).status, 404);
    assert.equal((await fetch(`${base}/api/frontline`)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
