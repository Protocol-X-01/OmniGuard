import { invoke, router, view } from '@forge/bridge';
import catalog from './rule-catalog.json' with { type: 'json' };

export async function mountCodeEvidence(root) {
const $ = (selector) => root.querySelector(selector);
$('#engine-version').textContent = `OmniGuard v${catalog.engine_version}`;
let state;
let chosenBundle;
let selectedId;
let siteUrl = '';
let busy = false;
let privacyReview = null;

function updatePrivacyControl() {
  const allowed = privacyReview?.legacy > 0 && privacyReview.projectKey === state?.project.key
    && $('#privacy-confirm').value === state.project.key;
  $('#privacy-remove').dataset.unavailable = String(!allowed);
  $('#privacy-remove').disabled = busy || !allowed;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').className = error ? 'notice error' : 'notice';
}
function setBusy(value) {
  busy = value;
  root.querySelectorAll('button[data-action]').forEach((button) => { button.disabled = value || button.dataset.unavailable === 'true'; });
  $('#bundle-file').disabled = value;
  $('#bundle-paste').disabled = value;
  $('#privacy-confirm').disabled = value;
  $('#pr-url').disabled = value;
  updatePrivacyControl();
}
async function refresh() {
  const previous = state;
  state = await invoke('getDashboard');
  if (previous && (previous.project.id !== state.project.id || previous.scan?.digest !== state.scan?.digest)) {
    privacyReview = null;
    $('#privacy-confirm').value = '';
    $('#privacy-summary').textContent = 'Scan state changed. Review stored importer IDs again before removal.';
  }
  render();
}
async function action(work, success) {
  if (busy) return;
  setBusy(true);
  notice('Working…');
  try {
    const result = await work();
    await refresh();
    notice(typeof success === 'function' ? success(result) : success);
  } catch (error) { notice(error.message || 'The action could not be completed.', true); }
  finally { setBusy(false); }
}
function button(text, onClick, disabled = false) {
  const node = element('button', 'action', text);
  node.type = 'button';
  node.dataset.action = 'true';
  node.dataset.unavailable = String(disabled);
  node.disabled = disabled || busy;
  node.addEventListener('click', onClick);
  return node;
}
function issueLink(issueKey) {
  const node = button(issueKey, () => router.open(siteUrl ? `${siteUrl}/browse/${issueKey}` : `/browse/${issueKey}`));
  node.classList.add('issue-link');
  node.setAttribute('aria-label', `Open Jira issue ${issueKey}`);
  return node;
}
function renderFinding(finding) {
  const details = $('#evidence');
  details.replaceChildren();
  const head = element('div', 'finding-head');
  head.append(element('span', 'rule', finding.rule_id), element('span', `severity ${finding.severity}`, finding.severity), element('span', 'checked', 'Source evidence checked'));
  details.append(head, element('h3', '', finding.title), element('p', '', finding.message));
  details.append(element('p', 'location', `${finding.location.file}:${finding.location.start_line}:${finding.location.start_column} · ${finding.confidence} confidence`));
  const snippet = element('pre', '', finding.evidence.excerpt);
  snippet.setAttribute('aria-label', 'Validated source excerpt');
  details.append(snippet, element('p', 'fix', `Suggested remediation: ${finding.remediation}`));
  if (finding.context) details.append(element('p', 'location', `Context: ${finding.context.contract || 'source'}.${finding.context.function || 'scope'}`));
  for (const item of finding.evidence.related || []) {
    const related = element('details', 'related');
    related.append(element('summary', '', `${item.label} · ${item.location.file}:${item.location.start_line}`), element('pre', '', item.excerpt));
    if (item.source_sha256) related.append(element('p', 'digest', `Source SHA-256: ${item.source_sha256}`));
    details.append(related);
  }
  const digest = element('p', 'digest', `Source SHA-256: ${finding.evidence.source_sha256}`);
  details.append(digest);
  const record = state.remediations.find((item) => item.finding.id === finding.id && item.targetId === state.scan.target.id && (item.baselineEngine || '0.1.0') === state.scan.report.engine_version && (item.baselineAnalysis?.mode ?? null) === (state.scan.report.analysis?.mode ?? null) && (item.baselineAnalysis?.compiler_version ?? null) === (state.scan.report.analysis?.compiler_version ?? null));
  if (record) details.append(issueLink(record.issueKey));
  else details.append(button('Create Jira remediation', () => action(() => invoke('createRemediation', { findingId: finding.id, scanDigest: state.scan.digest }), (result) => `${result.issueKey} created with validated fixture evidence.`), state.scan.report.diagnostics.length > 0 || state.scan.report.coverage?.complete === false || Boolean(state.provenanceError)));
}
function render() {
  $('#project').textContent = `Jira project ${state.project.key}`;
  const scan = state.scan;
  $('#mode').textContent = scan ? `${scan.target.name} · ${scan.revision}` : 'Ready for your first scan report';
  $('#scan-meta').textContent = scan ? `${scan.report.scanned_files} source file(s) · engine ${scan.report.engine_version} · ${scan.report.analysis?.mode || "source"}${scan.report.analysis?.compiler_version ? ` (${scan.report.analysis.compiler_version})` : ""} · ${scan.rules.length} rules · ${scan.report.findings.length} findings · imported ${new Date(scan.importedAt).toLocaleString()}` : 'Generate a fixture bundle with OmniGuard, then import it here.';
  $('#pr-provenance').textContent = scan?.provenance ? `Bitbucket PR #${scan.provenance.pullRequestId} · ${scan.provenance.workspace}/${scan.provenance.repository} · source ${scan.provenance.commit} · destination ${scan.provenance.destinationCommit}` : '';
  $('#pr-freshness').textContent = state.provenanceError || '';
  $('#scan-digest').textContent = scan ? `Bundle SHA-256: ${scan.digest}` : '';
  $('#finding-count').textContent = scan ? String(scan.report.findings.length) : '—';
  $('#jira-count').textContent = String(state.remediations.length);
  $('#verified-count').textContent = String(state.remediations.filter((item) => item.verifiedCurrent).length);
  const diagnostics = $('#diagnostics');
  diagnostics.textContent = scan && (scan.report.diagnostics.length || scan.report.coverage?.complete === false) ? `Incomplete scan: ${scan.report.diagnostics.map((item) => item.message).join(' ') || 'Input coverage is incomplete.'}` : '';
  const list = $('#findings');
  const details = $('#evidence');
  list.replaceChildren(); details.replaceChildren();
  const findings = scan?.report.findings || [];
  if (findings.length) {
    if (!findings.some((item) => item.id === selectedId)) selectedId = findings[0].id;
    for (const finding of findings) {
      const item = element('button', 'finding-choice');
      item.type = 'button';
      item.setAttribute('aria-pressed', String(finding.id === selectedId));
      item.append(element('span', `severity ${finding.severity}`, finding.severity), element('strong', '', finding.title), element('span', 'location', `${finding.location.file} · line ${finding.location.start_line}`));
      item.addEventListener('click', () => { selectedId = finding.id; render(); });
      list.append(item);
    }
    renderFinding(findings.find((item) => item.id === selectedId));
  } else {
    details.append(element('h3', '', scan ? (scan.report.diagnostics.length ? 'Review the scan diagnostics' : 'No detections in this imported scan') : 'Your evidence ledger starts here'));
    details.append(element('p', '', scan ? 'Existing Jira remediations remain below so you can verify them against this rescan.' : 'Import the vulnerable fixture bundle to inspect its source evidence and create a remediation.'));
  }
  const tracker = $('#remediations');
  tracker.replaceChildren();
  if (!state.remediations.length) tracker.append(element('p', 'help', 'Choose a finding above to create your first linked Jira remediation.'));
  for (const record of state.remediations) {
    const card = element('article', 'remediation');
    const top = element('div', 'finding-head');
    top.append(issueLink(record.issueKey), element('span', 'status', record.jiraStatus), element('span', 'rule', `baseline engine ${record.baselineEngine || '0.1.0'} · ${record.baselineAnalysis?.mode || 'source'}${record.baselineAnalysis?.compiler_version ? ` (${record.baselineAnalysis.compiler_version})` : ''}`));
    card.append(top, element('h3', '', `${record.finding.rule_id}: ${record.finding.title}`));
    card.append(element('p', '', record.verifiedCurrent ? 'Rescan verification recorded in Jira.' : record.assessment?.reason || 'Import the fixed fixture to verify this remediation.'));
    if (record.verification?.commentId) {
      const commentId = String(record.verification.commentId);
      card.append(button(`Read verification comment ${commentId}`, () => router.open(`${siteUrl}/browse/${record.issueKey}?focusedCommentId=${encodeURIComponent(commentId)}`)));
    }
    if (record.jiraError) card.append(element('p', 'error', record.jiraError));
    if (!record.verifiedCurrent) {
      card.append(button('Record rescan verification in Jira', () => action(() => invoke('verifyRemediation', { remediationId: record.id, scanDigest: scan.digest }), `Verification comment added to ${record.issueKey}.`), !record.assessment?.allowed || Boolean(record.jiraError)));
    } else if (record.completionTransitions?.length) {
      for (const transition of record.completionTransitions) card.append(button(`Move to ${transition.status}`, () => action(() => invoke('completeRemediation', { remediationId: record.id, scanDigest: scan.digest, transitionId: transition.id }), `${record.issueKey} moved to ${transition.status}.`)));
    } else if (record.state !== 'completed') card.append(element('p', 'help', 'Review completion in Jira if your workflow requires extra fields.'));
    tracker.append(card);
  }
  setBusy(busy);
}

function clearCandidate() {
  chosenBundle = null;
  $('#import').dataset.unavailable = 'true';
  $('#import').disabled = true;
}
function prepareCandidate(raw, label) {
  if (new TextEncoder().encode(raw).length > 160 * 1024) throw new Error('Choose a bundle smaller than 160 KiB.');
  let candidate;
  try { candidate = JSON.parse(raw); } catch { throw new Error('Use the complete JSON from an OmniGuard report file.'); }
  if (candidate?.bundle_version !== 1 || candidate.target?.kind !== 'isolated-fixture') throw new Error('Choose an OmniGuard isolated-fixture bundle.');
  chosenBundle = candidate;
  $('#file-summary').textContent = `${label} · ${candidate.revision} · ${candidate.report?.findings?.length ?? '?'} findings. Ready to import.`;
  $('#import').dataset.unavailable = 'false';
  $('#import').disabled = busy;
}
$('#bundle-file').addEventListener('change', async (event) => {
  clearCandidate();
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 160 * 1024) throw new Error('Choose a bundle smaller than 160 KiB.');
    prepareCandidate(await file.text(), file.name);
  } catch (error) { clearCandidate(); notice(error.message, true); }
});
$('#bundle-paste').addEventListener('input', () => {
  clearCandidate();
  $('#file-summary').textContent = 'Press Use pasted report to review this JSON before importing.';
});
$('#use-paste').addEventListener('click', () => {
  clearCandidate();
  try { prepareCandidate($('#bundle-paste').value, 'Pasted report'); }
  catch (error) { clearCandidate(); notice(error.message, true); }
});
$('#import').addEventListener('click', () => action(() => invoke('importReport', { bundle: chosenBundle }), 'Scan imported. Source digests, excerpts, spans and coverage were checked.'));
$('#import-pr').addEventListener('click', () => action(() => invoke('importPullRequest', { url: $('#pr-url').value.trim() }), 'PR scan imported. Repository identity, current commit and all fixture source bytes were checked.'));
$('#refresh').addEventListener('click', () => action(() => Promise.resolve(), 'Jira and scan state refreshed.'));

async function reviewImporterData(remove = false) {
  const confirmProjectKey = $('#privacy-confirm').value;
  privacyReview = null;
  updatePrivacyControl();
  let cursor;
  const totals = { inspected: 0, legacy: 0, removed: 0, projectKey: state.project.key };
  const seen = new Set();
  try {
    // Cursors are used only in this immediate pagination flow, never persisted.
    for (let page = 0; page < 100; page++) {
      const result = await invoke(remove ? 'removeLegacyImporterData' : 'previewImporterData', {
        ...(cursor ? { cursor } : {}), ...(remove ? { confirmProjectKey } : {}),
      });
      totals.inspected += result.inspected;
      totals.legacy += result.legacy;
      totals.removed += result.removed;
      $('#privacy-summary').textContent = remove
        ? `${totals.removed} stored importer IDs removed; ${totals.inspected} scans checked. Checking the next page…`
        : `${totals.inspected} scans checked; ${totals.legacy} contain an older importer ID. Checking the next page…`;
      if (!result.nextCursor) {
        if (!remove) privacyReview = totals;
        else $('#privacy-confirm').value = '';
        $('#privacy-summary').textContent = remove
          ? `Completed this pass: ${totals.removed} stored importer IDs removed from ${totals.inspected} checked scans. Review again to confirm the current result.`
          : `Review complete for ${totals.projectKey}: ${totals.inspected} scans checked; ${totals.legacy} contain an older importer ID.`;
        return totals;
      }
      if (seen.has(result.nextCursor)) throw new Error('The review could not advance.');
      seen.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    throw new Error('This review exceeded 100 pages. Contact support to finish checking this large project.');
  } catch (error) {
    $('#privacy-summary').textContent = `Incomplete pass: ${totals.inspected} scans checked and ${totals.removed} removals confirmed. A failed page may have made additional removals. Review again before continuing. ${error.message}`;
    throw error;
  } finally { updatePrivacyControl(); }
}
$('#privacy-confirm').addEventListener('input', updatePrivacyControl);
$('#privacy-review').addEventListener('click', () => action(() => reviewImporterData(), 'Stored importer ID review completed.'));
$('#privacy-remove').addEventListener('click', () => action(() => reviewImporterData(true), 'Importer ID removal pass completed. Source evidence and Jira records were retained.'));
try { siteUrl = (await view.getContext()).siteUrl || ''; await refresh(); }
catch (error) { $('#mode').textContent = 'OmniGuard could not load'; notice(error.message, true); }

return refresh;
}
