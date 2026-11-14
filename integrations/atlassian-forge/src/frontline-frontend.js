const $ = s => document.querySelector(s);
const local = location.hostname === '127.0.0.1';
const { invoke, router, view } = local ? {} : await import('@forge/bridge');
let state, chosen, busy = false, site = '';
const routes = { getFrontline: '', importFrontline: '/import', createFrontline: '/create', decideFrontline: '/decision', verifyFrontline: '/verify', completeFrontline: '/complete' };
async function call(name, payload) {
  if (!local) return invoke(name, payload);
  const r = await fetch(`/api/frontline${routes[name]}`, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OmniGuard-Local': '1' }, body: JSON.stringify(payload) } : {});
  const body = await r.json();
  if (!r.ok) throw new Error(body.message);
  return body;
}
function el(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
function notice(text, error = false) { $('#notice').textContent = text; $('#notice').className = `notice${error ? ' error' : ''}`; }
function controls() { document.querySelectorAll('button,input,select').forEach(n => { n.disabled = busy || n.dataset.blocked === 'true'; }); $('#import').disabled = busy || !chosen; }
function button(text, fn, disabled = false) { const n = el('button', text); n.type = 'button'; n.dataset.blocked = String(disabled); n.disabled = busy || disabled; n.onclick = fn; return n; }
async function refresh() { state = await call('getFrontline'); render(); }
async function action(fn, message) {
  if (busy) return;
  const focusId = document.activeElement?.id;
  busy = true; controls(); notice('Checking evidence and permissions…');
  try { await fn(); await refresh(); notice(message); }
  catch (e) { try { await refresh(); } catch { /* Keep the original failure visible. */ } notice(e.message || 'The action could not be completed.', true); }
  finally { busy = false; controls(); (focusId ? document.getElementById(focusId) : null)?.focus(); if (!focusId) $('#notice').focus(); }
}
function render() {
  if (local && state.previewClock !== null) $('#runtime-label').textContent = `Local simulated Jira · reproducible fixture clock: ${new Date(state.previewClock * 1000).toISOString()} · not live monitoring.`;
  const engagement = state.engagement;
  $('#project').textContent = `${state.project.key} · ${local ? 'Local simulated Jira' : 'Jira project'}`;
  const entries = engagement?.bundle.intake.entries || [];
  const rows = engagement?.results || [];
  $('#count-total').textContent = entries.length;
  $('#count-failed').textContent = rows.filter(r => r.outcome === 'fail').length;
  $('#count-passed').textContent = rows.filter(r => r.outcome === 'pass').length;
  $('#count-gaps').textContent = rows.filter(r => r.coverage !== 'assessed').length;
  $('#engagement-meta').textContent = engagement ? `${engagement.bundle.intake.name} · sequence ${engagement.bundle.intake.sequence} · supplied synthetic observations` : 'Import evidence to start an engagement.';
  $('#entries').replaceChildren();
  for (const entry of entries) {
    const r = rows.find(x => x.entry_id === entry.id), check = state.checks.find(c => c.id === entry.check_id);
    const card = el('article', undefined, 'card');
    card.append(el('span', r.coverage === 'assessed' ? (r.outcome === 'pass' ? 'Check satisfied' : 'Action needed') : r.coverage, `pill ${r.outcome}`), el('h3', entry.name));
    const dl = el('dl');
    for (const [key, value] of [['Owner', entry.owner || 'Unassigned — coverage gap'], ['Check', check?.name || entry.check_id || 'Undefined'], ['Evidence', entry.evidence?.id || 'Not supplied']]) dl.append(el('dt', key), el('dd', value));
    card.append(dl);
    if (r.reasons.length) card.append(el('p', r.reasons.map(reason => reason.replaceAll('_', ' ')).join('. '), 'muted'));
    if (entry.evidence) {
      const details = el('details'), list = el('ul'); details.append(el('summary', 'Review observations'));
      for (const [key, value] of Object.entries(entry.evidence.facts)) list.append(el('li', `${key.replaceAll('_', ' ')}: ${value ? 'reported yes' : 'reported no'}`));
      details.append(list, el('p', `Captured ${new Date(entry.evidence.captured_at * 1000).toISOString()} · expires ${new Date(entry.evidence.expires_at * 1000).toISOString()}`, 'muted')); card.append(details);
    }
    const tracked = state.cases.some(c => c.entry.id === entry.id && c.entry.check_id === entry.check_id);
    if (r.outcome === 'fail') card.append(button(tracked ? 'Already in remediation' : 'Assign Jira remediation to me', () => action(() => call('createFrontline', { entryId: entry.id, digest: engagement.digest }), 'Remediation created with the evidence baseline and assigned to you.'), tracked));
    $('#entries').append(card);
  }
  $('#cases').replaceChildren();
  if (!state.cases.length) $('#cases').append(el('p', 'No remediation cases yet. Start with an evidenced check that needs action.', 'muted'));
  for (const item of state.cases) {
    const card = el('article', undefined, 'case'), head = el('div', undefined, 'case-head');
    head.append(el('h3', `${item.issueKey || 'Pending Jira creation'} · ${item.entry.name}`), el('span', `Jira: ${item.status}`, 'pill'));
    card.append(head, el('p', `Decision: ${item.decision.replaceAll('_', ' ')}. ${item.assessment.reason}`));
    card.append(el('span', item.current ? 'Retest current' : 'Retest not current', `pill ${item.current ? 'pass' : 'unknown'}`));
    if (item.pendingDecision) card.append(el('p', 'The Jira decision outcome is pending. Record the displayed original decision again to recover its receipt.', 'notice'));
    if (item.jiraError) card.append(el('p', item.jiraError, 'notice error'));
    card.append(el('p', `Original evidence: ${item.baselineDigest}`, 'digest'));
    if (item.pending) {
      card.append(button('Recover Jira result', () => action(() => call('createFrontline', { entryId: item.entry.id, digest: engagement.digest }), 'The original Jira result was recovered without creating a duplicate.')));
      $('#cases').append(card); continue;
    }
    const form = el('div', undefined, 'case-controls');
    const select = (title, values, current) => { const group = el('div'), input = el('select'); input.id = `${item.id}-${title}`; const label = el('label', title); label.htmlFor = input.id; for (const value of values) { const option = el('option', value.replaceAll('_', ' ')); option.value = value; option.selected = value === current; input.append(option); } group.append(label, input); form.append(group); return input; };
    const decision = select('Decision', ['needs_context', 'confirmed', 'accepted_risk', 'false_positive'], item.pendingDecision?.decision || item.decision);
    const reason = select('Reason', ['needs_evidence', 'approved_exception', 'verified_context', 'scheduled_remediation'], item.pendingDecision?.reason || item.history.at(-1)?.reason || 'needs_evidence');
    const base = { id: item.id, digest: engagement.digest };
    form.append(button('Record decision', () => action(() => call('decideFrontline', { ...base, decision: decision.value, reason: reason.value }), 'Decision recorded. Risk decisions do not count as verified fixes.')));
    form.append(button(item.current ? 'Retest recorded' : 'Record verified retest', () => action(() => call('verifyFrontline', base), 'Retest recorded in Jira with the current evidence reference.'), !item.assessment.allowed || item.current || Boolean(item.jiraError) || Boolean(item.pendingDecision)));
    for (const transition of item.transitions) form.append(button(`Complete · ${transition.name}`, () => action(() => call('completeFrontline', { ...base, transitionId: transition.id }), 'Jira completion recorded after the current retest.')));
    if (!local) form.append(button('Open in Jira', () => router.open(`${site}/browse/${item.issueKey}`)));
    card.append(form);
    if (item.history.length) { const d = el('details'); d.append(el('summary', `${item.history.length} recorded decisions`)); const list = el('ul'); item.history.forEach(h => list.append(el('li', `${new Date(h.at * 1000).toISOString()}: ${h.decision.replaceAll('_', ' ')} — ${h.reason.replaceAll('_', ' ')}`))); d.append(list); card.append(d); }
    $('#cases').append(card);
  }
  controls();
}
$('#bundle').onchange = async event => {
  chosen = null; controls();
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 65536) throw new Error('Choose a bundle up to 64 KiB.'); const parsed = JSON.parse(await file.text()); chosen = parsed; $('#file-status').textContent = `${file.name} is ready for server validation.`; notice('Review your chosen bundle, then validate and import.'); }
  catch (e) { notice(e.message, true); }
  controls();
};
$('#import').onclick = () => action(() => call('importFrontline', { bundle: chosen }), 'Evidence imported. Coverage and freshness were recalculated.');
$('#refresh').onclick = () => action(() => Promise.resolve(), 'Coverage, evidence expiry and Jira status refreshed.');
$('#runtime-label').textContent = local ? 'Local preview · simulated Jira · memory resets when the preview stops.' : 'Forge workflow · current-user Jira permissions · synthetic fixture evidence only.';
if (local) {
  document.querySelector('nav a[href="./index.html"]').remove();
  document.querySelector('.brand').href = './frontline.html';
  $('#demo-controls').hidden = false;
  for (const [id, name] of [['#demo-risk', 'team-risk'], ['#demo-retest', 'team-retest']]) $(id).onclick = () => action(async () => {
    const response = await fetch(`/fixtures/${name}.bundle.json`); if (!response.ok) throw new Error('Generate the native fixtures first.');
    await call('importFrontline', { bundle: await response.json() });
  }, 'Fixture evidence imported. Unsupported and unassessed entries remain visible.');
} else { try { site = (await view.getContext()).siteUrl || ''; } catch { /* Resolver still enforces project context. */ } }
try { await refresh(); notice('Ready. Evidence and coverage stay attached to each handoff.'); } catch (e) { notice(e.message, true); }
