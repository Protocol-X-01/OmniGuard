#!/usr/bin/env python3
"""Generate bounded project claims for README, guide, Devpost and demo notes."""
import argparse
import html
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/Protocol-X-01/OmniGuard/blob/main/'
START = '<!-- project-status:start -->'
END = '<!-- project-status:end -->'


def region(text, body):
    if text.count(START) != 1 or text.count(END) != 1:
        raise ValueError('Expected one generated project-status region')
    before, rest = text.split(START)
    _, after = rest.split(END)
    return before + START + '\n' + body.rstrip() + '\n' + END + after


def generate():
    data = json.loads((ROOT / 'docs/project-status.json').read_text())
    assert data['schema_version'] == 1
    allowed = {'Production acceptance', 'Forge development acceptance', 'Local browser acceptance', 'Local fixture acceptance'}
    for c in data['capabilities']:
        assert c['stage'] in allowed and c['limit'] and c['date']
        p = Path(c['evidence'])
        assert not p.is_absolute() and '..' not in p.parts and (ROOT / p).is_file()
    rows = ['| Capability | Dated evidence | Boundary |', '| --- | --- | --- |']
    for c in data['capabilities']:
        rows.append(f"| {c['name']} | [{c['stage']} · {c['date']}]({REPO}{c['evidence']}) | {c['limit']} |")
    table = '\n'.join(rows)
    intro = f"Updated **{data['updated']}**. These are dated acceptance records, not continuous monitoring of hosted services. Source publication does not promote development or local features to production."
    next_items = '\n\n'.join(f"{i}. **{n['name']}** — {n['benefit']} Acceptance: {n['acceptance']}" for i,n in enumerate(data['next'],1))
    status = f"# Project status\n\n{intro}\n\n{table}\n\n## Next team priorities\n\nAll five are planned. Proposed roles in the [roadmap](team-product-roadmap.md) are not assigned people.\n\n{next_items}\n\n## Keep publication in step\n\nEdit `docs/project-status.json`, run `python3 scripts/sync-project-status.py`, then run `--check` in review. CI checks the README, static guide, submission copy and video notes against this record.\n\nA release is synchronized only after tests and the PR pass, the hosted guide serves the intended commit, and the saved Devpost/YouTube changes are read back. Keep the publication receipt separate from feature acceptance; record pending work honestly. Do not rewrite historical tags or imply a production rollout from a documentation update.\n\nCurrent demo: [{data['demo_scope']}]({data['demo_url']}).\n"
    readme = region((ROOT/'README.md').read_text(), f"## Current availability\n\n{intro}\n\n{table}\n\n[Next priorities and release checklist](docs/project-status.md)")
    cards = ''.join(f'<article><p class="eyebrow">{html.escape(c["stage"])} · {c["date"]}</p><h3>{html.escape(c["name"])}</h3><p>{html.escape(c["summary"])}</p><p class="fine">{html.escape(c["limit"])}</p><a href="{REPO}{c["evidence"]}">Read the evidence ↗</a></article>' for c in data['capabilities'])
    section = f'<section class="wrap section" id="status" aria-labelledby="status-title"><p class="eyebrow">Project update · {data["updated"]}</p><h2 id="status-title">One team. Clear handoffs.</h2><p class="section-intro">See what is accepted, where it runs and what remains to be built. Published source is separate from production availability.</p><div class="status-grid">{cards}</div><p><a href="{REPO}docs/project-status.md">Next priorities and release checklist ↗</a></p></section>'
    site = region((ROOT/'site/index.html').read_text(),section)
    bullets = '\n'.join(f"- **{c['name']} — {c['stage'].lower()} ({c['date']}).** {c['summary']} {c['limit']} [Evidence]({REPO}{c['evidence']})." for c in data['capabilities'])
    template = (ROOT/'docs/publication/devpost-story.template.md').read_text()
    story = template.replace('@@CAPABILITIES@@',bullets).replace('@@DATE@@',data['updated']).replace('@@DEMO@@',data['demo_url'])
    assert '@@' not in story
    description = f"OmniGuard — evidence, remediation and team handoffs\n\nProject update: {data['updated']}. {data['demo_scope']}. Mellow US synthetic narration; no voice cloning.\n\n" + '\n\n'.join(f"{c['name']} ({c['stage']}, {c['date']}): {c['summary']} {c['limit']}" for c in data['capabilities']) + f"\n\nGuide and installer: https://omniguard-n5h9.onrender.com/\nSource: https://github.com/Protocol-X-01/OmniGuard\nStatus and reproducible evidence: {REPO}docs/project-status.md\nCodegeist entry: https://devpost.com/software/omniguard-z1pmcg\n\nAll demonstrations use authorized synthetic fixtures. No live-chain transactions. The video uses genuine recorded UI, dated evidence and scene cuts; it is not a real-time performance benchmark. The local messaging lab must not be used for real incident data.\n"
    return {'docs/project-status.md':status,'README.md':readme,'site/index.html':site,'docs/publication/devpost-story.md':story,'docs/publication/video-description.txt':description}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    stale=[]
    for name, content in generate().items():
        p=ROOT/name
        if not p.exists() or p.read_text()!=content:
            stale.append(name)
            if not args.check: p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
    if args.check and stale:
        print('Project claims have drifted: '+', '.join(stale),file=sys.stderr);return 1
    print('Project status is consistent.' if args.check else f'Updated {len(stale)} publication files.');return 0


if __name__=='__main__':
    raise SystemExit(main())
