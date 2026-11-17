import { createHash } from 'node:crypto';
import checks from '../../../contracts/frontline-checks-v1.json' with { type: 'json' };
export { checks };
export const ENGINE = 'frontline-0.1.0';
export const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
export const hash = (v) => createHash('sha256').update(canonical(v)).digest('hex');
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function exact(v, fields) {
  if (!v || Array.isArray(v) || typeof v !== 'object' || Object.keys(v).length !== fields.length || fields.some(k => !Object.hasOwn(v, k))) fail('Missing or unexpected field; raw messages and attachments are not accepted');
}
const label = (v, name = false) => typeof v === 'string' && v.trim().length > 0 && (name ? /^[a-zA-Z0-9 _.-]{1,80}$/ : /^[a-zA-Z0-9_-]{1,64}$/).test(v);
const epoch = n => Number.isSafeInteger(n) && n >= 0 && n <= 4102444800;
export function validateIntake(v) {
  if (Buffer.byteLength(JSON.stringify(v) ?? '') > 65536) fail('Intake exceeds 64 KiB');
  exact(v, ['schema_version', 'isolated_fixture', 'engagement_id', 'name', 'sequence', 'entries']);
  if (v.schema_version !== 1 || v.isolated_fixture !== true || !label(v.engagement_id) || !label(v.name, true) || !Number.isInteger(v.sequence) || v.sequence < 1 || v.sequence > 1000000) fail('Invalid fixture identity or sequence');
  if (!Array.isArray(v.entries) || v.entries.length < 1 || v.entries.length > 20) fail('Expected 1 to 20 entry points');
  const ids = new Set(), evidenceIds = new Set();
  for (const e of v.entries) {
    exact(e, ['id', 'name', 'owner', 'check_id', 'evidence']);
    if (!label(e.id) || !label(e.name, true) || ids.has(e.id) || !(e.owner === null || label(e.owner, true)) || !(e.check_id === null || label(e.check_id))) fail('Invalid or duplicate entry point');
    ids.add(e.id);
    if (e.evidence === null) continue;
    const ev = e.evidence;
    exact(ev, ['id', 'source', 'captured_at', 'expires_at', 'facts']);
    if (!label(ev.id) || evidenceIds.has(ev.id) || ev.source !== 'synthetic_fixture') fail('Expected unique synthetic evidence');
    evidenceIds.add(ev.id);
    if (!epoch(ev.captured_at) || !epoch(ev.expires_at) || ev.expires_at <= ev.captured_at || ev.expires_at - ev.captured_at > 86400) fail('Evidence lifetime must be at most 24 hours');
    if (!ev.facts || Array.isArray(ev.facts) || typeof ev.facts !== 'object' || Object.keys(ev.facts).length > 12 || Object.entries(ev.facts).some(([k, value]) => !label(k) || typeof value !== 'boolean')) fail('Only bounded named boolean observations are accepted');
    const check = checks.find(c => c.id === e.check_id);
    if (check && Object.keys(ev.facts).some(k => !check.facts.includes(k))) fail('Unexpected fact for this check');
  }
}
export function assess(intake, now) {
  validateIntake(intake);
  if (!epoch(now)) fail('Invalid assessment time');
  return intake.entries.map(e => {
    const ev = e.evidence, check = checks.find(c => c.id === e.check_id);
    const result = { entry_id: e.id, coverage: 'assessed', outcome: 'unknown', reasons: [] };
    const gap = (coverage, reason) => Object.assign(result, { coverage, reasons: [reason] });
    if (e.owner === null || e.check_id === null) return gap('incomplete', 'Owner and defined check are required');
    if (!check) return gap('unsupported', 'No implemented check for this entry point');
    if (ev === null) return gap('unassessed', 'No evidence supplied');
    if (ev.captured_at > now) return gap('incomplete', 'Evidence capture time is in the future');
    if (ev.expires_at <= now) return gap('stale', 'Evidence has expired');
    if (check.facts.some(k => !Object.hasOwn(ev.facts, k))) return gap('incomplete', 'Required observations are missing');
    result.reasons = check.facts.filter(k => !ev.facts[k]).map(k => `Not satisfied: ${k}`);
    result.outcome = result.reasons.length ? 'fail' : 'pass';
    return result;
  });
}
export function validateFrontline(bundle, now) {
  if (Buffer.byteLength(JSON.stringify(bundle) ?? '') > 65536) fail('Bundle exceeds 64 KiB');
  exact(bundle, ['engine_version', 'intake', 'intake_sha256', 'assessed_at', 'results']);
  if (bundle.engine_version !== ENGINE || !epoch(bundle.assessed_at) || bundle.assessed_at > now + 60) fail('Invalid engine or future assessment');
  const results = assess(bundle.intake, bundle.assessed_at);
  if (hash(bundle.intake) !== bundle.intake_sha256 || canonical(results) !== canonical(bundle.results)) fail('Evidence digest or assessment does not match');
  return { digest: bundle.intake_sha256, bundle, currentResults: assess(bundle.intake, now) };
}
export function retest(record, state, now) {
  const entry = state.bundle.intake.entries.find(e => e.id === record.entry.id);
  const result = assess(state.bundle.intake, now).find(r => r.entry_id === record.entry.id);
  if (!entry || entry.check_id !== record.entry.check_id || entry.name !== record.entry.name) return { allowed: false, reason: 'The original entry point and check must remain present.' };
  if (state.bundle.intake.sequence <= record.sequence || state.digest === record.baselineDigest || !entry.evidence || entry.evidence.id === record.entry.evidence.id || entry.evidence.captured_at <= record.entry.evidence.captured_at) return { allowed: false, reason: 'Import newer evidence for the same entry point.' };
  if (result.coverage !== 'assessed' || result.outcome !== 'pass') return { allowed: false, reason: 'Retest requires current, complete passing evidence.' };
  if (['accepted_risk', 'false_positive'].includes(record.decision)) return { allowed: false, reason: 'Change the triage decision to confirmed before verifying a fix.' };
  return { allowed: true, reason: 'The supplied fixture observations now satisfy this check.' };
}
