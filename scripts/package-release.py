#!/usr/bin/env python3
"""Create deterministic local source/judge packs; never deploy or publish."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tomllib
import zipfile


ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = ['.gitignore', '.editorconfig', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'LICENSE', 'README.md', 'SPEC.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md']
ROOT_DIRS = ['.github', 'contracts', 'crates', 'dashboard', 'docs', 'fixtures', 'integrations', 'reports', 'scripts', 'site', 'postman', 'secure-comms']
SKIP_DIRS = {'.git', '.forge', 'node_modules', 'target', 'out', 'cache', 'dist', '__pycache__'}
SUFFIXES = {'.md', '.toml', '.lock', '.rs', '.json', '.schema', '.sol', '.py', '.js', '.mjs', '.jsx',
            '.css', '.html', '.yml', '.yaml', '.jpg', '.jpeg', '.png', '.svg', '.sha256', '.sarif', '.txt'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_regular(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f'Expected a regular source file: {path}')
    return path.read_bytes()


def source_files():
    result = {name: read_regular(ROOT / name) for name in ROOT_FILES}
    for name in ROOT_DIRS:
        for directory, dirs, files in os.walk(ROOT / name, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            for sub in dirs:
                if (Path(directory) / sub).is_symlink():
                    raise ValueError(f'Source directory is a symlink: {sub}')
            for filename in sorted(files):
                path = Path(directory) / filename
                relative = path.relative_to(ROOT).as_posix()
                if filename.startswith('.env') or filename == '.npmrc' or path.suffix == '.log':
                    continue
                if relative in {'integrations/atlassian-forge/static/app/main.js', 'integrations/atlassian-forge/static/app/frontline.js', 'integrations/atlassian-bitbucket/static/app/main.js'}:
                    continue  # Rebuild from the locked package, never include a stale bundle.
                if path.suffix not in SUFFIXES:
                    raise ValueError(f'Unreviewed release file type: {relative}')
                result[relative] = read_regular(path)
    return dict(sorted(result.items()))


def manifest(files, version, kind):
    entries = [{'path': name, 'bytes': len(raw), 'sha256': sha(raw)} for name, raw in sorted(files.items())]
    canonical = json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()
    return (json.dumps({'schema_version': 1, 'engine_version': version, 'kind': kind,
                        'artifact_scope': 'deterministic source/judge package; hosting and Forge acceptance are documented separately',
                        'snapshot_sha256': sha(canonical), 'files': entries}, indent=2) + '\n').encode()


def tar_archive(path, prefix, files):
    with path.open('xb') as target, gzip.GzipFile(filename='', fileobj=target, mode='wb', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as archive:
            for name, raw in sorted(files.items()):
                item = tarfile.TarInfo(f'{prefix}/{name}')
                item.size, item.mtime, item.mode = len(raw), 0, 0o644
                item.uid = item.gid = 0
                item.uname = item.gname = ''
                archive.addfile(item, io.BytesIO(raw))


def zip_archive(path, prefix, files):
    with zipfile.ZipFile(path, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, raw in sorted(files.items()):
            item = zipfile.ZipInfo(f'{prefix}/{name}', date_time=(1980, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.create_system = 3
            item.external_attr = 0o100644 << 16
            archive.writestr(item, raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory outside the source repository')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Keep release outputs outside the source repository')
    version = tomllib.loads((ROOT / 'Cargo.toml').read_text())['workspace']['package']['version']
    files = source_files()
    judge = {'README.md': files['docs/judge-pack.md'],
             'distribution.json': files['docs/distribution.json'],
             'PROVENANCE.json': files['reports/judge/provenance.json']}
    for variant in ['vulnerable', 'fixed-source-only', 'fixed']:
        report_name = f'reports/judge/{variant}.omniguard.json'
        source_variant = 'vulnerable' if variant == 'vulnerable' else 'fixed'
        source_name = f'fixtures/effect-vault/{source_variant}/src/EffectVault.sol'
        report = json.loads(files[report_name])
        if report['report']['engine_version'] != version:
            raise ValueError('Judge report engine does not match the source release')
        if len(report['sources']) != 1 or report['sources'][0]['content'].encode() != files[source_name]:
            raise ValueError('Judge report does not match its exact source file')
        judge[f'reports/{variant}.omniguard.json'] = files[report_name]
        judge[f'sources/{source_variant}/EffectVault.sol'] = files[source_name]
    source_manifest, judge_manifest = manifest(files, version, 'source'), manifest(judge, version, 'judge fixtures')
    output.mkdir(parents=True, exist_ok=False)
    source_name, judge_name = f'omniguard-{version}-source.tar.gz', f'omniguard-{version}-judge-fixtures.zip'
    tar_archive(output / source_name, f'omniguard-{version}', {**files, 'SOURCE-MANIFEST.json': source_manifest})
    zip_archive(output / judge_name, f'omniguard-{version}-judge', {**judge, 'JUDGE-MANIFEST.json': judge_manifest})
    (output / 'SOURCE-MANIFEST.json').write_bytes(source_manifest)
    (output / 'JUDGE-MANIFEST.json').write_bytes(judge_manifest)
    checksums = '\n'.join(f'{sha((output / name).read_bytes())}  {name}'
                          for name in [source_name, judge_name, 'SOURCE-MANIFEST.json', 'JUDGE-MANIFEST.json']) + '\n'
    (output / 'SHA256SUMS').write_text(checksums)
    print(json.dumps({'output': str(output), 'source_files': len(files), 'source_bytes': sum(map(len, files.values())),
                      'source_snapshot_sha256': json.loads(source_manifest)['snapshot_sha256'],
                      'source_archive': source_name, 'judge_archive': judge_name}, indent=2))


if __name__ == '__main__':
    main()
