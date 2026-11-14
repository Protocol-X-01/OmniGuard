#!/usr/bin/env python3
"""Check real source/judge archive contents and deterministic packaging. No network."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    with tempfile.TemporaryDirectory(prefix='omniguard-release-check-') as temporary:
        first, second = Path(temporary) / 'first', Path(temporary) / 'second'
        for destination in (first, second):
            subprocess.run([sys.executable, str(ROOT / 'scripts/package-release.py'), '--output', str(destination)], check=True, capture_output=True)
        for item in first.iterdir():
            assert item.read_bytes() == (second / item.name).read_bytes(), f'Non-deterministic {item.name}'
        source = json.loads((first / 'SOURCE-MANIFEST.json').read_text())
        judge = json.loads((first / 'JUDGE-MANIFEST.json').read_text())
        version = source['engine_version']
        with tarfile.open(first / f'omniguard-{version}-source.tar.gz') as archive:
            assert len(archive.getmembers()) == len(source['files']) + 1
            for entry in source['files']:
                member = archive.getmember(f'omniguard-{version}/{entry["path"]}')
                assert member.isfile() and not member.issym()
                raw = archive.extractfile(member).read()
                assert digest(raw) == entry['sha256']
                assert raw == (ROOT / entry['path']).read_bytes()
        with zipfile.ZipFile(first / f'omniguard-{version}-judge-fixtures.zip') as archive:
            assert archive.testzip() is None
            prefix = f'omniguard-{version}-judge/'
            assert len(archive.namelist()) == len(judge['files']) + 1
            for entry in judge['files']:
                assert digest(archive.read(prefix + entry['path'])) == entry['sha256']
            reports = {name: json.loads(archive.read(prefix + f'reports/{name}.omniguard.json')) for name in ('vulnerable', 'fixed-source-only', 'fixed')}
            assert len({report['target']['id'] for report in reports.values()}) == 1
            assert len(reports['vulnerable']['report']['findings']) == 1
            assert reports['vulnerable']['report']['findings'][0]['rule_id'] == 'OG-SOL-002'
            assert all(not reports[name]['report']['findings'] for name in ('fixed', 'fixed-source-only'))
            assert reports['fixed']['report']['analysis'] == reports['vulnerable']['report']['analysis']
            assert reports['fixed-source-only']['report']['analysis']['mode'] == 'source'
            for name, report in reports.items():
                variant = 'vulnerable' if name == 'vulnerable' else 'fixed'
                assert report['sources'][0]['content'].encode() == archive.read(prefix + f'sources/{variant}/EffectVault.sol')
            readme = archive.read(prefix + 'README.md').decode()
            distribution = json.loads(archive.read(prefix + 'distribution.json'))
            assert distribution['installation_url'] in readme
            assert distribution['privacy_policy_url'] in readme
        print(f'Passed: {len(source["files"])} source files, {len(judge["files"])} judge files, exact fixture pairing and byte-identical repack.')


if __name__ == '__main__':
    main()
