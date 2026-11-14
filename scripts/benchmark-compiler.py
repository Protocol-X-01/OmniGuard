#!/usr/bin/env python3
"""Measure compiler facts on frozen authored challenges and the existing corpus."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]

def scan(scanner, fixture, compiler=None):
    command=[str(scanner),'scan',str(fixture),'--format','json']
    if compiler: command += ['--solc',str(compiler)]
    result=subprocess.run(command,cwd=ROOT,text=True,capture_output=True,timeout=70)
    if result.returncode: raise RuntimeError(f'Scan failed ({result.returncode}): {result.stderr or result.stdout[:1800]}')
    report=json.loads(result.stdout)
    if not report['coverage']['complete']: raise RuntimeError(f'Incomplete scan: {report["diagnostics"]}')
    return report

def outcomes(manifest, report):
    cases=[]
    for case in manifest['cases']:
        actual=sorted(f['rule_id'] for f in report['findings'] if f['location']['file']==case['path'])
        expected=sorted(case['expected'])
        cases.append({'path':case['path'],'expected':expected,'actual':actual,'matches':Counter(expected)==Counter(actual)})
    return cases

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scanner',type=Path,default=ROOT/'target/release/omniguard')
    parser.add_argument('--solc',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'reports/benchmarks/compiler-facts')
    args=parser.parse_args()
    args.scanner=args.scanner.resolve(); args.solc=args.solc.resolve()
    output=args.output.resolve(); output.mkdir(parents=True,exist_ok=True)
    fixture=ROOT/'fixtures/semantic-challenges'
    manifest=json.loads((fixture/'manifest.json').read_text())
    corpus=json.loads((ROOT/'fixtures/rule-corpus/manifest.json').read_text())
    source=scan(args.scanner,fixture)
    semantic=scan(args.scanner,fixture,args.solc)
    previous=scan(args.scanner,ROOT/'fixtures/rule-corpus',args.solc)
    digest=hashlib.sha256()
    digest.update((fixture/'manifest.json').read_bytes())
    for file in sorted((fixture/'src').rglob('*.sol')):
        digest.update(file.relative_to(fixture/'src').as_posix().encode()); digest.update(b'\0'); digest.update(file.read_bytes())
    records={'source':outcomes(manifest,source),'solc':outcomes(manifest,semantic),'previous_corpus_solc':outcomes(corpus,previous)}
    summary={'measured_at':datetime.now(timezone.utc).isoformat(),'engine':semantic['engine_version'],'analysis':semantic['analysis'],'challenge_sha256':digest.hexdigest(),'challenge_cases':len(manifest['cases']),'previous_corpus_cases':len(corpus['cases']),'method':manifest['method'],'mismatches':{name:sum(not c['matches'] for c in cases) for name,cases in records.items()},'cases':records}
    for name,report in [('source',source),('solc',semantic),('previous-corpus-solc',previous)]: (output/f'{name}.json').write_text(json.dumps(report,indent=2)+'\n')
    (output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    lines=['# Compiler facts: controlled challenge results','',f'Engine **{summary["engine"]}**. Native compiler **{semantic["analysis"]["compiler_version"]}**. Challenge SHA-256 `{summary["challenge_sha256"]}`.','',manifest['method'],'','| Challenge | Expected | Source mode | Compiler-assisted mode |','| --- | --- | --- | --- |']
    for src,sol in zip(records['source'],records['solc']): lines.append(f'| {src["path"]} | {", ".join(src["expected"]) or "none"} | {", ".join(src["actual"]) or "none"} | {", ".join(sol["actual"]) or "none"} |')
    lines += ['',f'Exact challenge mismatches: source **{summary["mismatches"]["source"]}**, compiler-assisted **{summary["mismatches"]["solc"]}**. Existing **{summary["previous_corpus_cases"]}**-case corpus under compiler mode: **{summary["mismatches"]["previous_corpus_solc"]}** mismatches.','','These are authored development examples. They do not establish production accuracy or superiority over another analyzer. Compiler resolution improves declaration/type identity; the vulnerability rules still use bounded local reasoning.','','Reproduce: `python3 scripts/benchmark-compiler.py --solc /path/to/native/solc`. Raw reports and per-case outcomes are beside this file.']
    (output/'summary.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'cases':summary['challenge_cases'],'mismatches':summary['mismatches'],'compiler':semantic['analysis']['compiler_version']}))
    if summary['mismatches']['solc'] or summary['mismatches']['previous_corpus_solc']: raise SystemExit(1)
if __name__=='__main__': main()
