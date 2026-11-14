import { invoke, router, view } from '@forge/bridge';
import catalog from './rule-catalog.json' with { type: 'json' };

const $ = (selector) => document.querySelector(selector);
$('#engine-version').textContent = `OmniGuard v${catalog.engine_version}`;
let state;
let chosenBundle;
let selectedId;
let siteUrl = '';
let busy = false;

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
  document.querySelectorAll('button[data-action]').forEach((button) => { button.disabled = value || button.dataset.unavailable === 'true'; });
  $('#bundle-file').disabled = value;
  $('#bundle-paste').disabled = value;
}
async function refresh() {
  state = await invoke('getDashboard');
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
  else details.append(button('Create Jira remediation', () => action(() => invoke('createRemediation', { findingId: finding.id, scanDigest: state.scan.digest }), (result) => `${result.issueKey} created with validated fixture evidence.`), state.scan.report.diagnostics.length > 0 || state.scan.report.coverage?.complete === false));
}
function render() {
  $('#project').textContent = `Jira project ${state.project.key}`;
  const scan = state.scan;
  $('#mode').textContent = scan ? `${scan.target.name} · ${scan.revision}` : 'Ready for your first scan report';
  $('#scan-meta').textContent = scan ? `${scan.report.scanned_files} source file(s) · engine ${scan.report.engine_version} · ${scan.report.analysis?.mode || "source"}${scan.report.analysis?.compiler_version ? ` (${scan.report.analysis.compiler_version})` : ""} · ${scan.rules.length} rules · ${scan.report.findings.length} findings · imported ${new Date(scan.importedAt).toLocaleString()}` : 'Generate a fixture bundle with OmniGuard, then import it here.';
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
$('#refresh').addEventListener('click', () => action(() => Promise.resolve(), 'Jira and scan state refreshed.'));
try { siteUrl = (await view.getContext()).siteUrl || ''; await refresh(); }
catch (error) { $('#mode').textContent = 'OmniGuard could not load'; notice(error.message, true); }
