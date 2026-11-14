import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness } from './frontline-harness.mjs';
const baseline = JSON.parse(await readFile(new URL('../../../fixtures/frontline/team-risk.bundle.json', import.meta.url)));
const fixed = JSON.parse(await readFile(new URL('../../../fixtures/frontline/team-retest.bundle.json', import.meta.url)));
async function setup() {
  const h = harness(); await h.service.import(h.context, { bundle: baseline });
  h.record = await h.service.create(h.context, { entryId: 'entry-1', digest: baseline.intake_sha256 });
  h.payload = { id: h.record.id, digest: baseline.intake_sha256, reason: 'request_context' };
  h.preview = await h.service.contact(h.context, h.payload);
  h.send = { ...h.payload, expiresAt: h.preview.expiresAt, token: h.preview.token };
  return h;
}
test('review precedes one real ADF mention; state carries no account ID, message or token', async () => {
  const h = await setup(); assert.equal(h.comments.length, 0); assert.equal(h.preview.recipient, 'Fixture responder');
  const receipt = await h.service.contact(h.context, h.send, true);
  assert.equal((await h.service.contact(h.context, h.send, true)).duplicate, true);
  assert.equal(h.comments.length, 1);
  assert.equal(h.comments[0].body.content[0].content[0].type, 'mention');
  assert.equal(h.comments[0].body.content[0].content[0].attrs.id, 'fixture-responder');
  const view = await h.service.dashboard(h.context);
  assert.equal(view.cases[0].contacts[0].commentId, receipt.commentId);
  assert.equal(view.cases[0].decision, 'needs_context'); assert.equal(view.cases[0].status, 'To do');
  const stored = JSON.stringify([...h.data.values()]);
  for (const secret of ['fixture-responder', h.preview.token, h.preview.message]) assert.equal(stored.includes(secret), false);
});
test('changed assignee, actor, purpose, digest and expired review fail before posting', async () => {
  for (const change of ['assignee', 'actor', 'purpose', 'digest', 'expiry']) {
    const h = await setup(); let context = h.context, payload = { ...h.send };
    if (change === 'assignee') h.issues.get(h.record.issueKey).fields.assignee.accountId = 'other-responder';
    if (change === 'actor') context = { ...context, accountId: 'other-responder' };
    if (change === 'purpose') payload.reason = 'retest_review';
    if (change === 'digest') await h.service.import(h.context, { bundle: fixed });
    if (change === 'expiry') h.now += 301;
    await assert.rejects(h.service.contact(context, payload, true), /changed|expired/); assert.equal(h.comments.length, 0);
  }
});
test('unassigned, inactive, foreign-project and denied actors cannot contact', async () => {
  for (const mode of ['unassigned', 'inactive', 'foreign', 'denied']) {
    const h = await setup(); let context = h.context;
    if (mode === 'unassigned') h.issues.get(h.record.issueKey).fields.assignee = null;
    if (mode === 'inactive') h.issues.get(h.record.issueKey).fields.assignee.active = false;
    if (mode === 'foreign') context = { ...h.context, extension: { project: { id: '20000', key: 'OTHER' } } };
    if (mode === 'denied') h.permissions.delete('ADD_COMMENTS');
    await assert.rejects(h.service.contact(context, h.send, true)); assert.equal(h.comments.length, 0);
  }
});
test('arbitrary recipients, free text and forged tokens are rejected', async () => {
  const h = await setup();
  for (const extra of [{ accountId: 'someone' }, { message: 'private text' }]) await assert.rejects(h.service.contact(h.context, { ...h.send, ...extra }, true));
  await assert.rejects(h.service.contact(h.context, { ...h.send, token: '0'.repeat(64) }, true));
  assert.equal(h.comments.length, 0);
});
test('response loss recovers the original comment without sending another mention', async () => {
  const h = await setup(), add = h.jira.addComment;
  h.jira.addComment = async (...args) => { await add(...args); throw new Error('Response lost'); };
  await assert.rejects(h.service.contact(h.context, h.send, true), /Response lost/);
  h.jira.addComment = add;
  await h.service.contact(h.context, h.send, true); assert.equal(h.comments.length, 1);
});
test('uncertain contact without a visible receipt is never blindly retried', async () => {
  const h = await setup(); let posts = 0;
  h.jira.addComment = async () => { posts++; throw new Error('Response lost'); };
  await assert.rejects(h.service.contact(h.context, h.send, true), /Response lost/);
  await assert.rejects(h.service.contact(h.context, h.send, true), /uncertain/);
  assert.equal(posts, 1);
});
test('assignment change during comment lookup blocks the final send', async () => {
  const h = await setup(), find = h.jira.findVerificationComment;
  h.jira.findVerificationComment = async (...args) => { h.issues.get(h.record.issueKey).fields.assignee.accountId = 'replacement'; return find(...args); };
  await assert.rejects(h.service.contact(h.context, h.send, true), /recipient or review changed/); assert.equal(h.comments.length, 0);
});
test('definitive Jira rejection permits a reviewed retry; a storage failure recovers once', async () => {
  const h = await setup(), add = h.jira.addComment;
  h.jira.addComment = async () => { throw Object.assign(new Error('Forbidden'), { definitive: true }); };
  await assert.rejects(h.service.contact(h.context, h.send, true)); h.jira.addComment = add;
  const save = h.service.save; h.service.save = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(h.service.contact(h.context, h.send, true), /Storage/); h.service.save = save;
  await h.service.contact(h.context, h.send, true); assert.equal(h.comments.length, 1);
});
