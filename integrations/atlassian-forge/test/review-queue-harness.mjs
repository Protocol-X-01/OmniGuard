import { harness } from './frontline-harness.mjs';
import { ReviewQueueService } from '../src/review-queue-service.js';
import { hash, assess } from '../src/frontline-evidence.js';

export function reviewHarness() {
  const h = harness({ now: Math.floor(Date.now() / 1000) });
  h.store.list = async prefix => [...h.data.entries()].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes(':')).map(([,v])=>structuredClone(v));
  const people = { owner: 'Alex · response owner', reviewer: 'Morgan · independent reviewer', deputy: 'Casey · deputy', outsider: 'Project observer' };
  h.contextFor = actor => ({ accountId: actor, extension: { project: { id: '10000', key: 'LOCAL' } } });
  h.jira.issue = async (key, p) => {
    const v = h.issues.get(key);
    if (!v || v.fields.project.id !== p.id || h.denied?.has(p.accountId)) throw new Error('Issue unavailable');
    const accountId = v.fields.assignee?.accountId;
    return { key, status: v.status, category: v.category, assignee: accountId ? { accountId, displayName: people[accountId] || 'Fixture owner', active: true } : null };
  };
  h.queue = new ReviewQueueService({ store: h.store, jira: h.jira, clock: () => h.now, pullRequests: { assertCurrent: async () => { if (h.changedPr) throw new Error('PR changed'); } } });
  h.bundle = sequence => {
    const intake = { schema_version: 1, isolated_fixture: true, engagement_id: 'shared-review-lab', name: 'Shared review exercise', sequence, entries: [
      { id: 'handoff-entry', name: 'Incident evidence handoff', owner: 'Response team', check_id: 'OG-FL-001', evidence: { id: `evidence-${sequence}`, source: 'synthetic_fixture', captured_at: h.now - 120, expires_at: h.now + 3600, facts: {} } },
    ] };
    // Match the real check's full schema, with one failed observation.
    return import('../src/frontline-evidence.js').then(({ checks }) => {
      const check = checks[0];intake.entries[0].check_id=check.id;
      intake.entries[0].evidence.facts=Object.fromEntries(check.facts.map((f,i)=>[f,i!==0]));
      return { engine_version: 'frontline-0.1.0', intake, intake_sha256: hash(intake), assessed_at: h.now, results: assess(intake,h.now) };
    });
  };
  h.seed = async () => {
    const b=await h.bundle(1);await h.service.import(h.contextFor('owner'),{bundle:b});
    await h.service.create(h.contextFor('owner'),{entryId:'handoff-entry',digest:b.intake_sha256});
    return h;
  };
  h.row = async actor => (await h.queue.dashboard(h.contextFor(actor))).rows[0];
  h.act = async (actor, action, rest = {}, row) => {
    row ||= await h.row(actor);
    return h.queue.act(h.contextFor(actor), {id:row.id,revision:row.revision,evidenceToken:row.evidenceToken,action,...rest});
  };
  return h;
}
