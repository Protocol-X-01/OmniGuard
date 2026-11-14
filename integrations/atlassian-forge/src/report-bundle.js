import { createHash } from 'node:crypto';
import catalog from './rule-catalog.json' with { type: 'json' };

export const RULES = catalog.rules.map((rule) => rule.id);
export const LEGACY_RULES = ['OG-SOL-001', 'OG-SOL-002', 'OG-SOL-003'];
// Freeze historical coverage independently of future additions to the registry.
export const LEGACY_EXPANDED_RULES = [
  'OG-SOL-001', 'OG-SOL-002', 'OG-SOL-003', 'OG-SOL-004',
  'OG-SOL-005', 'OG-SOL-006', 'OG-SOL-007', 'OG-SOL-008',
  'OG-SOL-009', 'OG-SOL-010', 'OG-SOL-011', 'OG-SOL-012',
];
export const MAX_BUNDLE_BYTES = 160 * 1024;
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function check(condition, message) { if (!condition) throw new Error(message); }
function text(value, name, max = 2000) {
  check(typeof value === 'string' && value.length > 0 && value.length <= max, `Invalid ${name}.`);
  return value;
}
function relativePath(value, solidity = true) {
  text(value, 'source path', 240);
  check(!value.startsWith('/') && !/[\\\x00-\x1f:%]/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..')
    && (!solidity || value.endsWith('.sol')), 'Paths must be normalized relative paths.');
  return value;
}
function position(bytes, offset) {
  const prefix = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
  return [prefix.split('\n').length, [...prefix.split('\n').at(-1)].length + 1];
}
function sameList(left, right) { return Array.isArray(left) && left.length === right.length && [...left].sort().every((value, i) => value === [...right].sort()[i]); }
function profile(report) {
  if (report?.schema_version === 1 && report.engine_version === '0.1.0') return LEGACY_RULES;
  if (report?.schema_version === 2 && report.engine_version === '0.1.1') return LEGACY_EXPANDED_RULES;
  if (report?.schema_version === 3 && ['0.1.2', '0.1.3'].includes(report.engine_version)) return LEGACY_EXPANDED_RULES;
  if (report?.schema_version === 3 && report.engine_version === catalog.engine_version) return RULES;
  throw new Error('Unsupported OmniGuard report schema or engine.');
}
function span(sourceMap, location, claimedExcerpt) {
  check(location && typeof location === 'object', 'Missing evidence location.');
  const file = relativePath(location.file);
  const source = sourceMap.get(file);
  check(source, `Missing source for ${file}.`);
  const bytes = Buffer.from(source.content);
  const { byte_start: start, byte_end: end } = location;
  check(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= bytes.length, 'Invalid evidence byte span.');
  let excerpt; let from; let to;
  try {
    excerpt = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end));
    from = position(bytes, start); to = position(bytes, end);
  } catch { throw new Error('Evidence span splits a UTF-8 character.'); }
  check(claimedExcerpt === excerpt, 'Evidence excerpt does not match the included source.');
  check(from[0] === location.start_line && from[1] === location.start_column && to[0] === location.end_line && to[1] === location.end_column, 'Evidence line and column do not match its byte span.');
  return { source, excerpt, location: { file, start_line: from[0], start_column: from[1], end_line: to[0], end_column: to[1], byte_start: start, byte_end: end } };
}

// Verifies supplied source integrity, not scanner execution or operator identity.
export function validateBundle(input) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'Choose an OmniGuard scan bundle.');
  check(Buffer.byteLength(JSON.stringify(input)) <= MAX_BUNDLE_BYTES, 'Scan bundle exceeds 160 KiB.');
  check(input.bundle_version === 1, 'Unsupported scan bundle version.');
  const target = input.target;
  check(target?.kind === 'isolated-fixture', 'This development app accepts isolated fixtures only.');
  check(typeof target.id === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(target.id), 'Invalid target identifier.');
  const normalizedTarget = { id: target.id, name: text(target.name, 'target name', 100), kind: target.kind };
  const revision = text(input.revision, 'scan revision', 100);
  const report = input.report;
  const supportedRules = profile(report);
  check(sameList(input.rules, supportedRules), 'The complete rule set for this engine profile is required.');
  check(Number.isInteger(report.scanned_files) && report.scanned_files > 0 && report.scanned_files <= 8, 'A scan must cover 1–8 source files.');
  check(Array.isArray(input.sources) && input.sources.length === report.scanned_files, 'Source coverage does not match the scanned file count.');
  const sources = input.sources.map((source) => {
    const path = relativePath(source.path);
    check(typeof source.content === 'string' && Buffer.byteLength(source.content) <= 64 * 1024, 'A source file exceeds 64 KiB.');
    check(Buffer.from(source.content).toString('utf8') === source.content, 'Source is not valid UTF-8 text.');
    const digest = sha256(source.content);
    check(source.sha256 === digest, `Source digest mismatch for ${path}.`);
    return { path, sha256: digest, content: source.content };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  check(new Set(sources.map((source) => source.path)).size === sources.length, 'Duplicate source paths.');
  const sourceMap = new Map(sources.map((source) => [source.path, source]));
  check(Array.isArray(report.diagnostics) && report.diagnostics.length <= 20, 'Invalid report diagnostics.');
  const diagnostics = report.diagnostics.map((diagnostic) => {
    for (const key of ['line', 'column']) check(diagnostic[key] == null || (Number.isInteger(diagnostic[key]) && diagnostic[key] > 0), 'Invalid diagnostic position.');
    return { code: text(diagnostic.code, 'diagnostic code', 100), message: text(diagnostic.message, 'diagnostic message'),
      file: diagnostic.file == null ? null : relativePath(diagnostic.file, false), line: diagnostic.line ?? null, column: diagnostic.column ?? null };
  });
  let coverage;
  if (report.schema_version >= 2) {
    const given = report.coverage;
    check(given?.rule_set === catalog.rule_set && sameList(given.rules, supportedRules), 'Report rule coverage does not match its engine profile.');
    check(sameList(given.files, sources.map((source) => source.path)), 'Report file coverage does not match its source bundle.');
    check(given.source_sha256 && sameList(Object.keys(given.source_sha256), sources.map((source) => source.path)) && sources.every((source) => given.source_sha256[source.path] === source.sha256), 'Scanned source digests do not match the bundled bytes.');
    check(typeof given.complete === 'boolean' && (!given.complete || diagnostics.length === 0), 'Report completeness contradicts its diagnostics.');
    coverage = { rule_set: given.rule_set, rules: [...supportedRules], files: sources.map((source) => source.path), source_sha256: Object.fromEntries(sources.map((source) => [source.path, source.sha256])), complete: given.complete };
  }
  let analysis;
  if (report.schema_version >= 3) {
    const supplied = report.analysis;
    check(supplied && ['source', 'solc'].includes(supplied.mode), 'Invalid analysis mode.');
    check(supplied.mode === 'solc' || supplied.compiler_version === null, 'Source analysis cannot claim a compiler.');
    check(supplied.compiler_version === null || (typeof supplied.compiler_version === 'string' && /^0\.8\.[0-9]+\+[A-Za-z0-9.+_-]{1,140}$/.test(supplied.compiler_version)), 'Invalid compiler version.');
    check(!coverage.complete || supplied.mode !== 'solc' || supplied.compiler_version !== null, 'A complete compiler scan must identify its compiler.');
    analysis = { mode: supplied.mode, compiler_version: supplied.compiler_version };
  }
  check(Array.isArray(report.findings) && report.findings.length <= 100, 'Invalid finding count.');
  const findings = report.findings.map((finding) => {
    check(supportedRules.includes(finding.rule_id), 'Unknown detection rule.');
    check(['low', 'medium', 'high', 'critical'].includes(finding.severity), 'Invalid finding severity.');
    check(['low', 'medium', 'high'].includes(finding.confidence), 'Invalid finding confidence.');
    const checked = span(sourceMap, finding.location, finding.evidence?.excerpt);
    check(finding.evidence?.validated === true && finding.evidence.source_sha256 === checked.source.sha256, 'Evidence source digest was not validated.');
    const id = sha256(`${finding.rule_id}\0${checked.location.file}\0${checked.location.byte_start}\0${checked.location.byte_end}`).slice(0, 24);
    check(finding.id === id, 'Finding fingerprint does not match its location.');
    const evidence = { source_sha256: checked.source.sha256, excerpt: checked.excerpt, validated: true };
    if (report.schema_version >= 2 && finding.evidence.related !== undefined) {
      check(Array.isArray(finding.evidence.related) && finding.evidence.related.length <= 8, 'Invalid related evidence count.');
      if (finding.evidence.related.length) evidence.related = finding.evidence.related.map((item) => {
        const checkedRelated = span(sourceMap, item.location, item.excerpt);
        if (report.schema_version === 2) check(checkedRelated.location.file === checked.location.file, 'Related evidence must use the same validated source file.');
        if (report.schema_version >= 3) check(item.source_sha256 === checkedRelated.source.sha256, 'Related source digest does not match its included file.');
        return { ...(report.schema_version >= 3 ? { source_sha256: checkedRelated.source.sha256 } : {}), label: text(item.label, 'related evidence label', 160), location: checkedRelated.location, excerpt: checkedRelated.excerpt };
      });
    }
    const result = { id, rule_id: finding.rule_id, title: text(finding.title, 'finding title', 160), severity: finding.severity, confidence: finding.confidence,
      message: text(finding.message, 'finding message'), remediation: text(finding.remediation, 'remediation'), location: checked.location, evidence };
    if (report.schema_version >= 2) {
      check(finding.context && typeof finding.context === 'object', 'Missing finding context.');
      result.context = {};
      for (const key of ['contract', 'function']) result.context[key] = finding.context[key] === null ? null : text(finding.context[key], 'finding context', 160);
    }
    return result;
  });
  check(new Set(findings.map((finding) => finding.id)).size === findings.length, 'Duplicate finding fingerprints.');
  const normalizedReport = { schema_version: report.schema_version, engine_version: report.engine_version, scanned_files: report.scanned_files };
  if (analysis) normalizedReport.analysis = analysis;
  if (coverage) normalizedReport.coverage = coverage;
  Object.assign(normalizedReport, { diagnostics, findings });
  const bundle = { bundle_version: 1, target: normalizedTarget, revision, rules: [...supportedRules], report: normalizedReport, sources };
  return { bundle, digest: sha256(JSON.stringify(bundle)) };
}

export function sameAnalysis(left, right) {
  if (!left || !right) return !left && !right;
  return left.mode === right.mode && left.compiler_version === right.compiler_version;
}

export function assessRescan(remediation, scan) {
  if (!scan || scan.bundle.target.id !== remediation.targetId) return { allowed: false, reason: 'Import a rescan of the same target.' };
  if (scan.bundle.report.engine_version !== (remediation.baselineEngine || '0.1.0') || !sameList(scan.bundle.rules, remediation.baselineRules || LEGACY_RULES)) {
    return { allowed: false, reason: 'Engine or rule coverage differs from this remediation baseline. Review it under the matching profile.' };
  }
  if (!sameAnalysis(remediation.baselineAnalysis ?? null, scan.bundle.report.analysis ?? null)) return { allowed: false, reason: 'Analysis mode or compiler version differs from this remediation baseline.' };
  if (scan.digest === remediation.baselineDigest) return { allowed: false, reason: 'Import a newer scan after changing the source.' };
  if (scan.bundle.report.diagnostics.length || scan.bundle.report.coverage?.complete === false) return { allowed: false, reason: 'The rescan is incomplete; resolve its diagnostics first.' };
  const source = scan.bundle.sources.find((item) => item.path === remediation.finding.location.file);
  if (!source) return { allowed: false, reason: 'The original source file is missing from the rescan.' };
  if (scan.bundle.report.findings.some((item) => item.rule_id === remediation.finding.rule_id && item.location.file === source.path)) return { allowed: false, reason: 'This rule still reports a finding in the source file.' };
  if (source.sha256 === remediation.finding.evidence.source_sha256) return { allowed: false, reason: 'The source has not changed since the finding.' };
  return { allowed: true, reason: 'The finding is absent in the imported complete rescan.', sourceSha256: source.sha256 };
}
export function publicScan(scan) {
  if (!scan) return null;
  const { target, revision, rules, report, sources } = scan.bundle;
  return { digest: scan.digest, importedAt: scan.importedAt, target, revision, rules, report, sources: sources.map(({ path, sha256: digest }) => ({ path, sha256: digest })) };
}
