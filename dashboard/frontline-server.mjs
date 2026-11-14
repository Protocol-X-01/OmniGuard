import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness } from '../integrations/atlassian-forge/test/frontline-harness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = process.env.OMNIGUARD_FRONTLINE_FIXTURES || path.join(root, 'fixtures/frontline');
export function previewServer(port = 4180) {
  const fixedClock = process.env.OMNIGUARD_FRONTLINE_CLOCK === undefined ? null : Number(process.env.OMNIGUARD_FRONTLINE_CLOCK);
  if (fixedClock !== null && (!Number.isSafeInteger(fixedClock) || fixedClock < 0 || fixedClock > 4102444800)) throw new Error('Invalid fixture clock.');
  const h = harness(); h.service.clock = () => fixedClock ?? Math.floor(Date.now() / 1000);
  const host = `127.0.0.1:${port}`;
  const files = new Map([
    ...['frontline.html', 'frontline.css', 'frontline.js'].map(f => [`/${f}`, [`integrations/atlassian-forge/static/app/${f}`, f.endsWith('html') ? 'text/html' : f.endsWith('css') ? 'text/css' : 'text/javascript']]),
    ...['team-risk', 'team-retest'].map(f => [`/fixtures/${f}.bundle.json`, [path.join(fixtureDirectory, `${f}.bundle.json`), 'application/json']]),
  ]);
  const actions = { '/import': body => h.service.import(h.context, body), '/create': body => h.service.create(h.context, body),
    '/contact-preview': body => h.service.contact(h.context, body), '/contact': body => h.service.contact(h.context, body, true),
    '/decision': body => h.service.action(h.context, body, 'decision'), '/verify': body => h.service.action(h.context, body, 'verify'), '/complete': body => h.service.action(h.context, body, 'complete') };
  const server = http.createServer(async (req, res) => {
    const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) { send(403, { message: 'Use the local preview origin.' }); return; }
    try {
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/api/frontline') { send(200, { ...await h.service.dashboard(h.context), previewClock: fixedClock }); return; }
      if (req.method === 'GET' && (url.pathname === '/' || files.has(url.pathname))) {
        const [file, type] = files.get(url.pathname === '/' ? '/frontline.html' : url.pathname);
        const bytes = await readFile(path.isAbsolute(file) ? file : path.join(root, file));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(bytes); return;
      }
      const action = actions[url.pathname.replace(/^\/api\/frontline/, '')];
      if (req.method !== 'POST' || !url.pathname.startsWith('/api/frontline/') || !action) { send(404, { message: 'Unknown fixture endpoint.' }); return; }
      if (req.headers['x-omniguard-local'] !== '1' || req.headers['content-type'] !== 'application/json') { send(403, { message: 'A same-origin JSON fixture request is required.' }); return; }
      if (Number(req.headers['content-length']) > 65536) { send(413, { message: 'Request exceeds 64 KiB.' }); req.resume(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) { send(413, { message: 'Request exceeds 64 KiB.' }); return; } chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(400, { message: 'Provide valid JSON.' }); return; }
      send(200, await action(body));
    } catch (e) { if (!res.headersSent) send(e.status || 500, { message: e.message || 'The local fixture action failed.' }); else res.end(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  return { server, harness: h };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = previewServer();
  server.listen(4180, '127.0.0.1', () => console.log('OmniGuard front-line fixture preview: http://127.0.0.1:4180/frontline.html — simulated Jira, in-memory data.'));
}
