import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { exact, fail, hash } from './frontline-evidence.js';

const prompts = {
  request_context: 'Please review the linked evidence and add the context needed for this check in Jira.',
  remediation_update: 'Please add a remediation update and confirm who owns the next step in Jira.',
  retest_review: 'Please review the recorded retest and confirm any follow-up needed in Jira.',
};
const markerPrefix = 'OmniGuard owner contact: ';
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });

export async function contact(service, context, payload, send = false) {
  exact(payload, send ? ['id', 'digest', 'reason', 'expiresAt', 'token'] : ['id', 'digest', 'reason']);
  if (!Object.hasOwn(prompts, payload.reason)) fail('Choose a supported contact purpose.');
  return service.mutate(context, ['BROWSE_PROJECTS', 'EDIT_ISSUES', 'ADD_COMMENTS'], async (p, state) => {
    service.current(state, payload.digest);
    const record = state.cases.find(r => r.id === payload.id);
    if (!record?.issueKey) fail('Choose an existing remediation in this project.', 404);
    const issue = await service.jira.issue(record.issueKey, p);
    if (!issue.assignee?.accountId || issue.assignee.active !== true) fail('Assign an active Jira user before contacting the owner.', 409);
    const recipient = issue.assignee.displayName || 'Jira assignee';
    const message = `${prompts[payload.reason]} Check ${record.entry.check_id}. Evidence SHA-256: ${state.digest}.`;
    const marker = hash([record.id, state.digest, payload.reason]);
    const secretKey = `og:p:${p.id}:fl:contact-secret`;
    let secret = await service.store.get(secretKey);
    if (!secret) {
      await service.store.claim(secretKey, randomBytes(32).toString('hex'));
      secret = await service.store.get(secretKey);
    }
    const signature = expiresAt => createHmac('sha256', secret).update(JSON.stringify([
      p.id, p.accountId, record.id, issue.key, issue.assignee.accountId, recipient, state.digest, payload.reason, message, expiresAt,
    ])).digest('hex');
    const existing = record.contacts?.find(c => c.marker === marker);
    if (!send) {
      const expiresAt = service.clock() + 300;
      return { recipient, message, issueKey: record.issueKey, expiresAt, token: signature(expiresAt), alreadySent: Boolean(existing), commentId: existing?.commentId || null };
    }
    if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= service.clock() || payload.expiresAt > service.clock() + 300
      || typeof payload.token !== 'string' || !/^[a-f0-9]{64}$/.test(payload.token)
      || !timingSafeEqual(Buffer.from(payload.token, 'hex'), Buffer.from(signature(payload.expiresAt), 'hex'))) {
      fail('The recipient, evidence or review changed or expired. Preview the message again.', 409);
    }
    if (existing) return { commentId: existing.commentId, duplicate: true };
    if ((record.contacts?.length || 0) >= 30) fail('This fixture case has reached its contact limit. Continue in Jira.');
    const claim = `og:p:${p.id}:fl:contact:${marker}`;
    let receipt = await service.jira.findVerificationComment(record.issueKey, marker, markerPrefix);
    if (!receipt) {
      if (!await service.store.claim(claim, { at: service.clock() })) fail('The Jira contact outcome is uncertain. Check Jira before retrying; no duplicate mention was sent.', 409);
      // Re-read immediately before posting: external Jira assignment may change while comments load.
      const latest = await service.jira.issue(record.issueKey, p);
      if (latest.assignee?.accountId !== issue.assignee.accountId || latest.assignee.active !== true || latest.assignee.displayName !== issue.assignee.displayName || payload.expiresAt <= service.clock()) {
        await service.store.remove(claim);
        fail('The recipient or review changed. Preview the message again.', 409);
      }
      try {
        receipt = await service.jira.addComment(record.issueKey, { type: 'doc', version: 1, content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { id: issue.assignee.accountId, text: `@${recipient}` } }, { type: 'text', text: ` ${message}` }] },
          paragraph(`${markerPrefix}${marker}`),
          paragraph('Synthetic OmniGuard fixture coordination. This comment is not a read receipt or a verified fix.'),
        ] });
      } catch (e) { if (e.definitive) await service.store.remove(claim); throw e; }
    }
    record.contacts = [...(record.contacts || []), { marker, reason: payload.reason, digest: state.digest, at: service.clock(), commentId: String(receipt.id) }];
    await service.save(p, state);
    return { commentId: String(receipt.id), duplicate: false };
  });
}
