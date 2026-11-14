#!/usr/bin/env python3
"""Validate current/historical report contracts; optionally use a local official SARIF schema."""
import argparse
import json
from pathlib import Path
try:
    from jsonschema import Draft202012Validator, Draft7Validator, FormatChecker
    from referencing import Registry, Resource
except ImportError as error:
    raise SystemExit('Optional validation needs Python jsonschema (and its referencing dependency).') from error

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sarif-schema',type=Path,help='Locally saved official OASIS SARIF 2.1.0 JSON schema; no network fetch is performed')
    args=parser.parse_args()
    schemas={f'report-v{version}.schema.json':json.loads((ROOT/f'contracts/report-v{version}.schema.json').read_text()) for version in [1,2,3]}
    registry=Registry().with_resources((name,Resource.from_contents(schema)) for name,schema in schemas.items())
    bundle_validator=Draft202012Validator(json.loads((ROOT/'contracts/scan-bundle-v1.schema.json').read_text()),registry=registry)
    bundles=sorted((ROOT/'reports').rglob('*.omniguard.json'))
    for file in bundles: bundle_validator.validate(json.loads(file.read_text()))
    reports=0
    for file in sorted((ROOT/'reports/benchmarks').rglob('*.json')):
        data=json.loads(file.read_text())
        if isinstance(data,dict) and data.get('schema_version') in [1,2,3] and 'engine_version' in data:
            Draft202012Validator(schemas[f'report-v{data["schema_version"]}.schema.json']).validate(data)
            reports+=1
    sarif_files=[]
    if args.sarif_schema:
        validator=Draft7Validator(json.loads(args.sarif_schema.read_text()),format_checker=FormatChecker())
        sarif_files=sorted((ROOT/'reports').rglob('*.sarif'))
        for file in sarif_files: validator.validate(json.loads(file.read_text()))
    print(f'Validated {len(bundles)} current/historical bundles, {reports} standalone reports, {len(sarif_files)} SARIF reports.')
if __name__=='__main__': main()
