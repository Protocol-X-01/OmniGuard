import { projectContext } from './remediation-service.js';
import { assess, fail, hash } from './frontline-evidence.js';

const DAY = 86400;
const root = p => `og:p:${p.id}:`;
const key = (p, id) => `${root(p)}rq:item:${id}`;
const empty = () => ({ revision: 0, reviewer: null, deputy: null, handoff: null, decision: null, history: [] });
const fields = (value, expected) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== expected.length || expected.some(k => !Object.hasOwn(value, k))) fail('Missing or unexpected review field.');
};
const actions = {
  take_reviewer: ['label'], take_deputy: ['label'], release_reviewer: [], release_deputy: [],
  handoff: ['toRole', 'purpose'], accept: [], decide: ['decision', 'reason'],
};
export const reviewReasons = { context_checked: 'Context and evidence checked', changes_needed: 'Changes need attention', missing_context: 'More context needed' };
export const handoffPurposes = { review_evidence: 'Review the evidence', add_context: 'Add the missing context', address_changes: 'Address requested changes' };

/** Coordinates existing Jira work. A review receipt never completes a remediation. */
export class ReviewQueueService {
  constructor({ store, jira, pullRequests, clock = () => Math.floor(Date.now() / 1000) }) { Object.assign(this, { store, jira, pullRequests, clock }); }

  async sources(p) {
    const activeDigest = await this.store.get(`${root(p)}active`);
    const scan = activeDigest ? await this.store.get(`${root(p)}scan:${activeDigest}`) : null;
    const records = await this.store.list(`${root(p)}rem:`);
    const team = await this.store.get(`${root(p)}fl:state`);
    const rows = [];
    let prGap = '';
    if (scan?.provenance) {
      try { await this.pullRequests.assertCurrent(scan.provenance); }
      catch { prGap = 'Pull-request provenance is unavailable or its heads changed.'; }
    }
    for (const r of records) {
      const current = scan?.bundle?.target?.id === r.targetId ? scan : null;
      const importedAt = current?.importedAt ? Date.parse(current.importedAt) / 1000 : null;
      const gaps = [];
      if (!current) gaps.push('No active report for this target.');
      if (!Number.isFinite(importedAt)) gaps.push('Import time is unknown.');
      if (current?.bundle.report.diagnostics.length || current?.bundle.report.coverage?.complete === false) gaps.push('Current scan has diagnostics or incomplete coverage.');
      if (current?.provenance && prGap) gaps.push(prGap);
      rows.push({ id: `code:${r.id}`, kind: 'Code evidence', issueKey: r.issueKey, title: `${r.finding.rule_id} · ${r.finding.title}`, baselineDigest: r.baselineDigest,
        digest: current?.digest || null, observedAt: importedAt, expiresAt: Number.isFinite(importedAt) ? importedAt + DAY : null,
        ageBasis: 'Since import · scan capture time unknown', coverage: current?.bundle.report.coverage?.complete === false ? 'Incomplete' : current ? 'Declared rule set' : 'Unavailable', gaps });
    }
    const results = team ? assess(team.bundle.intake, this.clock()) : [];
    for (const r of team?.cases || []) {
      const entry = team.bundle.intake.entries.find(e => e.id === r.entry.id && e.check_id === r.entry.check_id);
      const result = results.find(v => v.entry_id === r.entry.id);
      const gaps = [];
      if (!entry || !entry.evidence) gaps.push('Current entry-point evidence is missing.');
      if (result?.coverage !== 'assessed') gaps.push(`Entry-point coverage: ${result?.coverage || 'unavailable'}.`);
      if (r.pending || r.pendingDecision) gaps.push('An earlier Jira action needs recovery.');
      rows.push({ id: `team:${r.id}`, kind: 'Team defence', issueKey: r.issueKey, title: `${r.entry.check_id} · ${r.entry.name}`, baselineDigest: r.baselineDigest,
        digest: team.digest, observedAt: entry?.evidence?.captured_at ?? null, expiresAt: entry?.evidence?.expires_at ?? null,
        ageBasis: 'Since supplied capture', coverage: `${result?.coverage || 'unavailable'} · ${result?.outcome || 'unknown'}`, gaps });
    }
    if (rows.length > 100) fail('This first release supports up to 100 tracked review items.', 409);
    return rows;
  }

  async enrich(p, row) {
    let issue;
    try { issue = await this.jira.issue(row.issueKey, p); }
    catch { return null; } // Do not reveal issue metadata when issue-level access fails.
    const owner = issue.assignee?.active === true && issue.assignee.accountId ? issue.assignee : null;
    const gaps = [...row.gaps];
    const now = this.clock();
    if (row.observedAt === null || !Number.isFinite(row.observedAt) || row.observedAt > now) gaps.push('Evidence time is missing or in the future.');
    if (row.expiresAt === null || row.expiresAt <= now) gaps.push('Evidence is outside its review window.');
    if (!owner) gaps.push('Assign an active Jira owner.');
    const evidenceToken = hash([p.id, row.id, row.baselineDigest, row.digest, row.observedAt, row.expiresAt, owner?.accountId || null, row.gaps]);
    return { ...row, owner, status: issue.status, done: issue.category === 'done', gaps, fresh: gaps.length === 0, evidenceToken,
      ageSeconds: row.observedAt === null ? null : Math.max(0, now - row.observedAt) };
  }

  basis(row, state) { return hash([row.evidenceToken, state.reviewer?.accountId || null, state.deputy?.accountId || null]); }
  publicRow(p, row, state) {
    const basis = this.basis(row, state);
    const isOwner = row.owner?.accountId === p.accountId;
    const isReviewer = state.reviewer?.accountId === p.accountId;
    const isDeputy = state.deputy?.accountId === p.accountId;
    const independent = Boolean(state.reviewer && state.reviewer.accountId !== row.owner?.accountId);
    const handoffCurrent = row.fresh && state.handoff?.basis === basis;
    const reviewed = row.fresh && independent && state.decision?.basis === basis && state.decision.decision === 'reviewed';
    const role = r => r ? { label: r.label, isYou: r.accountId === p.accountId } : null;
    const handoff = state.handoff ? { toRole: state.handoff.toRole, purpose: state.handoff.purpose, at: state.handoff.at, acceptedAt: state.handoff.acceptedAt, current: handoffCurrent,
      recipient: state.handoff.toRole === 'owner' ? row.owner?.displayName || 'Unassigned' : state[state.handoff.toRole]?.label || 'Unassigned' } : null;
    const changesRequested = row.fresh && independent && state.decision?.basis === basis && state.decision.decision === 'needs_changes';
    const status = !row.fresh ? 'Blocked' : reviewed ? 'Reviewed' : changesRequested ? 'Changes requested' : handoffCurrent ? (state.handoff.acceptedAt ? 'In hand' : 'Awaiting acceptance') : 'Review required';
    const { owner, ...safe } = row;
    return { ...safe, owner: owner ? { label: owner.displayName || 'Jira owner', isYou: isOwner } : null, revision: state.revision,
      reviewer: role(state.reviewer), deputy: role(state.deputy), independent, reviewStatus: status, handoff, reviewed,
      decision: state.decision ? { decision: state.decision.decision, reason: state.decision.reason, at: state.decision.at, current: row.fresh && independent && state.decision.basis === basis } : null,
      history: state.history.map(({ actor, ...event }) => ({ ...event, actor: actor.label, isYou: actor.accountId === p.accountId })),
      can: { takeReviewer: !state.reviewer && !isOwner && !isDeputy, takeDeputy: !state.deputy && !isOwner && !isReviewer,
        releaseReviewer: isReviewer, releaseDeputy: isDeputy, handoff: row.fresh && Boolean(isOwner || isReviewer || isDeputy)
          && (!handoffCurrent || Boolean(state.handoff.acceptedAt && state.handoff.toAccountId === p.accountId)),
        accept: handoffCurrent && !state.handoff.acceptedAt && state.handoff.toAccountId === p.accountId,
        decide: handoffCurrent && Boolean(state.handoff.acceptedAt) && state.handoff.toRole === 'reviewer' && isReviewer && independent && state.handoff.toAccountId === p.accountId },
    };
  }

  async dashboard(context) {
    const p = projectContext(context);
    await this.jira.authorize(p, ['BROWSE_PROJECTS']);
    const rows = [], sources = await this.sources(p);
    for (const source of sources) {
      const row = await this.enrich(p, source);
      if (row) rows.push(this.publicRow(p, row, await this.store.get(key(p, row.id)) || empty()));
    }
    return { project: { id: p.id, key: p.key }, refreshedAt: this.clock(), rows, unavailable: sources.length - rows.length, reviewWindowSeconds: DAY };
  }

  async act(context, payload) {
    const p = projectContext(context);
    if (!Object.hasOwn(actions, payload?.action || '')) fail('Choose a supported review action.');
    fields(payload, ['id', 'revision', 'evidenceToken', 'action', ...actions[payload.action]]);
    if (!/^(code|team):[a-f0-9]{24}$/.test(payload.id) || !Number.isSafeInteger(payload.revision) || payload.revision < 0 || !/^[a-f0-9]{64}$/.test(payload.evidenceToken)) fail('Invalid review reference.');
    await this.jira.authorize(p, ['BROWSE_PROJECTS', 'EDIT_ISSUES']);
    const lock = `${root(p)}rq:lock`;
    if (!await this.store.claim(lock, { at: this.clock() })) fail('Another review change is pending. Refresh; an interrupted action needs operator recovery.', 409);
    try {
      const source = (await this.sources(p)).find(r => r.id === payload.id);
      const row = source ? await this.enrich(p, source) : null;
      if (!row) fail('Review item is unavailable in this project.', 404);
      const state = await this.store.get(key(p, row.id)) || empty();
      if (state.revision !== payload.revision || row.evidenceToken !== payload.evidenceToken) fail('Evidence, ownership or the review changed. Refresh before acting.', 409);
      if (state.history.length >= 80) fail('This fixture item reached its 80-event review history limit.', 409);
      const basis = this.basis(row, state), view = this.publicRow(p, row, state), operation = payload.action;
      const actor = { accountId: p.accountId, label: row.owner?.accountId === p.accountId ? row.owner.displayName || 'Jira owner' : state.reviewer?.accountId === p.accountId ? state.reviewer.label : state.deputy?.accountId === p.accountId ? state.deputy.label : 'Project participant' };
      let event = {};
      if (operation.startsWith('take_')) {
        const role = operation.slice(5);
        if (!view.can[role === 'reviewer' ? 'takeReviewer' : 'takeDeputy']) fail('This role needs a separate participant and must be unclaimed.', 403);
        if (typeof payload.label !== 'string' || payload.label !== payload.label.trim() || payload.label.length < 1 || payload.label.length > 60 || /[\p{C}<>]/u.test(payload.label)) fail('Provide a display label of 1–60 visible characters.');
        actor.label = payload.label;
        state[role] = { accountId: p.accountId, label: payload.label };
        event = { role, label: payload.label };
      } else if (operation.startsWith('release_')) {
        const role = operation.slice(8);
        if (state[role]?.accountId !== p.accountId) fail('Only the participant holding this role can release it.', 403);
        state[role] = null;
        event = { role };
      } else if (operation === 'handoff') {
        if (!row.fresh || !(row.owner?.accountId === p.accountId || state.reviewer?.accountId === p.accountId || state.deputy?.accountId === p.accountId)) fail('A current owner, reviewer or deputy and fresh evidence are required.', 403);
        if (!['owner', 'reviewer', 'deputy'].includes(payload.toRole) || !Object.hasOwn(handoffPurposes, payload.purpose)) fail('Choose a supported recipient role and purpose.');
        const recipient = payload.toRole === 'owner' ? row.owner : state[payload.toRole];
        if (!recipient || recipient.accountId === p.accountId) fail('Choose another assigned participant.', 409);
        if (state.handoff?.basis === basis && !state.handoff.acceptedAt) fail('The current recipient must accept the pending handoff first.', 409);
        if (state.handoff?.basis === basis && state.handoff.acceptedAt && state.handoff.toAccountId !== p.accountId) fail('The current recipient owns the next handoff.', 403);
        state.handoff = { toRole: payload.toRole, toAccountId: recipient.accountId, purpose: payload.purpose, at: this.clock(), acceptedAt: null, basis };
        state.decision = null;
        event = { toRole: payload.toRole, purpose: payload.purpose };
      } else if (operation === 'accept') {
        if (!view.can.accept) fail('Only the current recipient can accept a fresh handoff.', 403);
        state.handoff.acceptedAt = this.clock();
      } else if (operation === 'decide') {
        if (!view.can.decide) fail('An independent reviewer must accept the current handoff before deciding.', 403);
        if (!['reviewed', 'needs_changes'].includes(payload.decision) || !Object.hasOwn(reviewReasons, payload.reason)
          || (payload.decision === 'reviewed') !== (payload.reason === 'context_checked')) fail('Choose a matching review decision and reason.');
        state.decision = { decision: payload.decision, reason: payload.reason, at: this.clock(), basis };
        event = { decision: payload.decision, reason: payload.reason };
      }
      const latest = (await this.sources(p)).find(r => r.id === payload.id);
      const checked = latest ? await this.enrich(p, latest) : null;
      if (!checked || checked.evidenceToken !== row.evidenceToken || (!operation.startsWith('take_') && !operation.startsWith('release_') && !checked.fresh)) fail('Evidence or ownership changed during this action. Refresh.', 409);
      state.revision++;
      state.history.push({ revision: state.revision, action: operation, at: this.clock(), actor, evidenceToken: row.evidenceToken, digest: row.digest, ...event });
      await this.store.set(key(p, row.id), state);
      return this.publicRow(p, checked, state);
    } finally { await this.store.remove(lock); }
  }
}
