import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = JSON.parse(await readFile(path.join(root, 'contracts/frontline-checks-v1.json')));
const arg = process.argv.indexOf('--at');
const outputArg = process.argv.indexOf('--out');
if (arg < 0 && outputArg < 0) throw new Error('Use --at 1794673200 for the frozen corpus, or --out <directory> for fresh preview fixtures.');
const at = arg >= 0 ? Number(process.argv[arg + 1]) : Math.floor(Date.now() / 1000) - 60;
if (!Number.isSafeInteger(at) || at < 60) throw new Error('Provide an epoch time.');
const directory = outputArg >= 0 ? path.resolve(process.argv[outputArg + 1]) : path.join(root, 'fixtures/frontline');
await mkdir(directory, { recursive: true });
for (const [name, sequence] of [['team-risk', 1], ['team-retest', 2]]) {
  const captured = at + (sequence - 1) * 30;
  const intake = { schema_version: 1, isolated_fixture: true, engagement_id: 'team-engagement-fixture', name: 'Team engagement exercise', sequence,
    entries: checks.map((check, i) => ({ id: `entry-${i + 1}`, name: ['Urgent access request', 'External evidence handoff', 'Response team handover', 'Responder account', 'Responder workstation'][i],
      owner: ['Service desk', 'Case owner', 'Response lead', 'Identity team', 'Device team'][i], check_id: check.id,
      evidence: { id: `observation-${sequence}-${i}`, source: 'synthetic_fixture', captured_at: captured, expires_at: captured + 86400,
        facts: Object.fromEntries(check.facts.map((k, j) => [k, sequence === 2 || j !== 0])) } })),
  };
  intake.entries.push({ id: 'unknown-integration', name: 'New external collaboration tool', owner: 'Platform team', check_id: 'OG-FUTURE-001', evidence: null },
    { id: 'awaiting-intake', name: 'New service-desk report', owner: 'Service desk', check_id: 'OG-TEAM-001', evidence: null });
  const input = path.join(directory, `${name}.intake.json`);
  await writeFile(input, JSON.stringify(intake, null, 2) + '\n');
  const run = spawnSync(path.join(root, 'target/debug/omniguard-frontline'), [input, '--at', String(captured), '--output', path.join(directory, `${name}.bundle.json`)], { encoding: 'utf8', timeout: 10000 });
  if (![0, 1, 2].includes(run.status) || run.stderr || run.error) throw new Error(run.stderr || String(run.error));
}
console.log('Generated two native frontline fixture bundles. Unsupported and unassessed entries deliberately remain visible.');
