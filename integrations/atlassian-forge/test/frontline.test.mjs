import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assess, hash, validateFrontline } from '../src/frontline-evidence.js';
import { harness } from './frontline-harness.mjs';
const read = name => readFile(new URL(`../../../fixtures/frontline/${name}.bundle.json`, import.meta.url), 'utf8').then(JSON.parse);
const baseline = await read('team-risk'), fixed = await read('team-retest');
const refreshBundle = bundle => { bundle.intake_sha256 = hash(bundle.intake); bundle.results = assess(bundle.intake, bundle.assessed_at); return bundle; };
async function started() { const h = harness(); await h.service.import(h.context, { bundle: baseline }); const record = await h.service.create(h.context, { entryId: 'entry-1', digest: baseline.intake_sha256 }); return { ...h, record }; }
test('native Rust and Forge agree on both fixture reports and current coverage', () => {
  for (const bundle of [baseline, fixed]) assert.equal(validateFrontline(bundle, 1794673260).digest, bundle.intake_sha256);
  assert.equal(assess(fixed.intake, 1794673260).filter(r => r.coverage !== 'assessed').length, 2);
  assert.equal(validateFrontline(fixed, 1794760000).currentResults[0].coverage, 'stale');
});
test('tampered facts, findings, raw messages, false boolean types and future reports are rejected', () => {
  for (const mutate of [b => { b.intake.entries[0].evidence.facts.requester_verified = true; }, b => { b.results[0].outcome = 'pass'; }, b => { b.intake.message_body = 'raw private chat'; }, b => { b.intake.entries[0].evidence.facts.requester_verified = 'true'; }, b => { b.assessed_at = 4102444800; }]) {
    const b = structuredClone(baseline); mutate(b); assert.throws(() => validateFrontline(b, 1794673260));
  }
});
test('identical imports are idempotent; conflicting and older sequences cannot overwrite', async () => {
  const h = harness(); await h.service.import(h.context, { bundle: baseline });
  assert.equal((await h.service.import(h.context, { bundle: baseline })).duplicate, true);
  const conflict = structuredClone(baseline); conflict.intake.name = 'Different name'; refreshBundle(conflict);
  await assert.rejects(h.service.import(h.context, { bundle: conflict }), /conflicting sequence/);
  await h.service.import(h.context, { bundle: fixed }); await assert.rejects(h.service.import(h.context, { bundle: baseline }), /older/);
});
test('owner, check, evidence and current freshness are necessary for a remediation', async () => {
  const h = harness(); await h.service.import(h.context, { bundle: baseline });
  for (const id of ['unknown-integration', 'awaiting-intake', 'missing']) await assert.rejects(h.service.create(h.context, { entryId: id, digest: baseline.intake_sha256 }), /evidenced failed/);
  h.now = 1794760000; await assert.rejects(h.service.create(h.context, { entryId: 'entry-1', digest: baseline.intake_sha256 }), /evidenced failed/);
});
test('the complete workflow assigns, preserves a baseline, records a separate reviewer and explicitly completes', async () => {
  const h = await started();
  assert.equal(h.issues.get(h.record.issueKey).fields.assignee.accountId, 'fixture-responder');
  await h.service.import(h.context, { bundle: fixed });
  const reviewer = { ...h.context, accountId: 'fixture-reviewer' };
  const payload = { id: h.record.id, digest: fixed.intake_sha256 };
  await assert.rejects(h.service.action(reviewer, { ...payload, transitionId: '31' }, 'complete'), /Record verification/);
  await h.service.action(reviewer, payload, 'verify'); await h.service.action(reviewer, payload, 'verify');
  assert.equal(h.comments.length, 1);
  assert.equal(h.issues.get(h.record.issueKey).status, 'To do');
  await h.service.action(reviewer, { ...payload, transitionId: '31' }, 'complete');
  assert.equal(h.issues.get(h.record.issueKey).status, 'Done');
  assert.equal((await h.service.dashboard(reviewer)).cases[0].baselineDigest, baseline.intake_sha256);
  assert.ok(h.calls.some(c => c[0] === 'authorize' && c[1] === 'fixture-reviewer'));
});
test('risk and false-positive decisions never stand in for a verified fix', async () => {
  const h = await started(); await h.service.import(h.context, { bundle: fixed });
  const payload = { id: h.record.id, digest: fixed.intake_sha256 };
  for (const decision of ['accepted_risk', 'false_positive']) {
    await h.service.action(h.context, { ...payload, decision, reason: 'approved_exception' }, 'decision');
    await assert.rejects(h.service.action(h.context, payload, 'verify'), /triage decision/);
  }
  assert.equal(h.comments.filter(c => JSON.stringify(c.body).includes('OmniGuard rescan verification:')).length, 0);
  assert.equal(h.comments.length, 2);
  assert.equal((await h.service.dashboard(h.context)).cases[0].history.length, 2);
});
test('read, assignment, cross-project and stale-action permission boundaries hold', async () => {
  const h = await started();
  h.permissions.delete('BROWSE_PROJECTS'); await assert.rejects(h.service.dashboard(h.context), /permission/); h.permissions.add('BROWSE_PROJECTS');
  h.permissions.delete('ASSIGN_ISSUES'); await assert.rejects(h.service.create(h.context, { entryId: 'entry-2', digest: baseline.intake_sha256 }), /permission/);
  const foreign = { ...h.context, extension: { project: { id: '20000', key: 'OTHER' } } };
  await assert.rejects(h.service.action(foreign, { id: h.record.id, digest: baseline.intake_sha256 }, 'verify'), /active evidence/);
  await h.service.import(h.context, { bundle: fixed });
  await assert.rejects(h.service.action(h.context, { id: h.record.id, digest: baseline.intake_sha256 }, 'verify'), /active evidence/);
});
test('dropping, renaming or changing the original entry point cannot verify it', async () => {
  for (const change of [b => { b.intake.entries.shift(); }, b => { b.intake.entries[0].name = 'Other interaction'; }, b => { b.intake.entries[0].check_id = 'OG-FUTURE-001'; }]) {
    const h = await started(), b = structuredClone(fixed); change(b); refreshBundle(b);
    await h.service.import(h.context, { bundle: b });
    await assert.rejects(h.service.action(h.context, { id: h.record.id, digest: b.intake_sha256 }, 'verify'), /original entry point/);
  }
});
test('a changed bundle with the original observation cannot count as a retest', async () => {
  const h = await started(), b = structuredClone(fixed);
  b.intake.entries[0].evidence.id = baseline.intake.entries[0].evidence.id; refreshBundle(b);
  await h.service.import(h.context, { bundle: b });
  await assert.rejects(h.service.action(h.context, { id: h.record.id, digest: b.intake_sha256 }, 'verify'), /newer evidence/);
});
test('concurrent mutations are rejected rather than losing another decision', async () => {
  const h = await started(); const key = 'og:p:10000:fl:lock'; await h.store.claim(key, { startedAt: h.now });
  await assert.rejects(h.service.import(h.context, { bundle: fixed }), /change is pending/);
  assert.equal((await h.service.dashboard(h.context)).engagement.digest, baseline.intake_sha256);
});
test('an uncertain Jira creation is recovered without a duplicate issue', async () => {
  const h = harness(); await h.service.import(h.context, { bundle: baseline });
  const create = h.jira.createIssue; h.jira.createIssue = async body => { await create(body); throw new Error('Response lost'); };
  const payload = { entryId: 'entry-1', digest: baseline.intake_sha256 };
  await assert.rejects(h.service.create(h.context, payload), /Response lost/);
  h.jira.createIssue = create;
  await h.service.create(h.context, payload);
  assert.equal(h.issues.size, 1); assert.equal((await h.service.dashboard(h.context)).cases.length, 1);
});
test('later expiry invalidates a previously recorded verification', async () => {
  const h = await started(); await h.service.import(h.context, { bundle: fixed });
  const payload = { id: h.record.id, digest: fixed.intake_sha256 };
  await h.service.action(h.context, payload, 'verify'); h.service.clock = () => 1794760000;
  await assert.rejects(h.service.action(h.context, { ...payload, transitionId: '31' }, 'complete'), /current, complete/);
});
test('pending creation remains visible and can be recovered after newer evidence arrives', async () => {
  const h = harness(); await h.service.import(h.context, { bundle: baseline });
  const original = h.jira.createIssue;
  h.jira.createIssue = async body => { await original(body); throw new Error('Response lost'); };
  await assert.rejects(h.service.create(h.context, { entryId: 'entry-1', digest: baseline.intake_sha256 }));
  assert.equal((await h.service.dashboard(h.context)).cases[0].pending, true);
  await h.service.import(h.context, { bundle: fixed });
  h.jira.createIssue = original;
  const recovered = await h.service.create(h.context, { entryId: 'entry-1', digest: fixed.intake_sha256 });
  assert.equal(recovered.baselineDigest, baseline.intake_sha256);
  assert.equal(recovered.pending, false); assert.equal(h.issues.size, 1);
});
test('an uncertain comment is not resent while Jira has no visible receipt', async () => {
  const h = await started(); await h.service.import(h.context, { bundle: fixed });
  const original = h.jira.addComment; let sends = 0;
  h.jira.addComment = async () => { sends++; throw new Error('Response lost'); };
  const payload = { id: h.record.id, digest: fixed.intake_sha256 };
  await assert.rejects(h.service.action(h.context, payload, 'verify'), /Response lost/);
  await assert.rejects(h.service.action(h.context, payload, 'verify'), /outcome is uncertain/);
  assert.equal(sends, 1);
  h.jira.addComment = original;
});
test('expiry while Jira metadata loads blocks the final transition', async () => {
  const h = await started(); await h.service.import(h.context, { bundle: fixed });
  const payload = { id: h.record.id, digest: fixed.intake_sha256 };
  await h.service.action(h.context, payload, 'verify');
  h.jira.completionTransitions = async () => { h.service.clock = () => 1794760000; return [{ id: '31', name: 'Done' }]; };
  await assert.rejects(h.service.action(h.context, { ...payload, transitionId: '31' }, 'complete'), /current, complete/);
  assert.equal(h.issues.get(h.record.issueKey).status, 'To do');
});
test('a definitive Jira rejection releases creation for a corrected retry', async () => {
  const h = harness(); await h.service.import(h.context, { bundle: baseline });
  const original = h.jira.createIssue;
  h.jira.createIssue = async () => { throw Object.assign(new Error('Not assignable'), { definitive: true }); };
  const payload = { entryId: 'entry-1', digest: baseline.intake_sha256 };
  await assert.rejects(h.service.create(h.context, payload), /Not assignable/);
  assert.equal((await h.service.dashboard(h.context)).cases.length, 0);
  h.jira.createIssue = original; await h.service.create(h.context, payload); assert.equal(h.issues.size, 1);
});
test('a pending triage decision is permission-gated and recovered once with its original evidence', async () => {
  const h = await started();
  const payload = { id: h.record.id, digest: baseline.intake_sha256, decision: 'confirmed', reason: 'verified_context' };
  h.permissions.delete('ADD_COMMENTS');
  await assert.rejects(h.service.action(h.context, payload, 'decision'), /permission/);
  assert.equal(h.comments.length, 0);
  h.permissions.add('ADD_COMMENTS');
  const original = h.jira.addComment; let sends = 0, pendingBody;
  h.jira.addComment = async (key, body) => { sends++; pendingBody = body; throw new Error('Response lost'); };
  await assert.rejects(h.service.action(h.context, payload, 'decision'), /Response lost/);
  await assert.rejects(h.service.action(h.context, payload, 'decision'), /outcome is uncertain/);
  await assert.rejects(h.service.action(h.context, { ...payload, decision: 'accepted_risk' }, 'decision'), /original pending decision/);
  await h.service.import(h.context, { bundle: fixed });
  await assert.rejects(h.service.action(h.context, { id: h.record.id, digest: fixed.intake_sha256 }, 'verify'), /pending decision/);
  assert.equal(sends, 1);
  await original(h.record.issueKey, pendingBody); // Simulate the delayed Jira receipt becoming visible.
  h.jira.addComment = original;
  await h.service.action(h.context, { ...payload, digest: fixed.intake_sha256 }, 'decision');
  const recovered = (await h.service.dashboard(h.context)).cases[0];
  assert.equal(recovered.pendingDecision, null);
  assert.equal(recovered.history.length, 1);
  assert.equal(recovered.history[0].digest, baseline.intake_sha256);
  assert.equal(recovered.history[0].commentId, '1');
  assert.equal(h.comments.length, 1);
  await h.service.action(h.context, { id: h.record.id, digest: fixed.intake_sha256 }, 'verify');
  assert.equal(h.comments.length, 2);
});
