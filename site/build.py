#!/usr/bin/env python3
"""Build the static judge guide and exact downloadable fixtures. No network or secrets."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'site/dist')
    args = parser.parse_args()
    output = args.output.resolve()
    config = json.loads((ROOT / 'docs/distribution.json').read_text())
    assert urlparse(config['installation_url']).hostname == 'developer.atlassian.com'
    assert urlparse(config['privacy_policy_url']).scheme == 'https'
    page = (ROOT / 'site/index.html').read_text()
    page = page.replace('@@INSTALL@@', html.escape(config['installation_url'], quote=True))
    page = page.replace('@@PRIVACY@@', html.escape(config['privacy_policy_url'], quote=True))
    assert '@@' not in page
    assert '<script' not in page.lower() and '<form' not in page.lower()
    (output / 'assets').mkdir(parents=True, exist_ok=True)
    downloads = output / 'downloads'
    downloads.mkdir(exist_ok=True)
    (output / 'index.html').write_text(page)
    shutil.copyfile(ROOT / 'site/style.css', output / 'style.css')
    shutil.copyfile(ROOT / 'docs/evidence/production-jira-completed.png', output / 'assets/production-jira-completed.png')
    shutil.copyfile(ROOT / 'docs/evidence/transfers-2026-11-17/transfer-demo-frame.jpg', output / 'assets/transfer-demo-frame.jpg')
    for name in ('vulnerable', 'fixed-source-only', 'fixed'):
        shutil.copyfile(ROOT / f'reports/judge/{name}.omniguard.json', downloads / f'{name}.omniguard.json')
    with tempfile.TemporaryDirectory(prefix='omniguard-site-pack-') as temporary:
        bundle_dir = Path(temporary) / 'release'
        subprocess.run([sys.executable, str(ROOT / 'scripts/package-release.py'), '--output', str(bundle_dir)], check=True, capture_output=True)
        shutil.copyfile(bundle_dir / 'omniguard-0.1.4-judge-fixtures.zip', downloads / 'omniguard-0.1.4-judge-fixtures.zip')
    sums = [f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}' for p in sorted(downloads.iterdir()) if p.name != 'SHA256SUMS']
    (downloads / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
    print(f'Built static guide and {len(sums)} checked downloads at {output}')


if __name__ == '__main__':
    main()
