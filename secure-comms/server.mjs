import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
export function labServer(credentials, port = 4190) {
  const origin = `http://127.0.0.1:${port}`;
  if (credentials.baseUrl !== 'http://127.0.0.1:8998') throw new Error('Use the isolated loopback Matrix server.');
  const participants = ['@alice:omniguard.local', '@bob:omniguard.local'];
  const assets = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/main.js', ['main.js', 'text/javascript']], ['/pkg/matrix_sdk_crypto_wasm_bg.wasm', ['pkg/matrix_sdk_crypto_wasm_bg.wasm', 'application/wasm']]]);
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self' http://127.0.0.1:8998; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { message: 'Use the local OmniGuard page.' });
    try {
      if (req.url === '/lab/config' && req.method === 'GET') return json(200, { baseUrl: credentials.baseUrl, roomId: credentials.roomId, participants, fixture: true });
      if (req.url === '/lab/session' && req.method === 'POST') {
        if (req.headers.origin !== origin || req.headers['x-omniguard-lab'] !== '1' || req.headers['content-type'] !== 'application/json') return json(403, { message: 'A same-origin fixture request is required.' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 256) return json(400, { message: 'Invalid fixture request.' }); chunks.push(chunk); }
        let payload; try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { message: 'Provide a fixture participant.' }); }
        if (!payload || Object.keys(payload).length !== 1 || !['alice', 'bob'].includes(payload.participant)) return json(400, { message: 'Choose Alice or Bob.' });
        const user = credentials.users[payload.participant];
        const response = await fetch(`${credentials.baseUrl}/_matrix/client/v3/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: user.username }, password: user.password, initial_device_display_name: 'OmniGuard local exercise' }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) return json(response.status === 429 ? 429 : 502, { message: 'The local Matrix session could not be started.' });
        const session = await response.json();
        return json(200, { user_id: session.user_id, device_id: session.device_id, access_token: session.access_token });
      }
      if (req.method === 'GET' && assets.has(req.url)) {
        const [name, type] = assets.get(req.url); const bytes = await readFile(path.join(root, 'dist', name));
        res.writeHead(200, { 'Content-Type': type }); res.end(bytes); return;
      }
      json(404, { message: 'Unknown local route.' });
    } catch { if (!res.headersSent) json(502, { message: 'Local messaging is unavailable. Check the lab server.' }); else res.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.OMNIGUARD_LAB_STATE) throw new Error('Set OMNIGUARD_LAB_STATE to the private lab directory.');
  const credentials = JSON.parse(await readFile(path.join(process.env.OMNIGUARD_LAB_STATE, 'credentials.json')));
  labServer(credentials).listen(4190, '127.0.0.1', () => console.log('OmniGuard encrypted fixture lab: http://127.0.0.1:4190 — synthetic users only.'));
}
