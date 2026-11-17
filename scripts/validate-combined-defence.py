#!/usr/bin/env python3
"""Measure the combined fixture in source/native modes and JSON/SARIF/bundle formats.

Default exit 0 means declared detector regressions match, with known gaps still
reported. --require-all returns 1 while any labelled case lacks detection.
Exit 2 means execution, evidence, report consistency or a behaviour witness failed.
No RPC or remote services are used. Output must be a fresh directory.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--solc', type=Path, required=True)
    parser.add_argument('--forge', type=Path, help='Also execute the offline local behaviour witnesses')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--require-all', action='store_true', help='Fail if any labelled case remains undetected')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    lab = root / 'fixtures/combined-defence'
    manifest = json.loads((lab / 'manifest.json').read_text())
    cases = manifest['cases']
    require(len({c['id'] for c in cases}) == len(cases), 'Duplicate case ID')
    require(len({c['function'] for c in cases}) == len(cases), 'Duplicate case entry point')
    require(all((c['kind'] == 'implemented' and c['rule_id']) or
                (c['kind'] == 'known_gap' and c['rule_id'] is None) for c in cases), 'Invalid case classification')
    expected = sorted((c['rule_id'], c['function']) for c in cases if c['rule_id'])
    binary, solc = args.binary.resolve(strict=True), args.solc.resolve(strict=True)
    forge = args.forge.resolve(strict=True) if args.forge else None
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    commands = []

    def run(command, receipt):
        command = list(map(str, command))
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=180)
        entry = {'command': command, 'exit_code': result.returncode, 'stderr': result.stderr}
        commands.append(entry)
        (output / receipt).write_text(json.dumps(entry, indent=2) + '\n')
        require(result.returncode == 0, f'{receipt}: execution failed with {result.returncode}: {result.stderr}')
        return result.stdout

    catalog = json.loads(run([binary, 'rules', '--format', 'json'], 'catalog-command.json'))
    require({r['id'] for r in catalog['rules']} == {rule for rule, _ in expected}, 'Manifest does not cover rule registry')
    # Reuse the independent byte/span verifier from the frozen-review runner.
    verify_report = runpy.run_path(str(root / 'scripts/validate-effect-review.py'))['verify_report']
    measured = {}
    raw_reports = {}
    for mode in ['source', 'solc']:
        compiler_args = ['--solc', solc] if mode == 'solc' else []
        for variant in ['vulnerable', 'fixed']:
            stem = f'{variant}.{mode}'
            source = lab / variant / 'src/DefenceLab.sol'
            report_path = output / f'{stem}.json'
            run([binary, 'scan', lab / variant, *compiler_args, '--format', 'json', '--output', report_path],
                f'{stem}.command.json')
            report = json.loads(report_path.read_text())
            spans = verify_report(report, {'DefenceLab.sol': source.read_bytes()})
            require(report['engine_version'] == catalog['engine_version'], 'Engine version changed')
            require(report['coverage']['complete'] and not report['diagnostics'], f'{stem}: modeled analysis incomplete')
            require(set(report['coverage']['rules']) == {rule for rule, _ in expected}, 'Rule coverage changed')
            require(report['analysis']['mode'] == mode, 'Analysis mode mismatch')
            if mode == 'solc':
                require(report['analysis']['compiler_version'].startswith(manifest['compiler'] + '+'),
                        'Fixture compiler profile mismatch')
            actual = sorted((f['rule_id'], f['context']['function']) for f in report['findings'])
            require(actual == (expected if variant == 'vulnerable' else []),
                    f'{stem}: rule/function/count regression or unexpected alert; review manifest before adopting new coverage')
            require(all(f['context']['contract'] == 'DefenceLab' for f in report['findings']), 'Wrong contract context')

            sarif_path = output / f'{stem}.sarif'
            run([binary, 'scan', lab / variant, *compiler_args, '--format', 'sarif', '--output', sarif_path],
                f'{stem}.sarif-command.json')
            sarif = json.loads(sarif_path.read_text())
            require(sarif['version'] == '2.1.0' and len(sarif['runs']) == 1, 'Invalid SARIF run envelope')
            sarif_run = sarif['runs'][0]
            invocation = sarif_run['invocations'][0]
            require(invocation['executionSuccessful'] is True and not invocation['toolExecutionNotifications'],
                    'SARIF completeness mismatch')
            require(invocation['properties']['analysis'] == report['analysis'], 'SARIF analysis profile mismatch')
            require(invocation['properties']['files'] == report['coverage']['files'], 'SARIF source inventory mismatch')
            require(sorted((r['ruleId'], r['partialFingerprints']['omniguard/v1']) for r in sarif_run['results']) ==
                    sorted((f['rule_id'], f['id']) for f in report['findings']), 'SARIF finding identity/count mismatch')
            by_id = {f['id']: f for f in report['findings']}
            for result in sarif_run['results']:
                finding = by_id[result['partialFingerprints']['omniguard/v1']]
                location = result['locations'][0]['physicalLocation']
                require(location['artifactLocation']['uri'] == finding['location']['file'], 'SARIF primary path mismatch')
                region = location['region']
                for sarif_key, key in [('startLine', 'start_line'), ('startColumn', 'start_column'),
                                       ('endLine', 'end_line'), ('endColumn', 'end_column')]:
                    require(region[sarif_key] == finding['location'][key], 'SARIF primary coordinates mismatch')
                require(region['snippet']['text'] == finding['evidence']['excerpt'], 'SARIF primary excerpt mismatch')
                require(result['properties']['sourceSha256'] == finding['evidence']['source_sha256'], 'SARIF source hash mismatch')

            if mode == 'solc':
                bundle_path = output / f'{stem}.bundle.json'
                run([binary, 'bundle', lab / variant, '--target', 'combined-defence', '--name', 'Combined defence lab',
                     '--revision', f'combined-{variant}-v1', '--isolated-fixture', '--solc', solc, '--output', bundle_path],
                    f'{stem}.bundle-command.json')
                bundle = json.loads(bundle_path.read_text())
                require(bundle['bundle_version'] == 1 and bundle['target']['kind'] == 'isolated-fixture', 'Bundle identity mismatch')
                require(bundle['target']['id'] == 'combined-defence', 'Bundle target mismatch')
                require(bundle['rules'] == report['coverage']['rules'] and bundle['report'] == report, 'Bundle report changed')
                require(bundle['sources'] == [{'path': 'DefenceLab.sol', 'sha256': sha(source),
                                              'content': source.read_text()}], 'Bundle source changed')
            measured[stem] = {'findings': len(actual), 'coverage_complete_for_modeled_rules': True,
                              'diagnostics': 0, 'source_spans_checked': spans, 'analysis': report['analysis'],
                              'sarif_matches_json': True, 'report_sha256': sha(report_path),
                              'sarif_sha256': sha(sarif_path)}
            raw_reports[stem] = report

    behaviour = {'status': 'not_run', 'cases_passed': 0, 'test_results': {}}
    if forge:
        stdout = run([forge, 'test', '--offline', '--use', solc, '--root', lab, '--json'], 'foundry-command.json')
        (output / 'foundry.json').write_text(stdout)
        suites = json.loads(stdout)
        tests = {name: result for suite in suites.values() for name, result in suite['test_results'].items()}
        require(tests and all(t['status'] == 'Success' for t in tests.values()), 'Behaviour witness failed or skipped')
        for case in cases:
            require(tests.get(case['witness'] + '()', {}).get('status') == 'Success', 'Missing named behaviour witness')
        fuzz = {name: result['kind']['Fuzz']['runs'] for name, result in tests.items() if 'Fuzz' in result['kind']}
        require(len(fuzz) == 2 and all(runs == 128 for runs in fuzz.values()), 'Fuzz run profile mismatch')
        behaviour = {'status': 'passed', 'cases_passed': len(cases), 'tests_passed': len(tests),
                     'fuzz_runs': fuzz, 'test_results': {name: result['status'] for name, result in tests.items()}}

    rows = []
    for case in cases:
        observations = {}
        for mode in ['source', 'solc']:
            observed = [f['rule_id'] for f in raw_reports[f'vulnerable.{mode}']['findings']
                        if f['context']['function'] == case['function']]
            observations[mode] = {'observed_rule_ids': observed,
                                  'status': 'detected' if case['rule_id'] in observed else 'known_gap'}
        rows.append({**case, 'observations': observations,
                     'behaviour_witness': 'passed' if forge else 'not_run'})
    gaps = [r['id'] for r in rows if any(o['status'] != 'detected' for o in r['observations'].values())]
    snapshot_files = [lab / 'manifest.json', lab / 'foundry.toml', lab / 'test/DefenceLab.t.sol',
                      lab / 'vulnerable/src/DefenceLab.sol', lab / 'fixed/src/DefenceLab.sol',
                      lab / 'vulnerable/foundry.toml', lab / 'fixed/foundry.toml', Path(__file__),
                      root / 'scripts/validate-effect-review.py', root / 'crates/omniguard-core/tests/combined_defence.rs']
    summary = {'recorded_at_utc': datetime.now(timezone.utc).isoformat(), 'scope': manifest['scope'],
               'engine_version': catalog['engine_version'], 'binary_sha256': sha(binary), 'solc_sha256': sha(solc),
               'fixture_compiler': manifest['compiler'], 'evm_version': manifest['evm_version'],
               'inputs': {str(path.relative_to(root)): sha(path) for path in snapshot_files},
               'implemented_rule_regressions_passed': True, 'implemented_rules_detected_in_both_modes': len(expected),
               'labelled_cases': len(cases), 'known_undetected_cases': gaps,
               'all_labelled_cases_detected': not gaps, 'require_all': args.require_all,
               'runs': measured, 'behaviour': behaviour, 'cases': rows}
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    lines = ['# Combined defence lab measurement', '',
             f"Engine {catalog['engine_version']}; native solc {manifest['compiler']}; EVM {manifest['evm_version']}.", '',
             f"**{len(expected)}/{len(expected)} implemented rules detected in both modes; {len(gaps)} labelled gaps remain undetected.**", '',
             'Corrected contract: zero alerts in both modes. Completed modeled analysis does not cover the known gaps.', '',
             f"Local behaviour witnesses: **{behaviour['status']}**. See summary.json for test and fuzz counts.", '',
             '| Case | Entry point | Source | Native compiler | Paired behaviour |', '| --- | --- | --- | --- | --- |']
    lines += [f"| {r['id']} | `{r['function']}` | {r['observations']['source']['status']} | "
              f"{r['observations']['solc']['status']} | {r['behaviour_witness']} |" for r in rows]
    lines += ['', 'These are authored fixture checks, not independent accuracy estimates or a guarantee of production safety.',
              '`--require-all` fails while any labelled gap remains; a default regression pass does not mean every case was detected.',
              'Detailed JSON, SARIF, source bundles, input hashes and command receipts accompany this summary.']
    (output / 'SUMMARY.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps({k: summary[k] for k in ['implemented_rule_regressions_passed',
          'implemented_rules_detected_in_both_modes', 'labelled_cases', 'known_undetected_cases',
          'all_labelled_cases_detected']}, indent=2))
    print(f"Behaviour: {behaviour['status']}; evidence: {output}")
    return 1 if args.require_all and gaps else 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f'Combined lab validation failed: {error}', file=sys.stderr)
        raise SystemExit(2)
