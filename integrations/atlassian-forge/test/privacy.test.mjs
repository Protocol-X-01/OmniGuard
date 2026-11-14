import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrivacyService } from '../src/privacy-service.js';
import { RemediationService } from '../src/remediation-service.js';
import { validateBundle } from '../src/report-bundle.js';

const bundle = JSON.parse(await readFile(new URL('../../../reports/vulnerable.omniguard.json', import.meta.url)));
const context = { accountId: 'fixture-admin', extension: { project: { id: '10000', key: 'KAN' } } };
const clone = (value) => value === undefined ? undefined : structuredClone(value);

function lab(count = 1) {
  const data = new Map();
  const writes = [];
  const authorizations = [];
  for (let i = 0; i < count; i++) {
    const candidate = { ...bundle, revision: `privacy-fixture-${i}` };
    const { digest } = validateBundle(candidate);
    data.set(`og:p:10000:scan:${digest}`, { digest, bundle: candidate, importedAt: '2026-11-14T00:00:00.000Z', importedBy: 'fixture-person' });
  }
  const store = {
    get: async (key) => clone(data.get(key)),
    set: async (key, value) => { writes.push(key); data.set(key, clone(value)); },
    saveScan: async (key, scan, activeKey, digest) => { await store.set(key, scan); await store.set(activeKey, digest); },
    scanPage: async (prefix, cursor) => {
      const rows = [...data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const offset = Number(cursor || 0);
      return { results: rows.slice(offset, offset + 20).map(([key, value]) => ({ key, value: clone(value) })), nextCursor: offset + 20 < rows.length ? String(offset + 20) : undefined };
    },
  };
  const jira = { authorize: async (project, permissions) => { authorizations.push({ project, permissions }); } };
  return { data, store, writes, jira, authorizations, privacy: new PrivacyService({ store, jira }), service: new RemediationService({ store, jira }) };
}

test('new scan imports persist no account identifier and retain validated evidence', async () => {
  const { service, data } = lab(0);
  const { scan } = await service.importReport(context, { bundle });
  const saved = data.get(`og:p:10000:scan:${scan.digest}`);
  assert.deepEqual(saved.bundle, validateBundle(bundle).bundle);
  assert.equal(Object.hasOwn(saved, 'importedBy'), false);
  assert.equal(JSON.stringify([...data]).includes('fixture-admin'), false);
  assert.ok(saved.importedAt);
});

test('admin preview is read-only, paginated, and returns counts without identities or sources', async () => {
  const { privacy, writes, authorizations } = lab(23);
  const first = await privacy.preview(context, {});
  assert.equal(first.inspected, 20);
  assert.equal(first.legacy, 20);
  const second = await privacy.preview(context, { cursor: first.nextCursor });
  assert.equal(second.inspected, 3);
  assert.equal(second.legacy, 3);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(writes, []);
  assert.deepEqual(authorizations[0].permissions, ['ADMINISTER_PROJECTS']);
  assert.deepEqual(Object.keys(first).sort(), ['inspected', 'legacy', 'nextCursor', 'projectKey', 'removed']);
  assert.equal(JSON.stringify(first).includes('fixture-person'), false);
});

test('removal strips only attribution, is idempotent, and leaves other projects and remediations untouched', async () => {
  const { data, privacy } = lab(3);
  const [key, scan] = [...data][0];
  const foreignKey = key.replace(':10000:', ':10001:');
  data.set(foreignKey, clone(scan));
  data.set('og:p:10000:active', scan.digest);
  data.set('og:p:10000:rem:fixture', { issueKey: 'KAN-1', importedBy: 'not-a-scan', verification: { commentId: '1' } });
  const before = clone([...data]);
  const result = await privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN', projectId: '10001' });
  assert.equal(result.removed, 3);
  for (const [entryKey, old] of before) {
    const expected = clone(old);
    if (entryKey.startsWith('og:p:10000:scan:')) delete expected.importedBy;
    assert.deepEqual(data.get(entryKey), expected);
  }
  assert.equal((await privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN' })).removed, 0);
  assert.equal((await privacy.preview(context, {})).legacy, 0);
});

test('project-admin permission and explicit matching project confirmation are both required', async () => {
  const { privacy, jira, writes } = lab();
  for (const confirmProjectKey of [undefined, '', 'kan', 'OTHER']) {
    await assert.rejects(privacy.removeLegacyAttribution(context, { confirmProjectKey }), /project key/);
  }
  jira.authorize = async () => { throw new Error('Jira permission required: ADMINISTER_PROJECTS.'); };
  await assert.rejects(privacy.preview(context, {}), /ADMINISTER_PROJECTS/);
  await assert.rejects(privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN' }), /ADMINISTER_PROJECTS/);
  await assert.rejects(privacy.preview({ ...context, accountId: '' }, {}), /Jira project/);
  assert.deepEqual(writes, []);
});

test('malformed or foreign-project storage pages cannot direct a cleanup', async () => {
  const { store, privacy, writes, data } = lab();
  const key = [...data.keys()][0];
  for (const badKey of [key.replace(':10000:', ':10001:'), 'og:p:10000:active', `${key}:extra`]) {
    store.scanPage = async () => ({ results: [{ key }, { key: badKey }], nextCursor: undefined });
    await assert.rejects(privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN', cursor: 'foreign-cursor' }), /Unexpected storage page/);
  }
  for (const cursor of [null, 1, {}, '', 'x'.repeat(8193)]) {
    await assert.rejects(privacy.preview(context, { cursor }), /review expired/);
  }
  store.scanPage = async () => ({ results: [{ key }], nextCursor: 'same' });
  await assert.rejects(privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN', cursor: 'same' }), /could not advance/);
  assert.deepEqual(writes, []);
});

test('stale query values cannot reintroduce already removed attribution or overwrite current source', async () => {
  const { store, data, privacy, writes } = lab();
  const [key, original] = [...data][0];
  const current = { ...original, note: 'retained current metadata' };
  delete current.importedBy;
  data.set(key, current);
  store.scanPage = async () => ({ results: [{ key, value: original }] });
  assert.equal((await privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN' })).removed, 0);
  assert.deepEqual(data.get(key), current);
  assert.deepEqual(writes, []);
});

test('a re-import with a stale pre-cleanup read activates the scan without restoring identity', async () => {
  const { store, data, service, writes } = lab(0);
  const { digest } = validateBundle(bundle);
  const key = `og:p:10000:scan:${digest}`;
  const original = { digest, bundle, importedAt: '2026-11-14T00:00:00.000Z', importedBy: 'fixture-person' };
  data.set(key, clone(original));
  store.get = async (requested) => {
    const stale = clone(data.get(requested));
    if (requested === key) delete data.get(key).importedBy;
    return stale;
  };
  await service.importReport(context, { bundle });
  assert.equal(Object.hasOwn(data.get(key), 'importedBy'), false);
  assert.deepEqual(writes, ['og:p:10000:active']);
  assert.equal(data.get('og:p:10000:active'), digest);
});

test('storage failure is surfaced and an idempotent retry completes only remaining removals', async () => {
  const { store, privacy, data } = lab(3);
  const realSet = store.set;
  let calls = 0;
  store.set = async (...args) => { if (++calls === 2) throw new Error('fixture storage outage'); return realSet(...args); };
  await assert.rejects(privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN' }), /storage outage/);
  assert.equal([...data.values()].filter((item) => Object.hasOwn(item, 'importedBy')).length, 2);
  store.set = realSet;
  assert.equal((await privacy.removeLegacyAttribution(context, { confirmProjectKey: 'KAN' })).removed, 2);
});
