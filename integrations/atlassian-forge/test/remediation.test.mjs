import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBundle, assessRescan } from '../src/report-bundle.js';
import { RemediationService } from '../src/remediation-service.js';

const vulnerable = JSON.parse(await readFile(new URL('../../../reports/vulnerable.omniguard.json', import.meta.url)));
const fixed = JSON.parse(await readFile(new URL('../../../reports/fixed.omniguard.json', import.meta.url)));
const context = { accountId: 'fixture-user', extension: { project: { id: '10000', key: 'KAN' } } };

function lab() {
  const data = new Map();
  const issues = new Map();
  const comments = [];
  const calls = { create: 0, transition: 0, authorize: [] };
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  const store = {
    get: async (key) => clone(data.get(key)), set: async (key, value) => { data.set(key, clone(value)); },
    remove: async (key) => data.delete(key),
    saveScan: async (key, scan, activeKey, digest) => { data.set(key, clone(scan)); data.set(activeKey, digest); },
    claim: async (key, value) => { if (data.has(key)) return false; data.set(key, clone(value)); return true; },
    list: async (prefix) => [...data].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes(':')).map(([, value]) => clone(value)),
  };
  const jira = {
    authorize: async (project, permissions) => { calls.authorize.push({ project, permissions }); },
    taskType: async () => '10001',
    createIssue: async (body) => {
      calls.create++;
      const key = `KAN-${calls.create}`;
      issues.set(key, { key, status: 'To Do', category: 'new', body });
      return { key };
    },
    issue: async (key, project) => {
      if (project.id !== '10000') throw new Error('Wrong project');
      const issue = issues.get(key);
      if (!issue) throw new Error('No Jira issue');
      return clone(issue);
    },
    findExisting: async (_project, label) => clone([...issues.values()].find((issue) => issue.body.fields.labels.includes(label))),
    addComment: async (key, body) => { const comment = { id: String(comments.length + 1), key, body }; comments.push(comment); return comment; },
    findVerificationComment: async (key, digest) => comments.find((comment) => comment.key === key && JSON.stringify(comment.body).includes(digest)),
    completionTransitions: async () => [{ id: '31', name: 'Done', status: 'Done' }],
    transition: async (key) => { calls.transition++; Object.assign(issues.get(key), { status: 'Done', category: 'done' }); },
  };
  let tick = 0;
  return { service: new RemediationService({ store, jira, clock: () => new Date(1800000000000 + tick++).toISOString() }), store, jira, data, issues, comments, calls };
}

test('generated scanner bundles contain independently checked evidence and changed fixed sources', () => {
  const before = validateBundle(vulnerable);
  const after = validateBundle(fixed);
  assert.equal(before.bundle.report.findings.length, 3);
  assert.equal(after.bundle.report.findings.length, 0);
  assert.notEqual(before.bundle.sources[0].sha256, after.bundle.sources[0].sha256);
});

test('tampered excerpts, source digests, spans, fingerprints and coverage are rejected', () => {
  for (const mutate of [
    (bundle) => { bundle.report.findings[0].evidence.excerpt += 'x'; },
    (bundle) => { bundle.sources[0].content += '// changed'; },
    (bundle) => { bundle.report.findings[0].location.start_column++; },
    (bundle) => { bundle.report.findings[0].id = '0'.repeat(24); },
    (bundle) => { bundle.sources = []; },
    (bundle) => { bundle.sources[0].path = '../Vault.sol'; },
    (bundle) => { bundle.rules.pop(); },
    (bundle) => { delete bundle.target.id; },
  ]) {
    const changed = structuredClone(vulnerable); mutate(changed);
    assert.throws(() => validateBundle(changed));
  }
});

test('complete workflow creates once, persists across rescan, comments once and completes Jira', async () => {
  const labState = lab(); const { service, calls, comments, issues } = labState;
  const imported = await service.importReport(context, { bundle: vulnerable });
  const args = { scanDigest: imported.scan.digest, findingId: vulnerable.report.findings[0].id };
  const created = await service.create(context, args);
  assert.equal(created.issueKey, 'KAN-1');
  assert.equal((await service.create(context, args)).issueKey, 'KAN-1');
  assert.equal(calls.create, 1);
  assert.match(JSON.stringify(issues.get('KAN-1').body), /Source SHA-256/);
  const next = await service.importReport(context, { bundle: fixed });
  const dashboard = await service.dashboard(context);
  assert.equal(dashboard.remediations.length, 1);
  assert.equal(dashboard.remediations[0].assessment.allowed, true);
  const verify = { remediationId: created.id, scanDigest: next.scan.digest };
  await service.verify(context, verify); await service.verify(context, verify);
  assert.equal(comments.length, 1);
  assert.match(JSON.stringify(comments[0]), /Rescanned source SHA-256/);
  assert.equal((await service.complete(context, { ...verify, transitionId: '31' })).state, 'completed');
  assert.equal(issues.get('KAN-1').category, 'done');
});

test('concurrent creation requests cannot create duplicate Jira issues', async () => {
  const { service, calls } = lab();
  const imported = await service.importReport(context, { bundle: vulnerable });
  const args = { scanDigest: imported.scan.digest, findingId: vulnerable.report.findings[0].id };
  await Promise.allSettled([service.create(context, args), service.create(context, args)]);
  assert.equal(calls.create, 1);
});

test('an uncertain Jira outcome retains its claim and cannot be blindly retried', async () => {
  const { service, jira, calls } = lab();
  jira.createIssue = async () => { calls.create++; throw new Error('connection lost'); };
  const imported = await service.importReport(context, { bundle: vulnerable });
  const args = { scanDigest: imported.scan.digest, findingId: vulnerable.report.findings[0].id };
  await assert.rejects(service.create(context, args), /connection lost/);
  await assert.rejects(service.create(context, args), /uncertain/);
  assert.equal(calls.create, 1);
});

test('failed Jira validation releases the claim for a corrected retry', async () => {
  const { service, jira } = lab();
  const create = jira.createIssue;
  jira.createIssue = async () => { throw Object.assign(new Error('required field'), { definitive: true }); };
  const imported = await service.importReport(context, { bundle: vulnerable });
  const args = { scanDigest: imported.scan.digest, findingId: vulnerable.report.findings[0].id };
  await assert.rejects(service.create(context, args), /required field/);
  jira.createIssue = create;
  assert.equal((await service.create(context, args)).issueKey, 'KAN-1');
});

test('stale scans, incomplete rescans, missing source and unchanged source cannot verify a fix', async () => {
  const { service } = lab();
  const imported = await service.importReport(context, { bundle: vulnerable });
  const record = await service.create(context, { scanDigest: imported.scan.digest, findingId: vulnerable.report.findings[0].id });
  await assert.rejects(service.verify(context, { remediationId: record.id, scanDigest: imported.scan.digest }), /newer scan/);
  const incomplete = structuredClone(fixed);
  incomplete.report.coverage.complete = false;
  incomplete.report.diagnostics = [{ code: 'syntax-error', message: 'incomplete', file: 'Vault.sol', line: 1, column: 1 }];
  const current = await service.importReport(context, { bundle: incomplete });
  await assert.rejects(service.verify(context, { remediationId: record.id, scanDigest: current.scan.digest }), /incomplete/);
  await assert.rejects(service.create(context, { scanDigest: imported.scan.digest, findingId: record.finding.id }), /active scan changed/);
  const unchanged = structuredClone(vulnerable); unchanged.report.findings = [];
  const falseClean = validateBundle(unchanged);
  assert.equal(assessRescan(record, falseClean).allowed, false);
  const missing = validateBundle(fixed); missing.bundle.sources = [];
  assert.equal(assessRescan(record, missing).allowed, false);
});

test('project context is server-derived; foreign projects and unverified completions are rejected', async () => {
  const { service } = lab();
  await assert.rejects(service.importReport({}, { bundle: vulnerable }), /Jira project/);
  const imported = await service.importReport(context, { bundle: vulnerable });
  const record = await service.create(context, { scanDigest: imported.scan.digest, findingId: vulnerable.report.findings[0].id, projectKey: 'OTHER' });
  assert.equal(record.issueKey, 'KAN-1');
  await assert.rejects(service.complete(context, { remediationId: record.id, scanDigest: imported.scan.digest, transitionId: '31' }), /Verify/);
  const other = { ...context, extension: { project: { id: '10001', key: 'OTHER' } } };
  assert.equal((await service.dashboard(other)).scan, null);
});

test('new engine profiles receive distinct review baselines and preserve legacy Jira records', async () => {
  const legacy = JSON.parse(await readFile(new URL('../../../reports/legacy/v0.1.0/vulnerable.omniguard.json', import.meta.url)));
  const { service, calls } = lab();
  const before = await service.importReport(context, { bundle: legacy });
  const previous = await service.create(context, { scanDigest: before.scan.digest, findingId: legacy.report.findings[0].id });
  const after = await service.importReport(context, { bundle: vulnerable });
  const current = await service.create(context, { scanDigest: after.scan.digest, findingId: vulnerable.report.findings[0].id });
  assert.notEqual(previous.id, current.id);
  assert.equal(previous.baselineEngine, '0.1.0');
  assert.equal(current.baselineEngine, vulnerable.report.engine_version);
  assert.equal(calls.create, 2);
});

test('explicit incomplete coverage blocks Jira creation even without a parser diagnostic', async () => {
  const { service, calls } = lab();
  const incomplete = structuredClone(vulnerable);
  incomplete.report.coverage.complete = false;
  const imported = await service.importReport(context, { bundle: incomplete });
  await assert.rejects(service.create(context, { scanDigest: imported.scan.digest, findingId: incomplete.report.findings[0].id }), /incomplete scan coverage/);
  assert.equal(calls.create, 0);
});


test('compiler and source review claims stay separate and a weaker rescan cannot complete the compiler remediation', async () => {
  const read = async (name) => JSON.parse(await readFile(new URL(`../../../reports/${name}.omniguard.json`, import.meta.url)));
  const source = await read('semantic-source-vulnerable');
  const compiled = await read('semantic-vulnerable');
  const sourceFixed = await read('semantic-source-fixed');
  const compiledFixed = await read('semantic-fixed');
  const { service, calls, comments, issues } = lab();
  const first = await service.importReport(context, { bundle: source });
  const sourceFinding = source.report.findings.find((f) => f.rule_id === 'OG-SOL-001');
  const sourceRecord = await service.create(context, { scanDigest: first.scan.digest, findingId: sourceFinding.id });
  const next = await service.importReport(context, { bundle: compiled });
  const compilerRecord = await service.create(context, { scanDigest: next.scan.digest, findingId: sourceFinding.id });
  assert.notEqual(sourceRecord.id, compilerRecord.id);
  assert.equal(calls.create, 2);
  assert.equal(compilerRecord.baselineAnalysis.mode, 'solc');
  assert.match(JSON.stringify(issues.get(compilerRecord.issueKey).body), /0.8.26/);
  const weaker = await service.importReport(context, { bundle: sourceFixed });
  await assert.rejects(service.verify(context, { remediationId: compilerRecord.id, scanDigest: weaker.scan.digest }), /Analysis mode/);
  assert.equal(comments.length, 0);
  const matching = await service.importReport(context, { bundle: compiledFixed });
  const args = { remediationId: compilerRecord.id, scanDigest: matching.scan.digest };
  await service.verify(context, args);
  await service.complete(context, { ...args, transitionId: '31' });
  assert.equal(comments.length, 1);
  assert.equal(issues.get(compilerRecord.issueKey).status, 'Done');
  assert.equal(issues.get(sourceRecord.issueKey).status, 'To Do');
});
