import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const scanner = process.env.OMNIGUARD_BIN || path.join(projectRoot, 'target', 'debug', 'omniguard');
const compiler = process.env.OMNIGUARD_SOLC;
const fixtureFamily = compiler ? 'semantic-vault' : 'executable-vault';
const scenarios = new Set(['vulnerable', 'fixed']);
const remediations = [];
const allowedOrigins = new Set(['http://127.0.0.1:4173', 'http://localhost:4173']);

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function scan(scenario) {
  const fixturePath = path.join(projectRoot, 'fixtures', fixtureFamily, scenario);
  const { stdout } = await execFileAsync(scanner, ['scan', fixturePath, '--format', 'json', ...(compiler ? ['--solc', compiler] : [])], {
    cwd: projectRoot,
    maxBuffer: 4 * 1024 * 1024,
    timeout: compiler ? 70000 : 15000,
  });
  return JSON.parse(stdout);
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString('utf8');
    if (raw.length > 16000) throw new Error('Request body is too large.');
  }
  return JSON.parse(raw || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { message: 'Use the Vite dashboard at http://127.0.0.1:4173.' });
    return;
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', mode: 'local-fixtures' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/scan') {
      const scenario = url.searchParams.get('scenario') || 'vulnerable';
      if (!scenarios.has(scenario)) {
        sendJson(response, 400, { message: 'Choose the vulnerable or fixed local fixture.' });
        return;
      }
      sendJson(response, 200, await scan(scenario));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/remediations') {
      sendJson(response, 200, remediations);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/remediations') {
      const origin = request.headers.origin;
      if (!origin || !allowedOrigins.has(origin)) {
        sendJson(response, 403, { message: 'This local action is only available from the OmniGuard demo page.' });
        return;
      }
      if (!request.headers['content-type']?.includes('application/json')) {
        sendJson(response, 415, { message: 'Send the finding reference as JSON.' });
        return;
      }
      const body = await readBody(request);
      if (!scenarios.has(body.scenario) || typeof body.findingId !== 'string' || !/^[a-f0-9]{24}$/.test(body.findingId)) {
        sendJson(response, 400, { message: 'The finding reference is invalid.' });
        return;
      }
      const report = await scan(body.scenario);
      if (report.diagnostics.length || report.coverage?.complete === false) {
        sendJson(response, 422, { message: 'Resolve incomplete scan coverage before creating a draft.' });
        return;
      }
      const finding = report.findings.find((item) => item.id === body.findingId && item.evidence.validated);
      if (!finding) {
        sendJson(response, 404, { message: 'No validated finding with that ID exists in the selected fixture.' });
        return;
      }
      const issue = {
        issueKey: `LOCAL-${String(remediations.length + 1).padStart(3, '0')}`,
        findingId: finding.id,
        ruleId: finding.rule_id,
        title: `${finding.rule_id}: ${finding.title}`,
        file: finding.location.file,
        line: finding.location.start_line,
        status: 'local-demo-draft',
      };
      remediations.unshift(issue);
      sendJson(response, 201, issue);
      return;
    }
    sendJson(response, 404, { message: 'Unknown local demo endpoint.' });
  } catch (error) {
    const missingBinary = error.code === 'ENOENT';
    sendJson(response, missingBinary ? 503 : 500, {
      message: missingBinary
        ? 'Build OmniGuard first with cargo build --workspace.'
        : `The local scan service failed: ${error.message}`,
    });
  }
});

const port = Number(process.env.OMNIGUARD_API_PORT || 4178);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`OmniGuard local fixture API listening on http://127.0.0.1:${port}\n`);
});
