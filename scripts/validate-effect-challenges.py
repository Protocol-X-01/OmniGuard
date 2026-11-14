#!/usr/bin/env python3
"""Reproduce the frozen native-effect challenge labels and source-evidence checks."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked_evidence(report, project):
    count = 0
    for finding in report['findings']:
        primary = finding['location']
        identity = f"{finding['rule_id']}\0{primary['file']}\0{primary['byte_start']}\0{primary['byte_end']}"
        assert finding['id'] == sha(identity.encode())[:24], 'Finding identity drift'
        for item in [{'location': primary, **finding['evidence']}, *finding['evidence'].get('related', [])]:
            loc = item['location']
            source = (project / loc['file']).read_bytes()
            assert sha(source) == item['source_sha256'], 'Source digest mismatch'
            start, end = loc['byte_start'], loc['byte_end']
            assert 0 <= start < end <= len(source), 'Invalid source span'
            assert source[start:end].decode('utf-8') == item['excerpt'], 'Excerpt mismatch'
            for prefix, offset in [('start', start), ('end', end)]:
                before = source[:offset].decode('utf-8')
                assert loc[f'{prefix}_line'] == before.count('\n') + 1
                assert loc[f'{prefix}_column'] == len(before.rsplit('\n', 1)[-1]) + 1
            count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--solc', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New directory; never overwrites evidence')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    family = root / 'fixtures/effect-challenges'
    manifest_path = family / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    for item in manifest['files']:
        assert sha((family / item['path']).read_bytes()) == item['sha256'], f"Frozen file changed: {item['path']}"
    args.output.mkdir(parents=True, exist_ok=False)
    binary, solc = args.binary.resolve(), args.solc.resolve()
    cases = [(case, family / case['project']) for case in manifest['cases']]
    for variant in ['vulnerable', 'fixed']:
        cases.append(({'id': f'effect-vault-{variant}', 'expected_completeness': 'complete',
                       'expected_target_rules': ['OG-SOL-002'] if variant == 'vulnerable' else []},
                      root / 'fixtures/effect-vault' / variant))
    rows = []
    for case, project in cases:
        output = args.output / f"{case['id']}.json"
        command = [str(binary), 'scan', str(project), '--solc', str(solc), '--format', 'json', '--output', str(output)]
        run = subprocess.run(command, capture_output=True, text=True, timeout=60)
        report = json.loads(output.read_text())
        # Foundry scans use src-relative report paths.
        sources = project / 'src' if (project / 'foundry.toml').exists() else project
        checked = checked_evidence(report, sources)
        actual = sorted({f['rule_id'] for f in report['findings'] if f['rule_id'] in manifest['target_rules']})
        complete = report['coverage']['complete']
        supported = case['expected_completeness'] == 'complete'
        rule_match = actual == sorted(case['expected_target_rules']) if supported else None
        completeness_match = complete == supported
        rows.append({'case': case['id'], 'engine_version': report['engine_version'], 'command': command,
                     'exit_code': run.returncode, 'stderr': run.stderr,
                     'expected_target_rules': case['expected_target_rules'], 'actual_target_rules': actual,
                     'target_rule_match': rule_match, 'expected_completeness': case['expected_completeness'],
                     'coverage_complete': complete, 'completeness_match': completeness_match,
                     'diagnostics': report['diagnostics'], 'evidence_spans_checked': checked,
                     'report_sha256': sha(output.read_bytes()),
                     'passed': run.returncode in (0, 2) and completeness_match and rule_match is not False})
    result = {'binary_sha256': sha(binary.read_bytes()), 'manifest_sha256': sha(manifest_path.read_bytes()),
              'label_policy': manifest['label_policy'], 'rows': rows}
    (args.output / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'supported_matches': sum(r['passed'] for r in rows[:20] if r['expected_completeness'] == 'complete'),
                      'supported_total': 17,
                      'unsupported_incomplete': sum(r['passed'] for r in rows[:20] if r['expected_completeness'] == 'incomplete'),
                      'unsupported_total': 3,
                      'vaults': [{k: r[k] for k in ['case', 'actual_target_rules', 'coverage_complete', 'passed']} for r in rows[20:]],
                      'evidence_spans_checked': sum(r['evidence_spans_checked'] for r in rows),
                      'failures': [r['case'] for r in rows if not r['passed']]}, indent=2))
    return 0 if all(r['passed'] for r in rows) else 1


if __name__ == '__main__':
    raise SystemExit(main())
