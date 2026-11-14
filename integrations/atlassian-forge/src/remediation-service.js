import { assessRescan, publicScan, sha256, validateBundle } from './report-bundle.js';

export function projectContext(context) {
  const project = context?.extension?.project;
  if (!context?.accountId || !/^\d+$/.test(String(project?.id)) || !/^[A-Z][A-Z0-9_]{0,29}$/.test(project?.key ?? '')) {
    throw new Error('Open OmniGuard from a Jira project to use this action.');
  }
  return { id: String(project.id), key: project.key, accountId: context.accountId };
}

const prefix = (project) => `og:p:${project.id}:`;
const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const document = (content) => ({ type: 'doc', version: 1, content });

function issueDescription(scan, finding) {
  return document([
    paragraph(`OmniGuard isolated fixture · ${scan.bundle.target.name} · revision ${scan.bundle.revision}`),
    paragraph(`${finding.rule_id}: ${finding.title} (${finding.severity}, ${finding.confidence} confidence)`),
    paragraph(`Analyzer ${scan.bundle.report.engine_version} · ${scan.bundle.report.analysis?.mode || "source"}${scan.bundle.report.analysis?.compiler_version ? ` (${scan.bundle.report.analysis.compiler_version})` : ""} · ${scan.bundle.rules.length} rules · ${finding.context?.contract || "source"}.${finding.context?.function || "scope"}`),
    paragraph(`${finding.location.file}:${finding.location.start_line}:${finding.location.start_column} · bytes ${finding.location.byte_start}–${finding.location.byte_end}`),
    paragraph(finding.message),
    { type: 'codeBlock', content: [{ type: 'text', text: finding.evidence.excerpt }] },
    paragraph(`Suggested remediation: ${finding.remediation}`),
    ...(finding.evidence.related || []).flatMap((item) => [paragraph(`${item.label}: ${item.location.file}:${item.location.start_line}:${item.location.start_column}${item.source_sha256 ? ` · SHA-256 ${item.source_sha256}` : ""}`), { type: "codeBlock", content: [{ type: "text", text: item.excerpt }] }]),
    paragraph(`Source SHA-256: ${finding.evidence.source_sha256}`),
    paragraph(`Scan bundle SHA-256: ${scan.digest}`),
    paragraph('Source evidence was rechecked against the imported source. This is an isolated regression fixture; the detection is a review heuristic.'),
  ]);
}

export class RemediationService {
  constructor({ store, jira, clock = () => new Date().toISOString() }) { Object.assign(this, { store, jira, clock }); }

  async active(project) {
    const digest = await this.store.get(`${prefix(project)}active`);
    return digest ? this.store.get(`${prefix(project)}scan:${digest}`) : null;
  }

  async dashboard(context) {
    const project = projectContext(context);
    await this.jira.authorize(project, []);
    const scan = await this.active(project);
    const records = await this.store.list(`${prefix(project)}rem:`);
    const remediations = await Promise.all(records.filter((record) => !scan || record.targetId === scan.bundle.target.id).map(async (record) => {
      const assessment = assessRescan(record, scan);
      const verifiedCurrent = record.verification?.scanDigest === scan?.digest && assessment.allowed;
      let jiraStatus = record.jiraStatus;
      let completionTransitions = [];
      let jiraError = '';
      try {
        const issue = await this.jira.issue(record.issueKey, project);
        jiraStatus = issue.status;
        if (verifiedCurrent && issue.category !== 'done') completionTransitions = await this.jira.completionTransitions(record.issueKey);
      } catch (error) { jiraError = error.message; }
      return { ...record, jiraStatus, jiraError, assessment, verifiedCurrent, completionTransitions };
    }));
    return { project: { id: project.id, key: project.key }, scan: publicScan(scan), remediations };
  }

  async importReport(context, payload) {
    const project = projectContext(context);
    await this.jira.authorize(project, ['EDIT_ISSUES']);
    const { bundle, digest } = validateBundle(payload?.bundle);
    const key = `${prefix(project)}scan:${digest}`;
    const existing = await this.store.get(key);
    const scan = existing || { bundle, digest, importedAt: this.clock() };
    // Re-activation must not restore attribution from a stale read after cleanup.
    if (existing) await this.store.set(`${prefix(project)}active`, digest);
    else await this.store.saveScan(key, scan, `${prefix(project)}active`, digest);
    return { scan: publicScan(scan) };
  }

  async current(project, digest) {
    const scan = await this.active(project);
    if (!scan || scan.digest !== digest) throw new Error('The active scan changed. Refresh and review the current evidence.');
    return scan;
  }

  async create(context, payload) {
    const project = projectContext(context);
    await this.jira.authorize(project, ['CREATE_ISSUES']);
    const scan = await this.current(project, payload?.scanDigest);
    if (scan.bundle.report.diagnostics.length || scan.bundle.report.coverage?.complete === false) throw new Error('Resolve incomplete scan coverage before creating a remediation.');
    const finding = scan.bundle.report.findings.find((item) => item.id === payload?.findingId);
    if (!finding) throw new Error('Choose a finding from the active validated scan.');
    const analysis = scan.bundle.report.analysis;
    const profilePart = scan.bundle.report.schema_version === 1 ? "" : `${scan.bundle.report.engine_version}\0${analysis ? `${analysis.mode}\0${analysis.compiler_version ?? ""}\0` : ""}`;
    const id = sha256(`${project.id}\0${scan.bundle.target.id}\0${profilePart}${finding.id}`).slice(0, 24);
    const key = `${prefix(project)}rem:${id}`;
    const previous = await this.store.get(key);
    if (previous) return previous;
    const label = `og-${id}`;
    const property = { projectId: project.id, targetId: scan.bundle.target.id, findingId: finding.id, scanDigest: scan.digest };
    if (scan.bundle.report.schema_version >= 2) property.engineVersion = scan.bundle.report.engine_version;
    if (analysis) property.analysisProfile = `${analysis.mode}:${analysis.compiler_version ?? ""}`;
    const issueTypeId = await this.jira.taskType(project);
    const claimed = await this.store.claim(`${key}:create`, { startedAt: this.clock() });
    let created;
    if (!claimed) {
      const saved = await this.store.get(key);
      if (saved) return saved;
      created = await this.jira.findExisting(project, label, property);
      if (!created) throw new Error('Jira creation is pending or its outcome is uncertain. Refresh after checking Jira; a duplicate will not be created.');
    } else {
      try {
        created = await this.jira.createIssue({
          fields: {
            project: { id: project.id }, issuetype: { id: issueTypeId },
            summary: `[OmniGuard fixture] ${finding.rule_id}: ${finding.title}`.slice(0, 255),
            description: issueDescription(scan, finding), labels: ['omniguard', 'isolated-fixture', label],
          }, properties: [{ key: 'omniguard', value: property }],
        });
      } catch (error) {
        if (error.definitive) await this.store.remove(`${key}:create`);
        throw error;
      }
    }
    const record = { id, issueKey: created.key, jiraStatus: created.status || 'To Do', targetId: scan.bundle.target.id,
      baselineDigest: scan.digest, baselineRevision: scan.bundle.revision, baselineEngine: scan.bundle.report.engine_version, baselineRules: [...scan.bundle.rules], ...(analysis ? { baselineAnalysis: { ...analysis } } : {}), finding, label, createdAt: this.clock(), state: 'open' };
    await this.store.set(key, record);
    return record;
  }

  async remediation(project, id) {
    if (!/^[a-f0-9]{24}$/.test(id ?? '')) throw new Error('Invalid remediation reference.');
    const key = `${prefix(project)}rem:${id}`;
    const record = await this.store.get(key);
    if (!record) throw new Error('This remediation does not belong to the current Jira project.');
    await this.jira.issue(record.issueKey, project);
    return { key, record };
  }

  async verify(context, payload) {
    const project = projectContext(context);
    await this.jira.authorize(project, ['ADD_COMMENTS']);
    const scan = await this.current(project, payload?.scanDigest);
    const { key, record } = await this.remediation(project, payload?.remediationId);
    const assessment = assessRescan(record, scan);
    if (!assessment.allowed) throw new Error(assessment.reason);
    if (record.verification?.scanDigest === scan.digest) return record;
    const claimKey = `${key}:verify:${scan.digest}`;
    const claimed = await this.store.claim(claimKey, { startedAt: this.clock() });
    let comment;
    if (!claimed) {
      comment = await this.jira.findVerificationComment(record.issueKey, scan.digest);
      if (!comment) throw new Error('Verification is pending. Refresh after checking the Jira comment.');
    } else {
      try {
        comment = await this.jira.addComment(record.issueKey, document([
          paragraph(`OmniGuard rescan verification: ${scan.digest}`),
          paragraph(`${record.finding.rule_id} is absent in ${record.finding.location.file} in imported revision ${scan.bundle.revision}. The imported report declares ${scan.bundle.rules.length}-rule coverage under engine ${scan.bundle.report.engine_version} (${scan.bundle.report.analysis?.mode || "source"}${scan.bundle.report.analysis?.compiler_version ? `, ${scan.bundle.report.analysis.compiler_version}` : ""}) and contains no diagnostics.`),
          paragraph(`Previous source SHA-256: ${record.finding.evidence.source_sha256}`),
          paragraph(`Rescanned source SHA-256: ${assessment.sourceSha256}`),
          paragraph('This records absence in an imported isolated-fixture scan. Review the code change before completing the Jira issue.'),
        ]));
      } catch (error) {
        if (error.definitive) await this.store.remove(claimKey);
        throw error;
      }
    }
    record.verification = { scanDigest: scan.digest, revision: scan.bundle.revision, sourceSha256: assessment.sourceSha256,
      commentId: comment.id, verifiedAt: this.clock() };
    record.state = 'verified-absent';
    await this.store.set(key, record);
    return record;
  }

  async complete(context, payload) {
    const project = projectContext(context);
    await this.jira.authorize(project, ['TRANSITION_ISSUES']);
    const scan = await this.current(project, payload?.scanDigest);
    const { key, record } = await this.remediation(project, payload?.remediationId);
    if (record.verification?.scanDigest !== scan.digest || !assessRescan(record, scan).allowed) throw new Error('Verify this remediation against the current rescan before completing it.');
    let issue = await this.jira.issue(record.issueKey, project);
    if (issue.category !== 'done') {
      const transitions = await this.jira.completionTransitions(record.issueKey);
      if (!transitions.some((transition) => transition.id === payload?.transitionId)) throw new Error('Choose an available completion transition.');
      await this.jira.transition(record.issueKey, payload.transitionId);
      issue = await this.jira.issue(record.issueKey, project);
      if (issue.category !== 'done') throw new Error('Jira has not confirmed a completed status. Refresh before continuing.');
    }
    Object.assign(record, { state: 'completed', jiraStatus: issue.status, completedAt: this.clock() });
    await this.store.set(key, record);
    return record;
  }
}
