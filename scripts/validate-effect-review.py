#!/usr/bin/env python3
"""Replay the frozen 26 review cases, including their two known incomplete results.

Exit 0 means all original labels match; exit 1 means label disagreement (currently
24/26); exit 2 means a broken input, execution, or evidence check. No network or
chain access. Output must be a new directory, so historical evidence is preserved.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_report(report, sources):
    expected = {name: sha(raw) for name, raw in sources.items()}
    require(report['coverage']['source_sha256'] == expected, 'Source inventory or digest changed')
    require(sorted(report['coverage']['files']) == sorted(sources), 'Coverage file set changed')
    require(report['scanned_files'] == len(sources), 'Scanned file count changed')
    findings = report['findings']
    require(len({f['id'] for f in findings}) == len(findings), 'Finding identity collision')
    checked = 0
    for finding in findings:
        loc = finding['location']
        identity = f"{finding['rule_id']}\0{loc['file']}\0{loc['byte_start']}\0{loc['byte_end']}"
        require(finding['id'] == sha(identity.encode())[:24], 'Finding fingerprint mismatch')
        require(finding['evidence']['validated'] is True, 'Primary evidence is not validated')
        items = [{'location': loc, **finding['evidence']}, *finding['evidence'].get('related', [])]
        for item in items:
            loc = item['location']
            require(loc['file'] in sources, 'Evidence references an unselected file')
            raw = sources[loc['file']]
            require(sha(raw) == item['source_sha256'], 'Evidence digest mismatch')
            start, end = loc['byte_start'], loc['byte_end']
            require(type(start) is int and type(end) is int and 0 <= start < end <= len(raw), 'Invalid byte span')
            require(raw[start:end].decode('utf-8') == item['excerpt'], 'Evidence excerpt mismatch')
            for edge, offset in [('start', start), ('end', end)]:
                before = raw[:offset].decode('utf-8')
                require(loc[f'{edge}_line'] == before.count('\n') + 1, 'Line mismatch')
                require(loc[f'{edge}_column'] == len(before.rsplit('\n', 1)[-1]) + 1, 'Column mismatch')
            checked += 1
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--solc', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    family = root / 'fixtures/effect-review'
    manifest = json.loads((family / 'frozen-manifest.json').read_text())
    claimed = manifest.pop('canonical_payload_sha256')
    canonical = json.dumps(manifest, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    require(sha(canonical) == claimed == (family / 'frozen-manifest.sha256').read_text().strip(),
            'Frozen manifest changed')
    binary, solc = args.binary.resolve(strict=True), args.solc.resolve(strict=True)
    sources_by_case = {}
    for case in manifest['cases']:
        project = family / 'cases' / case['id']
        sources = {}
        for name, meta in case['files'].items():
            relative = PurePosixPath(name)
            require(not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] == 'src',
                    'Invalid frozen source path')
            raw = (project / name).read_bytes()
            require(sha(raw) == meta['sha256'] and len(raw) == meta['utf8_bytes'], f'Frozen source changed: {name}')
            sources[str(relative.relative_to('src'))] = raw
        actual_files = {str(p.relative_to(project / 'src')) for p in (project / 'src').rglob('*.sol')}
        require(actual_files == set(sources), f"Unfrozen source in {case['id']}")
        sources_by_case[case['id']] = sources
    args.output.mkdir(parents=True, exist_ok=False)
    rows = []
    for case in manifest['cases']:
        output = args.output / f"{case['id']}.json"
        command = [str(binary), 'scan', str(family / 'cases' / case['id']), '--solc', str(solc),
                   '--format', 'json', '--output', str(output), '--fail-on', 'high']
        run = subprocess.run(command, capture_output=True, text=True, timeout=60)
        require(run.returncode in (0, 1, 2), f"Scanner failed: {case['id']}: {run.returncode}")
        report = json.loads(output.read_text())
        require(report['analysis']['mode'] == 'solc', 'Compiler mode was not used')
        complete, diagnostics = report['coverage']['complete'], report['diagnostics']
        require(type(complete) is bool and (not complete or not diagnostics), 'Contradictory completeness')
        require(run.returncode == 2 if not complete else run.returncode in (0, 1), 'Incorrect scanner exit status')
        checked = verify_report(report, sources_by_case[case['id']])
        relevant = [f for f in report['findings'] if f['rule_id'] == case['focus_rule']]
        detected = len(relevant) >= case['minimum_count']
        expectation = case['expectation']
        if expectation == 'detect':
            matches = detected
            outcome = 'detected' if detected else ('unsupported' if not complete and diagnostics else 'mismatch')
        elif expectation == 'clear':
            matches = not relevant and complete
            outcome = 'clear' if matches else ('unsupported' if not relevant and not complete and diagnostics else 'mismatch')
        else:
            require(expectation == 'detect_or_incomplete', 'Unknown expectation')
            matches = detected or (not complete and bool(diagnostics))
            outcome = 'detected' if detected else ('unsupported' if matches else 'mismatch')
        if case['id'] == 'c09_crossfile_two_callers' and relevant:
            locations = {(f['location']['file'], f['location']['byte_start'], f['location']['byte_end']) for f in relevant}
            require(len(locations) >= 2, 'Cross-file callers collapsed')
            for finding in relevant:
                require(finding['location']['file'] == 'Entry.sol', 'Primary location is not the caller')
                require('Base.sol' in {r['location']['file'] for r in finding['evidence']['related']},
                        'Cross-file helper evidence missing')
        rows.append({'case': case['id'], 'expectation': expectation, 'outcome': outcome,
                     'expectation_match': matches, 'coverage_complete': complete, 'focus_findings_count': len(relevant),
                     'engine_version': report['engine_version'], 'compiler_version': report['analysis']['compiler_version'],
                     'diagnostics': diagnostics, 'evidence_spans_checked': checked, 'exit_code': run.returncode,
                     'command': command, 'stderr': run.stderr, 'report_sha256': sha(output.read_bytes())})
    summary = {'observed_at_utc': datetime.now(timezone.utc).isoformat(),
               'manifest_canonical_sha256': claimed, 'binary_sha256': sha(binary.read_bytes()),
               'cases': len(rows), 'exact_expectation_matches': sum(r['expectation_match'] for r in rows),
               'counts': dict(Counter(r['outcome'] for r in rows)),
               'incomplete_reports': sum(not r['coverage_complete'] for r in rows),
               'complete_clean_positive_misses': sum(r['expectation'] != 'clear' and r['coverage_complete']
                                                    and r['focus_findings_count'] == 0 for r in rows),
               'evidence_spans_checked': sum(r['evidence_spans_checked'] for r in rows),
               'unmet_expectations': [r['case'] for r in rows if not r['expectation_match']], 'results': rows}
    (args.output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({k: v for k, v in summary.items() if k != 'results'}, indent=2))
    return 0 if all(r['expectation_match'] for r in rows) else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f'Replay failed: {error}', file=sys.stderr)
        raise SystemExit(2)
