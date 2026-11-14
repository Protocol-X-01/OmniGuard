import { projectContext } from './remediation-service.js';
import { assess, checks, exact, fail, hash, retest, validateFrontline } from './frontline-evidence.js';
const prefix = p => `og:p:${p.id}:fl:`;
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const document = texts => ({ type: 'doc', version: 1, content: texts.map(paragraph) });
export class FrontlineService {
  constructor({ store, jira, clock = () => Math.floor(Date.now() / 1000) }) { Object.assign(this, { store, jira, clock }); }
  async state(p) { return this.store.get(`${prefix(p)}state`); }
  async dashboard(context) {
    const p = projectContext(context);
    await this.jira.authorize(p, ['BROWSE_PROJECTS']);
    const state = await this.state(p);
    const cases = [];
    for (const record of state?.cases || []) {
      const assessment = retest(record, state, this.clock());
      const current = !record.pendingDecision && assessment.allowed && record.verification?.digest === state.digest;
      let issue = {}, transitions = [], jiraError = '';
      try {
        if (!record.issueKey) throw new Error('Pending Jira outcome');
        issue = await this.jira.issue(record.issueKey, p);
        if (current && issue.category !== 'done') transitions = await this.jira.completionTransitions(record.issueKey);
      } catch { jiraError = 'Jira state is unavailable. Refresh before acting.'; }
      cases.push({ ...record, assessment, current, status: issue.status || (record.pending ? 'Creation pending' : 'Unavailable'), transitions, jiraError });
    }
    return { project: { id: p.id, key: p.key }, engagement: state ? { bundle: state.bundle, digest: state.digest, results: assess(state.bundle.intake, this.clock()) } : null, cases, checks };
  }
  async mutate(context, permissions, work) {
    const p = projectContext(context);
    await this.jira.authorize(p, permissions);
    const lock = `${prefix(p)}lock`;
    if (!await this.store.claim(lock, { startedAt: this.clock() })) fail('Another engagement change is pending. Refresh; an interrupted action needs operator recovery.', 409);
    try { return await work(p, await this.state(p)); }
    finally { await this.store.remove(lock); }
  }
  current(state, digest) {
    if (!state || state.digest !== digest) fail('The active evidence changed. Refresh and review it.', 409);
  }
  async save(p, state) {
    if (Buffer.byteLength(JSON.stringify(state)) > 200000) fail('This fixture engagement exceeds the storage limit.');
    await this.store.set(`${prefix(p)}state`, state);
  }
  async import(context, payload) {
    exact(payload, ['bundle']);
    return this.mutate(context, ['EDIT_ISSUES'], async (p, state) => {
      const validated = validateFrontline(payload.bundle, this.clock());
      const next = validated.bundle.intake;
      if (state) {
        if (next.engagement_id !== state.bundle.intake.engagement_id) fail('This first release supports one engagement per Jira project.');
        if (validated.digest === state.digest) return { digest: state.digest, duplicate: true };
        if (next.sequence <= state.bundle.intake.sequence) fail('An older or conflicting sequence cannot replace current evidence.', 409);
      }
      await this.store.set(`${prefix(p)}scan:${validated.digest}`, validated.bundle);
      await this.save(p, { bundle: validated.bundle, digest: validated.digest, cases: state?.cases || [] });
      return { digest: validated.digest, duplicate: false };
    });
  }
  async create(context, payload) {
    exact(payload, ['entryId', 'digest']);
    return this.mutate(context, ['CREATE_ISSUES', 'ASSIGN_ISSUES'], async (p, state) => {
      this.current(state, payload.digest);
      const entry = state.bundle.intake.entries.find(e => e.id === payload.entryId);
      const result = assess(state.bundle.intake, this.clock()).find(r => r.entry_id === payload.entryId);
      if (!entry) fail('Choose a current, evidenced failed check.');
      const id = hash([state.bundle.intake.engagement_id, entry.id, entry.check_id]).slice(0, 24);
      const previous = state.cases.find(r => r.id === id);
      if (previous?.issueKey) return previous;
      if (!previous && state.cases.length >= 20) fail('This fixture engagement already has 20 tracked cases.');
      const key = `${prefix(p)}create:${id}`;
      const property = { projectId: p.id, engagementId: state.bundle.intake.engagement_id, entryId: entry.id, checkId: entry.check_id, digest: state.digest };
      const existingClaim = await this.store.get(key);
      if (!existingClaim && (result.coverage !== 'assessed' || result.outcome !== 'fail')) fail('Choose a current, evidenced failed check.');
      const issueTypeId = existingClaim ? null : await this.jira.taskType(p, ['assignee']);
      let pending = { property, record: { id, entry, baselineDigest: state.digest, sequence: state.bundle.intake.sequence, decision: 'needs_context', history: [], issueKey: null, pending: true } };
      const label = `ogfl-${id}`;
      let created;
      if (!await this.store.claim(key, pending)) {
        pending = await this.store.get(key);
        created = await this.jira.findExisting(p, label, pending.property);
        if (!created) fail('Jira creation outcome is uncertain. Review Jira before retrying; no duplicate was created.', 409);
      } else {
        state.cases = [...state.cases.filter(r => r.id !== id), pending.record];
        try { await this.save(p, state); } catch (e) { await this.store.remove(key); throw e; }
        try {
          created = await this.jira.createIssue({ fields: {
            project: { id: p.id }, issuetype: { id: issueTypeId }, assignee: { accountId: p.accountId },
            summary: `[OmniGuard fixture] ${entry.check_id}: ${entry.name}`, labels: ['omniguard', 'frontline-fixture', label],
            description: document([`Synthetic team-defence fixture: ${state.bundle.intake.name}`, `Accountable team: ${entry.owner}`, checks.find(c => c.id === entry.check_id).guidance, ...result.reasons, `Evidence ${entry.evidence.id}; captured ${entry.evidence.captured_at}; expires ${entry.evidence.expires_at}.`, `Intake SHA-256: ${state.digest}`, 'The supplied observations were validated. This is not confirmation of an attack or independent verification of a device or person.']),
          }, properties: [{ key: 'omniguard', value: property }] });
        } catch (error) {
          if (error.definitive) { await this.store.remove(key); state.cases = state.cases.filter(r => r.id !== id); await this.save(p, state); }
          throw error;
        }
      }
      const record = { ...pending.record, issueKey: created.key, pending: false };
      state.cases = [...state.cases.filter(r => r.id !== id), record];
      await this.save(p, state);
      return record;
    });
  }
  async action(context, payload, operation) {
    const fields = operation === 'decision' ? ['id', 'digest', 'decision', 'reason'] : operation === 'complete' ? ['id', 'digest', 'transitionId'] : ['id', 'digest'];
    exact(payload, fields);
    return this.mutate(context, operation === 'complete' ? ['EDIT_ISSUES', 'TRANSITION_ISSUES'] : ['EDIT_ISSUES', 'ADD_COMMENTS'], async (p, state) => {
      this.current(state, payload.digest);
      const record = state.cases.find(r => r.id === payload.id);
      if (!record) fail('Choose a case in this project.', 404);
      if (!record.issueKey) fail('Recover the pending Jira creation before triage or retest.', 409);
      if (record.pendingDecision && operation !== 'decision') fail('Recover the pending decision before retest or completion.', 409);
      const issue = await this.jira.issue(record.issueKey, p);
      if (operation === 'decision') {
        if (!['needs_context', 'confirmed', 'accepted_risk', 'false_positive'].includes(payload.decision) || !['needs_evidence', 'approved_exception', 'verified_context', 'scheduled_remediation'].includes(payload.reason)) fail('Choose a supported decision and reason.');
        if (record.pendingDecision && (record.pendingDecision.decision !== payload.decision || record.pendingDecision.reason !== payload.reason)) fail('Recover the original pending decision before recording another one.', 409);
        const last = record.history.at(-1);
        if (!record.pendingDecision && last?.digest === state.digest && last.decision === payload.decision && last.reason === payload.reason) return record;
        if (record.history.length >= 30) fail('This fixture case has reached its decision-history limit.');
        const decision = record.pendingDecision || { decision: payload.decision, reason: payload.reason, digest: state.digest,
          marker: hash([record.id, state.digest, record.history.length, payload.decision, payload.reason]) };
        const markerPrefix = 'OmniGuard front-line decision: ';
        let receipt = await this.jira.findVerificationComment(record.issueKey, decision.marker, markerPrefix);
        if (!receipt) {
          const claim = `${prefix(p)}decision:${record.id}:${decision.marker}`;
          if (!await this.store.claim(claim, { at: this.clock() })) fail('The Jira decision outcome is uncertain. Refresh after checking Jira; no duplicate comment was sent.', 409);
          record.pendingDecision = decision;
          try { await this.save(p, state); } catch (e) { await this.store.remove(claim); throw e; }
          try { receipt = await this.jira.addComment(record.issueKey, document([
            `${markerPrefix}${decision.marker}`, `${decision.decision}: ${decision.reason}.`,
            `Entry point ${record.entry.name}; evidence ${decision.digest}. This decision is not a verified fix. Jira records the acting user's authorship.`,
          ])); }
          catch (e) { if (e.definitive) { await this.store.remove(claim); record.pendingDecision = null; await this.save(p, state); } throw e; }
        }
        record.decision = decision.decision;
        record.history.push({ decision: decision.decision, reason: decision.reason, at: this.clock(), digest: decision.digest, commentId: String(receipt.id) });
        record.pendingDecision = null;
        record.verification = null;
      } else {
        const assessment = retest(record, state, this.clock());
        if (!assessment.allowed) fail(assessment.reason, 409);
        const marker = `frontline:${record.id}:${state.digest}`;
        if (operation === 'verify') {
          let comment = await this.jira.findVerificationComment(record.issueKey, marker);
          if (!comment) {
            const check = retest(record, state, this.clock()); if (!check.allowed) fail(check.reason, 409);
            const claim = `${prefix(p)}verify:${record.id}:${state.digest}`;
            if (!await this.store.claim(claim, { at: this.clock() })) fail('Jira verification outcome is uncertain. Refresh after checking Jira; no duplicate comment was sent.', 409);
            try {
              comment = await this.jira.addComment(record.issueKey, document([
                `OmniGuard rescan verification: ${marker}`,
                `Synthetic front-line retest: ${record.entry.check_id} for ${record.entry.name}. New observations satisfy the named check.`,
                `Evidence SHA-256 ${state.digest}; sequence ${state.bundle.intake.sequence}. Truth of the supplied observations is not independently attested.`,
              ]));
            } catch (e) { if (e.definitive) await this.store.remove(claim); throw e; }
          }
          record.verification = { digest: state.digest, commentId: String(comment.id), at: this.clock() };
        } else {
          if (record.verification?.digest !== state.digest) fail('Record verification for the current evidence before completion.', 409);
          if (issue.category !== 'done') {
            const transitions = await this.jira.completionTransitions(record.issueKey);
            if (!transitions.some(t => t.id === payload.transitionId)) fail('Choose a currently available completion transition.');
            const check = retest(record, state, this.clock()); if (!check.allowed) fail(check.reason, 409);
            await this.jira.transition(record.issueKey, payload.transitionId);
          }
        }
      }
      await this.save(p, state);
      return record;
    });
  }
}
