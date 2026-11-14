import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RULES, LEGACY_RULES, validateBundle, assessRescan, sha256 } from '../src/report-bundle.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../../../reports/${name}`, import.meta.url)));
const legacyVulnerable = await read('legacy/v0.1.0/vulnerable.omniguard.json');
const legacyFixed = await read('legacy/v0.1.0/fixed.omniguard.json');
const currentFixed = await read('fixed.omniguard.json');
const patterns = await read('patterns-vulnerable.omniguard.json');

test('historical schema v1 bundles retain their exact validated digests', () => {
  assert.equal(validateBundle(legacyVulnerable).digest, '85aa47e07ae0e93f74b0ed8603e136e054200ac069c8df964f597bc2921ec3f9');
  assert.equal(validateBundle(legacyFixed).digest, '3d9302e783c4b562df23e5b198bba7a37a5928666e59b09d74f3608e1c9c15f3');
});

test('the expanded pack imports every rule with explicit coverage and related evidence', () => {
  const { bundle } = validateBundle(patterns);
  assert.equal(bundle.report.schema_version, 3);
  assert.equal(bundle.report.coverage.complete, true);
  assert.equal(bundle.rules.length, 12);
  assert.deepEqual(bundle.report.findings.map((finding) => finding.rule_id).sort(), [...RULES].sort());
  assert.ok(bundle.report.findings.some((finding) => finding.evidence.related?.length));
  assert.ok(bundle.report.findings.every((finding) => finding.context.contract));
});

test('altered related evidence and inconsistent coverage are rejected', () => {
  for (const mutate of [
    (bundle) => { bundle.report.findings.find((finding) => finding.evidence.related?.length).evidence.related[0].excerpt += 'x'; },
    (bundle) => { bundle.report.findings.find((finding) => finding.evidence.related?.length).evidence.related[0].location.byte_start++; },
    (bundle) => { bundle.report.coverage.rules.pop(); },
    (bundle) => { bundle.report.coverage.files.push('Missing.sol'); },
    (bundle) => { bundle.report.engine_version = '999.0.0'; },
    (bundle) => { bundle.report.findings[0].context.function = { unexpected: true }; },
  ]) {
    const changed = structuredClone(patterns); mutate(changed);
    assert.throws(() => validateBundle(changed));
  }
});

test('an expanded-engine rescan cannot silently verify a legacy remediation', () => {
  const old = validateBundle(legacyVulnerable);
  const remediation = { baselineDigest: old.digest, targetId: old.bundle.target.id,
    baselineEngine: '0.1.0', baselineRules: LEGACY_RULES, finding: old.bundle.report.findings[0] };
  assert.equal(assessRescan(remediation, validateBundle(legacyFixed)).allowed, true);
  const incompatible = assessRescan(remediation, validateBundle(currentFixed));
  assert.equal(incompatible.allowed, false);
  assert.match(incompatible.reason, /coverage differs/);
});


test('a finding-free bundle still has to match the source snapshot recorded by the scanner', () => {
  const changed = structuredClone(currentFixed);
  changed.sources[0].content += '\n// Changed after scanning';
  // A newly calculated bundle digest cannot repair the report's stale scan snapshot.
  changed.sources[0].sha256 = sha256(changed.sources[0].content);
  assert.throws(() => validateBundle(changed), /Scanned source digests/);
});


test('historical schema v2 preserves the exact previously normalized bundle digests', async () => {
  for (const name of ['vulnerable', 'fixed', 'patterns-vulnerable', 'patterns-fixed']) {
    const bundle = await read(`legacy/v0.1.1/${name}.omniguard.json`);
    assert.equal(validateBundle(bundle).digest, sha256(JSON.stringify(bundle)));
    assert.equal(validateBundle(bundle).bundle.report.engine_version, '0.1.1');
  }
});

test('historical 0.1.2 compiler evidence retains its exact identity after a guard fix', async () => {
  for (const name of ['vulnerable', 'fixed', 'executable-vulnerable', 'executable-fixed',
    'patterns-vulnerable', 'patterns-fixed', 'semantic-source-vulnerable', 'semantic-source-fixed',
    'semantic-vulnerable', 'semantic-fixed']) {
    const bundle = await read(`legacy/v0.1.2/${name}.omniguard.json`);
    assert.equal(validateBundle(bundle).digest, sha256(JSON.stringify(bundle)));
    assert.equal(validateBundle(bundle).bundle.report.engine_version, '0.1.2');
  }
  const baseline = validateBundle(await read('legacy/v0.1.2/semantic-vulnerable.omniguard.json'));
  const fixed = validateBundle(await read('legacy/v0.1.2/semantic-fixed.omniguard.json'));
  assert.equal(baseline.digest, '5dfe95e02cae64a2bcfc4c0a9e16a7a722a598024bd8e0678641c76701a1f8de');
  assert.equal(fixed.digest, '41a7cd2645334eafa7dbd88d24613118fc389eb90073c124c06ab36f07a007c2');
  const record = { targetId: baseline.bundle.target.id, baselineDigest: baseline.digest,
    baselineEngine: baseline.bundle.report.engine_version, baselineRules: baseline.bundle.rules,
    baselineAnalysis: baseline.bundle.report.analysis,
    finding: baseline.bundle.report.findings.find((finding) => finding.rule_id === 'OG-SOL-002') };
  assert.equal(assessRescan(record, fixed).allowed, true);
  const current = validateBundle(await read('semantic-fixed.omniguard.json'));
  assert.notEqual(current.bundle.report.engine_version, '0.1.2');
  assert.equal(assessRescan(record, current).allowed, false);
});

test('cross-file compiler declarations require their own matching source digests', async () => {
  const compiled = await read('semantic-vulnerable.omniguard.json');
  const { bundle } = validateBundle(compiled);
  const imported = bundle.report.findings.find((f) => f.rule_id === 'OG-SOL-010');
  assert.equal(imported.evidence.related[0].location.file, 'Asset.sol');
  for (const mutate of [
    (copy) => { copy.report.findings.find((f) => f.rule_id === 'OG-SOL-010').evidence.related[0].source_sha256 = 'f'.repeat(64); },
    (copy) => { copy.report.findings.find((f) => f.rule_id === 'OG-SOL-010').evidence.related[0].location.file = '../Outside.sol'; },
    (copy) => { delete copy.report.findings.find((f) => f.rule_id === 'OG-SOL-010').evidence.related[0].source_sha256; },
  ]) { const copy = structuredClone(compiled); mutate(copy); assert.throws(() => validateBundle(copy)); }
});

test('historical 0.1.3 profiles keep their identities and cannot use a newer effect rescan', async () => {
  for (const name of ['vulnerable', 'fixed', 'executable-vulnerable', 'executable-fixed',
    'patterns-vulnerable', 'patterns-fixed', 'semantic-source-vulnerable', 'semantic-source-fixed',
    'semantic-vulnerable', 'semantic-fixed']) {
    const bundle = await read(`legacy/v0.1.3/${name}.omniguard.json`);
    assert.equal(validateBundle(bundle).digest, sha256(JSON.stringify(bundle)));
    assert.equal(validateBundle(bundle).bundle.report.engine_version, '0.1.3');
  }
  const baseline = validateBundle(await read('legacy/v0.1.3/semantic-vulnerable.omniguard.json'));
  const record = { targetId: baseline.bundle.target.id, baselineDigest: baseline.digest,
    baselineEngine: baseline.bundle.report.engine_version, baselineRules: baseline.bundle.rules,
    baselineAnalysis: baseline.bundle.report.analysis,
    finding: baseline.bundle.report.findings.find((finding) => finding.rule_id === 'OG-SOL-002') };
  assert.equal(assessRescan(record, validateBundle(await read('legacy/v0.1.3/semantic-fixed.omniguard.json'))).allowed, true);
  assert.equal(assessRescan(record, validateBundle(await read('semantic-fixed.omniguard.json'))).allowed, false);
});

test('helper-call evidence is checked before a matching fixed rescan can verify it', async () => {
  const input = await read('effects-vulnerable.omniguard.json');
  const baseline = validateBundle(input);
  assert.equal(baseline.bundle.report.coverage.complete, true);
  assert.deepEqual(baseline.bundle.report.findings.map((finding) => finding.rule_id), ['OG-SOL-002']);
  const finding = baseline.bundle.report.findings[0];
  assert.ok(finding.evidence.related.some((item) => item.excerpt.includes('.call')));
  assert.ok(finding.evidence.related.some((item) => item.excerpt.includes('credit.amount = 0')));
  const record = { targetId: baseline.bundle.target.id, baselineDigest: baseline.digest,
    baselineEngine: baseline.bundle.report.engine_version, baselineRules: baseline.bundle.rules,
    baselineAnalysis: baseline.bundle.report.analysis, finding };
  assert.equal(assessRescan(record, validateBundle(await read('effects-fixed.omniguard.json'))).allowed, true);
  const changed = structuredClone(input);
  changed.report.findings[0].evidence.related.find((item) => item.excerpt.includes('.call')).excerpt += ' ';
  assert.throws(() => validateBundle(changed), /excerpt does not match/);
  const incomplete = await read('effects-fixed.omniguard.json');
  incomplete.report.coverage.complete = false;
  incomplete.report.diagnostics.push({ code: 'effects-unsupported', message: 'Unresolved fixture effect', file: null, line: null, column: null });
  assert.equal(assessRescan(record, validateBundle(incomplete)).allowed, false);
});

test('analysis mode and exact compiler version are part of rescan coverage', async () => {
  const baseline = validateBundle(await read('semantic-vulnerable.omniguard.json'));
  const fixed = await read('semantic-fixed.omniguard.json');
  const sourceFixed = validateBundle(await read('semantic-source-fixed.omniguard.json'));
  const record = { targetId: baseline.bundle.target.id, baselineDigest: baseline.digest,
    baselineEngine: baseline.bundle.report.engine_version, baselineRules: baseline.bundle.rules,
    baselineAnalysis: baseline.bundle.report.analysis, finding: baseline.bundle.report.findings[0] };
  assert.equal(assessRescan(record, validateBundle(fixed)).allowed, true);
  assert.equal(assessRescan(record, sourceFixed).allowed, false);
  const anotherCompiler = structuredClone(fixed); anotherCompiler.report.analysis.compiler_version = '0.8.27+commit.example';
  assert.equal(assessRescan(record, validateBundle(anotherCompiler)).allowed, false);
  for (const analysis of [ { mode: 'unknown', compiler_version: null }, { mode: 'source', compiler_version: fixed.report.analysis.compiler_version }, { mode: 'solc', compiler_version: null } ]) {
    const copy = structuredClone(fixed); copy.report.analysis = analysis; assert.throws(() => validateBundle(copy));
  }
});
